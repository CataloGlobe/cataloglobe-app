import { useEffect, useState, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Clock, KeyRound } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { Button, PasswordRequirements } from "@/components/ui";
import { isStrongPassword, isWeakPasswordError } from "@utils/validatePassword";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { PasswordField } from "./PasswordField";
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

        if (!isStrongPassword(password)) {
            setPasswordError("La password non soddisfa i requisiti di sicurezza.");
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

            // Fuori gli altri dispositivi (chi aveva la vecchia password), dentro
            // questo: il link di recupero ha già aperto la sessione, non serve
            // ripassare dal login. Il codice OTP lo chiede ProtectedRoute se manca.
            await supabase.auth.signOut({ scope: "others" });

            setSuccess(true);
        } catch (err) {
            if (isExpiredTokenError(err)) {
                setLinkExpired(true);
            } else if (err instanceof Error && isWeakPasswordError(err.message)) {
                setPasswordError("La password non soddisfa i requisiti di sicurezza.");
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
            <AuthLayout
                icon={<CheckCircle size={28} aria-hidden="true" />}
                heading="Password aggiornata"
                lead="Da ora entri con la nuova password."
            >
                <div className={styles.auth}>
                    <Button variant="primary" fullWidth onClick={() => navigate("/workspace", { replace: true })}>
                        Entra
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    if (linkExpired) {
        return (
            <AuthLayout
                icon={<Clock size={28} aria-hidden="true" />}
                tone="warning"
                heading="Link scaduto"
                lead="Questo link non vale più. Chiedine uno nuovo."
            >
                <div className={styles.auth}>
                    <Button variant="primary" fullWidth onClick={() => navigate("/forgot-password")}>
                        Chiedi un link nuovo
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            icon={<KeyRound size={28} aria-hidden="true" />}
            heading="Imposta una nuova password"
            lead="Scegli una password nuova per il tuo account."
        >
            <div className={styles.auth}>

                <form onSubmit={handleSubmit} aria-busy={loading}>
                    <PasswordField
                        label="Nuova password"
                        value={password}
                        onChange={e => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError(undefined);
                        }}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        error={passwordError}
                    />

                    <PasswordRequirements value={password} />

                    <PasswordField
                        label="Conferma nuova password"
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
