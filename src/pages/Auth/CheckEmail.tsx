import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/context/useAuth";
import { resendConfirmationEmail, verifySignupCode } from "@/services/supabase/auth";
import { Button, CodeInput, InlineBanner, type CodeInputHandle } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { internalPathOr } from "@/utils/internalPath";
import { SIGNUP_EMAIL_KEY, clearPendingRedirect, peekPendingRedirect } from "@/utils/pendingRedirect";
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
        return "Codice non corretto o scaduto. Riscrivilo, oppure chiedine uno nuovo.";
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
                <div className={styles.auth}>
                    <Text as="p" variant="caption" className={styles.hint}>
                        Hai già confermato? <Link to="/login">Accedi</Link>
                    </Text>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            icon={<MailCheck size={28} aria-hidden="true" />}
            heading="Conferma la tua email"
            lead={<>Ti abbiamo mandato un codice di 6 cifre e un link a <strong>{email}</strong>. Usa quello che ti è più comodo.</>}
        >
            <div className={styles.auth}>

                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        void handleVerify(code);
                    }}
                >
                    {verifyError && (
                        <div id="signup-code-error">
                            <InlineBanner variant="error">{verifyError}</InlineBanner>
                        </div>
                    )}
                    {resendDone && !verifyError && (
                        <InlineBanner variant="info">
                            Nuovo codice inviato. Vale solo l&apos;ultimo che hai ricevuto.
                        </InlineBanner>
                    )}

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
                        describedBy={verifyError ? "signup-code-error" : undefined}
                        autoFocus
                    />

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        loading={verifying}
                        disabled={verifying || code.length !== CODE_LENGTH}
                    >
                        Conferma e continua
                    </Button>
                </form>

                <div className={styles.resendRow} role="status" aria-live="polite">
                    <Text as="span" variant="caption" colorVariant="muted">
                        {resendRateLimited
                            ? "Riprova tra qualche minuto."
                            : resendFailed
                              ? "Invio non riuscito, riprova."
                              : "Non è arrivata? Controlla lo spam, oppure"}
                    </Text>
                    <button
                        type="button"
                        className={styles.resendLink}
                        disabled={resendSeconds > 0 || resendLoading}
                        onClick={handleResend}
                    >
                        {resendLoading
                            ? "Invio..."
                            : resendSeconds > 0
                              ? `invia di nuovo tra ${resendSeconds}s`
                              : "invia di nuovo"}
                    </button>
                </div>

                <Text as="p" variant="caption" className={styles.hint}>
                    Email sbagliata?{" "}
                    <button type="button" className={styles.resendLink} onClick={() => navigate("/sign-up")}>
                        Correggila
                    </button>
                </Text>
                <Text as="p" variant="caption" className={styles.hint}>
                    Hai già un account? <Link to="/login">Accedi</Link>
                </Text>
            </div>
        </AuthLayout>
    );
}
