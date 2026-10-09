import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/context/useAuth";
import { resendConfirmationEmail, verifySignupCode } from "@/services/supabase/auth";
import { Button, CodeInput, type CodeInputHandle } from "@/components/ui";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { internalPathOr } from "@/utils/internalPath";
import {
    SIGNUP_DRAFT_KEY,
    SIGNUP_EMAIL_KEY,
    clearPendingRedirect,
    peekPendingRedirect,
    readSignupDraft
} from "@/utils/pendingRedirect";
import styles from "./Auth.module.scss";

const RESEND_COOLDOWN = 30;
const CODE_LENGTH = 6;

function isRateLimitError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("too many") || m.includes("rate limit") || m.includes("too_many_requests");
}

function verifyErrorMessage(err: unknown): string {
    const { code, status, message } = (err ?? {}) as { code?: string; status?: number; message?: string };
    if (code === "otp_expired") {
        return "Codice non corretto o scaduto. Riprova.";
    }
    if (status === 429 || code === "over_request_rate_limit" || isRateLimitError(message ?? "")) {
        return "Troppi tentativi. Aspetta qualche minuto e riprova.";
    }
    return "Non siamo riusciti a controllare il codice. Riprova.";
}

type LocationState = {
    email?: string;
};

const EMAIL_KEY = SIGNUP_EMAIL_KEY;

function readStoredEmail(): string | undefined {
    try {
        return sessionStorage.getItem(EMAIL_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

function storeEmail(email: string): void {
    try {
        sessionStorage.setItem(EMAIL_KEY, email);
    } catch {
        // storage non disponibile: resta solo lo stato del router
    }
}

function forgetEmail(): void {
    try {
        sessionStorage.removeItem(EMAIL_KEY);
        sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    } catch {
        // niente da fare
    }
}

export default function CheckEmail() {
    usePageTitle("Conferma la tua email");
    const location = useLocation();
    const navigate = useNavigate();
    const { forceOtpCheck } = useAuth();
    const state = location.state as LocationState | null;
    // L'email arriva nello stato del router dalla registrazione; si tiene anche
    // in sessionStorage così un ricaricamento non toglie codice e reinvio (R8).
    const email = state?.email ?? readStoredEmail();
    useEffect(() => {
        if (state?.email) storeEmail(state.email);
    }, [state?.email]);

    const codeRef = useRef<CodeInputHandle>(null);
    const [code, setCode] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendDone, setResendDone] = useState(false);
    const [resendRateLimited, setResendRateLimited] = useState(false);
    const [resendFailed, setResendFailed] = useState(false);

    // Countdown dal mount — email appena inviata, attendere prima di reinviare
    useEffect(() => {
        if (resendSeconds <= 0) return;
        const id = setInterval(() => {
            setResendSeconds(s => s - 1);
        }, 1000);
        return () => clearInterval(id);
    }, [resendSeconds]);

    const handleVerify = useCallback(
        async (value: string) => {
            if (!email || verifying || value.length !== CODE_LENGTH) return;
            setVerifying(true);
            setVerifyError(null);
            try {
                await verifySignupCode(email, value);
                // La conferma vale come verifica OTP (trigger su auth.users):
                // si rilegge prima di entrare, così ProtectedRoute non chiede un
                // secondo codice. Senza il trigger si finisce su /verify-otp come prima.
                await forceOtpCheck();
                const target = internalPathOr(peekPendingRedirect(), "/dashboard");
                clearPendingRedirect();
                forgetEmail();
                navigate(target, { replace: true });
            } catch (err) {
                setVerifyError(verifyErrorMessage(err));
                // Codice sbagliato: si riparte da capo, senza correggere cifra per cifra.
                setCode("");
                codeRef.current?.focus();
            } finally {
                setVerifying(false);
            }
        },
        [email, verifying, forceOtpCheck, navigate]
    );

    const handleResend = useCallback(async () => {
        if (!email || resendLoading || resendSeconds > 0) return;
        setResendLoading(true);
        setResendDone(false);
        setResendRateLimited(false);
        setResendFailed(false);
        try {
            await resendConfirmationEmail(email);
            setResendDone(true);
            setVerifyError(null);
            setCode("");
            setResendSeconds(RESEND_COOLDOWN);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (isRateLimitError(message)) {
                setResendRateLimited(true);
            } else {
                setResendFailed(true);
            }
            setResendSeconds(RESEND_COOLDOWN);
        } finally {
            setResendLoading(false);
        }
    }, [email, resendLoading, resendSeconds]);

    if (!email) {
        // Pagina aperta senza passare dalla registrazione (o storage svuotato):
        // senza email il codice non si può controllare, resta il link della mail.
        return (
            <AuthLayout
                icon={<MailCheck size={28} aria-hidden="true" />}
                heading="Conferma la tua email"
                lead="Apri la mail che ti abbiamo mandato e tocca il link: entri subito."
            >
                <div className={styles.links}>
                    <p>
                        Hai già confermato?{" "}
                        <Link to="/login" className={styles.textLink}>
                            Accedi
                        </Link>
                    </p>
                </div>
            </AuthLayout>
        );
    }

    // Una riga sola, sotto le caselle: errore o conferma del reinvio. Lo spazio
    // è sempre lì, così il messaggio non sposta la scheda mentre la guardi.
    const codeMessage = verifyError ?? (resendDone ? "Nuovo codice inviato: vale solo l'ultimo." : null);

    // Il link c'è sempre (anche durante l'attesa, spento): cambia solo il
    // testo intorno, nello stesso carattere delle altre righe.
    const resendLead = resendRateLimited
        ? "Troppe richieste."
        : resendFailed
          ? "Invio non riuscito."
          : "Non è arrivata? Guarda nello spam o";
    const resendLine: ReactNode = (
        <>
            {resendLead}{" "}
            <button
                type="button"
                className={styles.textLink}
                disabled={resendSeconds > 0 || resendLoading}
                onClick={handleResend}
            >
                {resendLoading ? "invio in corso…" : resendFailed || resendRateLimited ? "riprova" : "invia di nuovo"}
            </button>
            {resendSeconds > 0 && !resendLoading && <span className={styles.wait}> tra {resendSeconds} s</span>}
        </>
    );

    return (
        <AuthLayout
            icon={<MailCheck size={28} aria-hidden="true" />}
            heading="Conferma la tua email"
            lead={<>Ti abbiamo mandato un codice a <strong>{email}</strong>.</>}
        >
            <div className={styles.auth}>
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void handleVerify(code);
                    }}
                >
                    <CodeInput
                        ref={codeRef}
                        id="signup-code"
                        label="Codice di 6 cifre"
                        length={CODE_LENGTH}
                        value={code}
                        onChange={value => {
                            setCode(value);
                            if (value) setVerifyError(null);
                        }}
                        onComplete={value => void handleVerify(value)}
                        disabled={verifying}
                        invalid={!!verifyError}
                        describedBy={codeMessage ? "signup-code-message" : undefined}
                        autoFocus
                    />

                    <p
                        id="signup-code-message"
                        className={verifyError ? `${styles.codeMessage} ${styles.codeMessageError}` : styles.codeMessage}
                        role={verifyError ? "alert" : "status"}
                    >
                        {codeMessage}
                    </p>

                    {/* Con 6 cifre il codice parte da solo: il bottone serve solo
                        mentre controlla, o per riprovare lo stesso codice. */}
                    {(verifying || code.length === CODE_LENGTH) && (
                        <Button type="submit" variant="primary" fullWidth loading={verifying} disabled={verifying}>
                            Conferma e continua
                        </Button>
                    )}
                </form>

                <div className={styles.links}>
                    <p role="status" aria-live="polite">
                        {resendLine}
                    </p>
                    <p>
                        Email sbagliata?{" "}
                        <button
                            type="button"
                            className={styles.textLink}
                            onClick={() => navigate("/sign-up", { state: { draft: readSignupDraft() ?? { firstName: "", lastName: "", email, phone: "" } } })}
                        >
                            Correggila
                        </button>
                    </p>
                    <p>
                        Hai già un account?{" "}
                        <Link to="/login" className={styles.textLink}>
                            Accedi
                        </Link>
                    </p>
                </div>
            </div>
        </AuthLayout>
    );
}
