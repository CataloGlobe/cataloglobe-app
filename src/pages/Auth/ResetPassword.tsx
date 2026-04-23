import { useEffect, useState, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Info } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import styles from "./Auth.module.scss";

function isExpiredTokenError(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    return (
        message.includes("expired") ||
        message.includes("session missing") ||
        message.includes("invalid_token")
    );
}

export default function ResetPassword() {
    usePageTitle("Reimposta Password");
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
    const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [linkExpired, setLinkExpired] = useState(false);

    useEffect(() => {
        return () => {
            sessionStorage.removeItem("passwordRecoveryFlow");
        };
    }, []);

    /* ------------------------------------------------------------------
     * SUBMIT
     * ------------------------------------------------------------------ */
    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (loading) return;

        setPasswordError(undefined);
        setConfirmError(undefined);

        if (password.length < 8) {
            setPasswordError("La password deve contenere almeno 8 caratteri.");
            return;
        }

        if (!/[A-Z]/.test(password)) {
            setPasswordError("La password deve contenere almeno una lettera maiuscola.");
            return;
        }

        if (!/[0-9]/.test(password)) {
            setPasswordError("La password deve contenere almeno un numero.");
            return;
        }

        if (password !== confirmPassword) {
            setConfirmError("Le password non coincidono.");
            return;
        }

        try {
            setLoading(true);

            const { error: updateError } = await supabase.auth.updateUser({ password });

            if (updateError) throw updateError;

            // Chiude il recovery flow
            sessionStorage.removeItem("passwordRecoveryFlow");

            // Pulizia stato OTP legacy
            localStorage.removeItem("otpValidated");
            localStorage.removeItem("otpSent");
            localStorage.removeItem("pendingUserId");
            localStorage.removeItem("pendingUserEmail");

            // Logout forzato (best practice)
            await supabase.auth.signOut();

            setSuccess(true);
        } catch (err) {
            if (isExpiredTokenError(err)) {
                setLinkExpired(true);
            } else {
                setPasswordError("Non è stato possibile aggiornare la password. Riprova.");
            }
        } finally {
            setLoading(false);
        }
    }

    /* ------------------------------------------------------------------ */

    if (success) {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <div className={styles.statusIcon}>
                        <CheckCircle size={48} color="var(--brand-primary, #6366f1)" strokeWidth={1.5} />
                    </div>
                    <Text as="h1" variant="title-md">
                        Password aggiornata
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        Ora puoi accedere con la nuova password.
                    </Text>
                    <Button variant="primary" fullWidth onClick={() => navigate("/login")}>
                        Vai al login
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    if (linkExpired) {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <div className={styles.statusIcon}>
                        <Info size={48} color="var(--text-muted, #64748b)" strokeWidth={1.5} />
                    </div>
                    <Text as="h1" variant="title-md">
                        Link scaduto
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        Il link per reimpostare la password è scaduto. Richiedine uno nuovo.
                    </Text>
                    <Button variant="primary" fullWidth onClick={() => navigate("/forgot-password")}>
                        Richiedi nuovo link
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Imposta una nuova password
                </Text>

                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                    Scegli una password nuova per il tuo account.
                </Text>

                <form onSubmit={handleSubmit} aria-busy={loading}>
                    <TextInput
                        label="Nuova password"
                        type="password"
                        value={password}
                        onChange={e => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError(undefined);
                        }}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        helperText="Minimo 8 caratteri, una maiuscola, un numero."
                        error={passwordError}
                    />

                    <TextInput
                        label="Conferma nuova password"
                        type="password"
                        value={confirmPassword}
                        onChange={e => {
                            setConfirmPassword(e.target.value);
                            if (confirmError) setConfirmError(undefined);
                        }}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        error={confirmError}
                    />

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        loading={loading}
                        disabled={loading}
                    >
                        Aggiorna password
                    </Button>
                </form>
            </div>
        </AuthLayout>
    );
}
