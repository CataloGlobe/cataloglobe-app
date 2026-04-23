import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { resendConfirmationEmail } from "@/services/supabase/auth";
import Text from "@/components/ui/Text/Text";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import styles from "./Auth.module.scss";

const RESEND_COOLDOWN = 30;

function isRateLimitError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("too many") || m.includes("rate limit") || m.includes("too_many_requests");
}

type LocationState = {
    email?: string;
};

export default function CheckEmail() {
    usePageTitle("Controlla Email");
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as LocationState | null;
    const email = state?.email;

    const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendDone, setResendDone] = useState(false);
    const [resendRateLimited, setResendRateLimited] = useState(false);

    // Countdown dal mount — email appena inviata, attendere prima di reinviare
    useEffect(() => {
        if (resendSeconds <= 0) return;
        const id = setInterval(() => {
            setResendSeconds(s => s - 1);
        }, 1000);
        return () => clearInterval(id);
    }, [resendSeconds]);

    // Auto-reset "Email inviata." dopo 3s
    useEffect(() => {
        if (!resendDone) return;
        const id = setTimeout(() => setResendDone(false), 3000);
        return () => clearTimeout(id);
    }, [resendDone]);

    const handleResend = useCallback(async () => {
        if (!email || resendLoading || resendSeconds > 0) return;
        setResendLoading(true);
        setResendDone(false);
        setResendRateLimited(false);
        try {
            await resendConfirmationEmail(email);
            setResendDone(true);
            setResendSeconds(RESEND_COOLDOWN);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (isRateLimitError(message)) {
                setResendRateLimited(true);
            }
            setResendSeconds(RESEND_COOLDOWN);
        } finally {
            setResendLoading(false);
        }
    }, [email, resendLoading, resendSeconds]);

    return (
        <AuthLayout>
            <div className={styles.auth} role="status" aria-live="polite">
                <Text as="h1" variant="title-md">
                    Controlla la tua email
                </Text>

                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                    Ti abbiamo inviato un link di conferma
                    {email ? (
                        <>
                            {" "}
                            a <strong>{email}</strong>
                        </>
                    ) : null}
                    . Apri la tua casella e clicca il link per attivare l&apos;account.
                </Text>

                <Text as="p" variant="caption" colorVariant="muted">
                    Non trovi l&apos;email? Controlla lo spam o richiedi un nuovo invio.
                </Text>

                {email && (
                    <div className={styles.resendRow}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {resendDone
                                ? "Email inviata."
                                : resendRateLimited
                                  ? "Riprova tra qualche minuto."
                                  : "Non hai ricevuto nulla?"}
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
                                  ? `Invia di nuovo tra ${resendSeconds}s`
                                  : "Invia di nuovo"}
                        </button>
                    </div>
                )}

                <Text as="p" variant="caption" className={styles.hint}>
                    Hai sbagliato indirizzo?{" "}
                    <button
                        type="button"
                        className={styles.resendLink}
                        onClick={() => navigate(-1)}
                    >
                        Torna indietro
                    </button>
                </Text>
            </div>
        </AuthLayout>
    );
}
