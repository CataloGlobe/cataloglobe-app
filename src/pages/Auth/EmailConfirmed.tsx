import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Info } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { resendConfirmationEmail } from "@/services/supabase/auth";
import { Button } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import styles from "./Auth.module.scss";

function isRateLimitError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("too many") || m.includes("rate limit") || m.includes("too_many_requests");
}

export default function EmailConfirmed() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");

    // Resend state — usato solo nello stato "error"
    const [resendEmail, setResendEmail] = useState("");
    const [resendLoading, setResendLoading] = useState(false);
    const [resendDone, setResendDone] = useState(false);
    const [resendRateLimited, setResendRateLimited] = useState(false);

    useEffect(() => {
        const verify = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session) {
                setStatus("already");
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const confirmationUrl = params.get("confirmation_url");

            if (!confirmationUrl) {
                setStatus("error");
                return;
            }

            try {
                const decoded = decodeURIComponent(confirmationUrl);
                const url = new URL(decoded);

                // Supabase può usare token o token_hash
                const tokenHash =
                    url.searchParams.get("token_hash") || url.searchParams.get("token");

                const type = url.searchParams.get("type") as
                    | "signup"
                    | "magiclink"
                    | "recovery"
                    | null;

                if (!tokenHash || !type) {
                    setStatus("error");
                    return;
                }

                const { error } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type
                });

                if (error) {
                    setStatus("error");
                } else {
                    setStatus("success");
                }
            } catch {
                setStatus("error");
            }
        };

        verify();
    }, []);

    const handleResend = useCallback(async () => {
        if (!resendEmail.trim() || resendLoading) return;
        setResendLoading(true);
        setResendDone(false);
        setResendRateLimited(false);
        try {
            await resendConfirmationEmail(resendEmail.trim());
            setResendDone(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (isRateLimitError(message)) {
                setResendRateLimited(true);
            }
        } finally {
            setResendLoading(false);
        }
    }, [resendEmail, resendLoading]);

    if (status === "loading") {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <Text as="h1" variant="title-md">
                        Verifica in corso…
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        Attendi qualche secondo, stiamo completando la verifica.
                    </Text>
                </div>
            </AuthLayout>
        );
    }

    if (status === "success") {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <div className={styles.statusIcon}>
                        <CheckCircle size={48} color="var(--brand-primary, #6366f1)" strokeWidth={1.5} />
                    </div>
                    <Text as="h1" variant="title-md">
                        Email confermata
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        Il tuo account è attivo. Ora puoi accedere a CataloGlobe.
                    </Text>
                    <Button variant="primary" fullWidth onClick={() => navigate("/login")}>
                        Accedi
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    if (status === "already") {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <div className={styles.statusIcon}>
                        <Info size={48} color="var(--text-muted, #64748b)" strokeWidth={1.5} />
                    </div>
                    <Text as="h1" variant="title-md">
                        Email già verificata
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        Il tuo account è già attivo.
                    </Text>
                    <Button variant="primary" fullWidth onClick={() => navigate("/login")}>
                        Accedi
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    // status === "error"
    return (
        <AuthLayout>
            <div className={styles.auth}>
                <div className={styles.statusIcon}>
                    <Info size={48} color="var(--text-muted, #64748b)" strokeWidth={1.5} />
                </div>
                <Text as="h1" variant="title-md">
                    Verifica non riuscita
                </Text>
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                    Il link potrebbe essere scaduto o già utilizzato. Inserisci la tua email per
                    ricevere un nuovo link di conferma.
                </Text>

                <TextInput
                    label="Email"
                    type="email"
                    value={resendEmail}
                    onChange={e => {
                        setResendEmail(e.target.value);
                        setResendDone(false);
                        setResendRateLimited(false);
                    }}
                    autoComplete="email"
                    disabled={resendLoading}
                />

                {resendDone && (
                    <Text as="p" colorVariant="success" variant="caption" className={styles.feedback}>
                        Email inviata. Controlla la tua casella.
                    </Text>
                )}

                {resendRateLimited && (
                    <Text as="p" colorVariant="error" variant="caption" className={styles.feedback}>
                        Troppi tentativi. Riprova tra qualche minuto.
                    </Text>
                )}

                <Button
                    variant="primary"
                    fullWidth
                    loading={resendLoading}
                    disabled={resendLoading || !resendEmail.trim()}
                    onClick={handleResend}
                >
                    Invia nuova email
                </Button>
            </div>
        </AuthLayout>
    );
}
