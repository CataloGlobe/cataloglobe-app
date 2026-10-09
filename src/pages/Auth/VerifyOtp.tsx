import {
    useState,
    useEffect,
    useRef,
    type KeyboardEvent,
    type ClipboardEvent,
    type FormEvent,
    useCallback
} from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate, useLocation } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import type { OtpStatus, VerifyOtpResponse } from "@/types/otp";
import { readVerifyOtpError } from "@/utils/otpErrors";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { internalPathOr } from "@/utils/internalPath";
import { clearPendingRedirect, peekPendingRedirect } from "@/utils/pendingRedirect";
import styles from "./Auth.module.scss";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

/**
 * Esito classificato di una chiamata a `send-otp`.
 * - `wait`: attesa legittima (429) → messaggio informativo, il codice può ancora arrivare.
 * - `unauthorized`: sessione non valida (401) → redirect al login.
 * - `error`: guasto reale (5xx o fetch fallita) → messaggio di errore esplicito.
 */
type SendOtpFailure =
    | { family: "wait"; code: "cooldown" | "rate_limited" | "locked" }
    | { family: "unauthorized" }
    | { family: "error" };

/**
 * Esito dell'ultimo invio, tracciato per tenere il sottotitolo della pagina
 * coerente con quanto è realmente successo.
 *
 * `status` non basta: distingue solo sending/verifying/idle, e `error` è
 * condiviso con gli errori di verifica del codice — nessuno dei due dice se
 * l'email è partita.
 *
 * - `idle`: nessun invio in questa sessione di pagina (es. arrivo in cooldown,
 *   il codice era già stato inviato prima).
 * - `sending` / `sent` / `failed`: esito dell'invio corrente.
 * - `waiting`: 429, un codice precedente è già stato inviato ed è ancora valido.
 */
type SendOutcome = "idle" | "sending" | "sent" | "waiting" | "failed";

/**
 * Sottotitolo della schermata, coerente con l'esito reale dell'invio.
 *
 * L'indirizzo resta visibile in ogni stato in cui è noto: serve all'utente per
 * capire su quale account sta operando. Finché `userEmail` non è caricato ogni
 * stato ha una frase propria — interpolare un fallback dentro "a {…}"
 * sgrammaticherebbe la frase.
 *
 * Nello stato `failed` nessuna delle due varianti afferma che l'email sia
 * partita: sotto questa riga compare l'errore che dice il contrario.
 */
function buildSendStatusCopy(outcome: SendOutcome, email: string | null) {
    if (!email) {
        switch (outcome) {
            case "sending":
                return "Stiamo inviando un codice di verifica via email.";
            case "waiting":
                return "Un codice di verifica è già stato inviato via email.";
            case "failed":
                return "Stai accedendo al tuo account.";
            default:
                return "Ti abbiamo inviato un codice di verifica via email.";
        }
    }

    const target = <strong>{email}</strong>;

    switch (outcome) {
        case "sending":
            return <>Stiamo inviando un codice di verifica a {target}.</>;
        case "waiting":
            return <>Un codice di verifica è già stato inviato a {target}.</>;
        case "failed":
            return <>Stai accedendo come {target}.</>;
        default:
            return <>Ti abbiamo inviato un codice di verifica a {target}.</>;
    }
}

/**
 * Classifica l'errore di `supabase.functions.invoke("send-otp")`.
 *
 * NB: su risposta non-2xx supabase-js incapsula tutto in `FunctionsHttpError`,
 * il cui `message` è generico ("Edge Function returned a non-2xx status code"):
 * l'error code applicativo va letto dal body della Response su `error.context`.
 */
async function classifySendOtpError(error: unknown): Promise<SendOtpFailure> {
    if (!(error instanceof FunctionsHttpError)) {
        // FunctionsFetchError (rete/CORS), FunctionsRelayError o errore sconosciuto.
        return { family: "error" };
    }

    const status = error.context.status;

    let code: string | null = null;
    try {
        const body = (await error.context.clone().json()) as { error?: unknown };
        if (typeof body?.error === "string") code = body.error;
    } catch {
        // body assente o non JSON: ci basiamo sullo status
    }

    if (status === 401 || code === "unauthorized") return { family: "unauthorized" };

    if (status === 429) {
        if (code === "cooldown" || code === "rate_limited" || code === "locked") {
            return { family: "wait", code };
        }
        return { family: "wait", code: "rate_limited" };
    }

    // 5xx (server_misconfigured, db_error, email_send_failed) e ogni altro status
    return { family: "error" };
}

// Probe diagnostico: tipo di navigazione corrente del documento.
// Serve a distinguere bootstrap normale ("navigate") da reload causato
// da tab-discard/freeze del browser ("reload" / "back_forward").
function getNavigationType(): string | null {
    try {
        const entries = performance.getEntriesByType("navigation");
        const nav = entries[0] as PerformanceNavigationTiming | undefined;
        return nav?.type ?? null;
    } catch {
        return null;
    }
}

export default function VerifyOtp() {
    usePageTitle('Verifica OTP');
    const { forceOtpCheck } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const fromState = (location.state as { from?: string } | null)?.from;
    // Senza deep link nello stato, quello salvato prima della registrazione (invito).
    const redirectAfterOtp = internalPathOr(fromState ?? peekPendingRedirect(), '/dashboard');

    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [resendSeconds, setResendSeconds] = useState<number | null>(null);
    const [status, setStatus] = useState<OtpStatus>("idle");
    const [sendOutcome, setSendOutcome] = useState<SendOutcome>("idle");
    const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
    const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
    const [locked, setLocked] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
    const hasRequestedOtpRef = useRef(false);
    // Esito dell'ultimo status-otp: c'è già un codice valido (o il blocco)?
    // Serve all'invio automatico per non bruciare un codice ancora buono.
    const activeCodeRef = useRef(false);

    const { showToast } = useToast();

    const sendOtp = useCallback(async () => {
        try {
            setLoading(true);
            setStatus("sending");
            setSendOutcome("sending");
            setError(null);
            setInfo(null);

            const { data } = await supabase.auth.getSession();
            const jwt = data.session?.access_token;

            if (!jwt) {
                navigate("/login", { replace: true });
                return;
            }

            const { data: sendData, error } = await supabase.functions.invoke("send-otp", {
                headers: { Authorization: `Bearer ${jwt}` },
                body: { navigation_type: getNavigationType() }
            });

            // Già verificato: nessun codice è partito, si entra.
            if (!error && (sendData as { already_verified?: boolean } | null)?.already_verified) {
                await forceOtpCheck();
                navigate(redirectAfterOtp, { replace: true });
                return;
            }

            if (error) {
                const failure = await classifySendOtpError(error);

                if (failure.family === "unauthorized") {
                    navigate("/login", { replace: true });
                    return;
                }

                if (failure.family === "wait") {
                    // Attesa legittima: il codice può ancora arrivare, non è un guasto.
                    const message =
                        failure.code === "cooldown"
                            ? "Attendi qualche secondo prima di richiedere un nuovo codice."
                            : "Hai fatto troppe richieste. Riprova più tardi.";

                    setSendOutcome("waiting");
                    showToast({ type: "error", message, duration: 2500 });
                    setError(message);
                    return; // ✅ IMPORTANT: evita toast “Codice inviato”
                }

                // Guasto reale (5xx o rete): niente suggerimenti di attesa, l'email
                // non è partita. Nessun dettaglio tecnico esposto all'utente.
                //
                // Nessun toast qui: il messaggio è già inline sopra il pulsante
                // Verifica, dove sta vicino all'azione e non scompare da solo.
                // Il toast resta per gli altri esiti (429 sopra, errori di verifica
                // del codice in handleVerify), che non hanno un equivalente inline
                // altrettanto visibile.
                setSendOutcome("failed");
                setError(
                    "Non siamo riusciti a inviare il codice. Riprova, e se il problema persiste contattaci."
                );
                setInfo(null);

                return; // ✅ IMPORTANT: evita toast “Codice inviato”
            }

            // ✅ solo se OK
            setSendOutcome("sent");
            showToast({ type: "info", message: "Codice inviato.", duration: 2500 });
            setInfo("Codice inviato.");
            setResendSeconds(RESEND_COOLDOWN);
        } finally {
            setLoading(false);
            setStatus("idle");
        }
    }, [navigate, showToast, forceOtpCheck, redirectAfterOtp]);

    const loadOtpStatus = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) return;

        const { data: status, error } = await supabase.functions.invoke("status-otp", {
            headers: { Authorization: `Bearer ${jwt}` }
        });

        if (error || !status) {
            // Stato illeggibile: si sblocca comunque la pagina (invio automatico
            // e «Invia di nuovo»). Se un codice c'è già, send-otp risponde 429
            // e la pagina mostra l'attesa invece di restare ferma.
            activeCodeRef.current = false;
            setResendSeconds(prev => prev ?? 0);
            return;
        }

        activeCodeRef.current =
            status.locked === true ||
            (typeof status.expires_in === "number" && status.expires_in > 0);

        if (typeof status.resend_available_in === "number") {
            setResendSeconds(status.resend_available_in);
        }
        if (typeof status.attempts_left === "number") {
            setAttemptsLeft(status.attempts_left);
        }
        if (typeof status.locked === "boolean") {
            setLocked(status.locked);
        }
        if (typeof status.max_attempts === "number") {
            setMaxAttempts(status.max_attempts);
        }
    }, []);

    /* ------------------------------------------------------------------
     * OTP STATUS
     * ------------------------------------------------------------------ */
    useEffect(() => {
        void loadOtpStatus();
    }, [loadOtpStatus]);

    /* ------------------------------------------------------------------
     * FETCH EMAIL UTENTE PER IL BODY
     * ------------------------------------------------------------------ */
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserEmail(data.user?.email ?? null);
        });
    }, []);

    /* ------------------------------------------------------------------
     * INVIO OTP AUTOMATICO (UNA SOLA VOLTA)
     * ------------------------------------------------------------------ */
    useEffect(() => {
        // aspettiamo lo stato reale dal backend
        if (resendSeconds === null) return;

        // esegui una sola volta
        if (hasRequestedOtpRef.current) return;
        hasRequestedOtpRef.current = true;

        // Un codice ancora valido non si sostituisce: ricaricare la pagina o
        // aprirla in un'altra scheda non deve invalidare quello già in mail.
        if (activeCodeRef.current) {
            setSendOutcome("waiting");
            return;
        }

        // se non siamo in cooldown, inviamo OTP
        if (resendSeconds === 0) {
            (async () => {
                await sendOtp();
                await loadOtpStatus();
            })();
        }
    }, [resendSeconds, sendOtp, loadOtpStatus]);

    /* ------------------------------------------------------------------
     * COUNTDOWN REINVIO
     * ------------------------------------------------------------------ */
    useEffect(() => {
        if (resendSeconds === null || resendSeconds <= 0) return;

        const id = setInterval(() => {
            setResendSeconds(sec => (sec !== null ? sec - 1 : sec));
        }, 1000);

        return () => clearInterval(id);
    }, [resendSeconds]);

    /* ------------------------------------------------------------------
     * AUTOFOCUS
     * ------------------------------------------------------------------ */
    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    /* ------------------------------------------------------------------
     * INPUT HANDLING
     * ------------------------------------------------------------------ */
    const handleChangeDigit = (index: number, value: string) => {
        if (!/^\d?$/.test(value)) return;

        const next = [...digits];
        next[index] = value;
        setDigits(next);

        if (value && index < OTP_LENGTH - 1) {
            inputsRef.current[index + 1]?.focus();
        }

        if (next.join("").length === OTP_LENGTH) {
            void handleVerify(next.join(""));
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            if (digits[index]) {
                const next = [...digits];
                next[index] = "";
                setDigits(next);
                return;
            }
            if (index > 0) inputsRef.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!paste) return;

        const next = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < paste.length; i++) next[i] = paste[i];

        setDigits(next);
        inputsRef.current[Math.min(paste.length, OTP_LENGTH) - 1]?.focus();

        if (paste.length === OTP_LENGTH) {
            void handleVerify(paste);
        }
    };

    /* ------------------------------------------------------------------
     * VERIFICA OTP
     * ------------------------------------------------------------------ */
    async function handleVerify(codeOverride?: string) {
        if (loading) return;

        const code = codeOverride ?? digits.join("");
        if (code.length !== OTP_LENGTH) return;

        try {
            setLoading(true);
            setStatus("verifying");
            setError(null);
            showToast({
                type: "info",
                message: "Verifica in corso...",
                duration: 2500
            });
            setInfo("Verifica in corso...");

            const { data: sessionData } = await supabase.auth.getSession();
            const jwt = sessionData.session?.access_token;

            if (!jwt) {
                navigate("/login", { replace: true });
                return;
            }

            const { error } = await supabase.functions.invoke("verify-otp", {
                body: { code },
                headers: { Authorization: `Bearer ${jwt}` }
            });

            if (error) {
                const { code, response: errorResponse } = await readVerifyOtpError(error);

                switch (code) {
                    case "invalid_or_expired": {
                        const response: VerifyOtpResponse = errorResponse ?? {};
                        if (typeof response.max_attempts === "number") {
                            setMaxAttempts(response.max_attempts);
                        }
                        const attemptsLeftFromServer =
                            typeof response?.attempts_left === "number"
                                ? response.attempts_left
                                : null;

                        if (attemptsLeftFromServer !== null) {
                            setAttemptsLeft(attemptsLeftFromServer);
                        }

                        const message =
                            attemptsLeftFromServer !== null
                                ? `Codice non valido. Tentativi rimasti: ${attemptsLeftFromServer}.`
                                : "Codice non valido o scaduto.";

                        showToast({
                            type: "error",
                            message,
                            duration: 2500
                        });

                        setError(message);
                        break;
                    }

                    case "cooldown":
                        showToast({
                            type: "error",
                            message: "Attendi qualche secondo prima di riprovare.",
                            duration: 2500
                        });
                        setError("Attendi qualche secondo prima di riprovare.");
                        break;
                    case "locked":
                        showToast({
                            type: "error",
                            message: "Troppi tentativi. Riprova più tardi.",
                            duration: 2500
                        });
                        setError("Troppi tentativi. Riprova più tardi.");
                        break;
                    case "rate_limited":
                        showToast({
                            type: "error",
                            message: "Hai fatto troppe richieste. Attendi.",
                            duration: 2500
                        });
                        setError("Hai fatto troppe richieste. Attendi.");
                        break;
                    case "unauthorized":
                        navigate("/login", { replace: true });
                        return;
                    default:
                        showToast({
                            type: "error",
                            message: "Errore durante la verifica del codice.",
                            duration: 2500
                        });
                        setError("Errore durante la verifica del codice.");
                }
                await loadOtpStatus();
                return;
            }

            await forceOtpCheck();
            clearPendingRedirect();
            navigate(redirectAfterOtp, { replace: true });
        } finally {
            setLoading(false);
            setStatus("idle");
        }
    }

    /* ------------------------------------------------------------------
     * REINVIO OTP
     * ------------------------------------------------------------------ */
    async function handleResend() {
        // non fare nulla se:
        // - stiamo caricando
        // - OTP lockato
        // - countdown non ancora inizializzato
        // - countdown ancora attivo
        if (loading || locked || resendSeconds === null || resendSeconds > 0) {
            return;
        }

        hasRequestedOtpRef.current = false;
        // Invio chiesto a mano: il codice di prima non conta più come «attivo».
        activeCodeRef.current = false;

        setDigits(Array(OTP_LENGTH).fill(""));
        setInfo(null);
        setError(null);
        setAttemptsLeft(null);

        inputsRef.current[0]?.focus();

        await sendOtp();
        await loadOtpStatus();
    }

    /* ------------------------------------------------------------------ */

    return (
        <AuthLayout>
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Inserisci il codice
                </Text>
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                    {buildSendStatusCopy(sendOutcome, userEmail)}
                </Text>
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void handleVerify();
                    }}
                >
                    <span className={styles.otpLabel}>Codice a 6 cifre</span>
                    <div className={styles.otpInputs}>
                        {digits.map((digit, index) => (
                            <TextInput
                                key={index}
                                ref={el => {
                                    inputsRef.current[index] = el;
                                }}
                                className={styles.otpInput}
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                disabled={loading}
                                onChange={e => handleChangeDigit(index, e.target.value)}
                                onKeyDown={e => handleKeyDown(index, e)}
                                onPaste={index === 0 ? handlePaste : undefined}
                            />
                        ))}
                    </div>
                    {error && (
                        <Text variant="caption" colorVariant="error" className={styles.feedback}>
                            {error}
                        </Text>
                    )}
                    {info && !error && (
                        <Text variant="caption" colorVariant="info" className={styles.feedback}>
                            {info}
                        </Text>
                    )}
                    <Button
                        type="submit"
                        fullWidth
                        loading={loading}
                        disabled={locked || status === "sending" || status === "verifying"}
                    >
                        {status === "sending" ? "Invio in corso…" : "Verifica"}
                    </Button>
                </form>

                <div className={styles.otpFooter}>
                    <div className={styles.resendRow}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            Non hai ricevuto il codice?
                        </Text>
                        <button
                            type="button"
                            className={styles.resendLink}
                            disabled={loading || locked || resendSeconds === null || resendSeconds > 0}
                            onClick={handleResend}
                        >
                            {resendSeconds !== null && resendSeconds > 0
                                ? `Invialo di nuovo (${resendSeconds}s)`
                                : "Invialo di nuovo"}
                        </button>
                    </div>
                </div>

                {attemptsLeft !== null && maxAttempts !== null && attemptsLeft < maxAttempts && (
                    <Text variant="caption" colorVariant="error">
                        Tentativi disponibili: {attemptsLeft}
                    </Text>
                )}
            </div>
        </AuthLayout>
    );
}
