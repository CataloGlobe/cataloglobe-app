import { useState, useEffect, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { signIn } from "@services/supabase/auth";
import {
    recoverAccount,
    DELETED_ACCOUNT_HANDOFF_KEY,
    type DeletedAccountHandoff
} from "@/services/supabase/account";
import { Button } from "@components/ui";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";

export default function Login() {
    usePageTitle('Accedi');
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isBanned, setIsBanned] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoverySuccess, setRecoverySuccess] = useState(false);

    // On mount, check for a forced-logout handoff written by AuthProvider.
    // This covers the case where account_deleted_at was set but the user
    // was not banned, allowing them to log in. The handoff pre-fills the
    // email and activates the existing recovery UI.
    useEffect(() => {
        const raw = sessionStorage.getItem(DELETED_ACCOUNT_HANDOFF_KEY);
        if (!raw) return;
        sessionStorage.removeItem(DELETED_ACCOUNT_HANDOFF_KEY);
        try {
            const handoff = JSON.parse(raw) as DeletedAccountHandoff;
            if (
                handoff &&
                handoff.reason === "account_deleted" &&
                typeof handoff.email === "string"
            ) {
                if (handoff.email) setEmail(handoff.email);
                setIsBanned(true);
            }
        } catch {
            // Malformed entry — silently ignore
        }
    }, []);

    const navigate = useNavigate();
    const location = useLocation();
    const fromLocation = location.state?.from;
    const from =
        (fromLocation?.pathname ?? "/workspace") +
        (fromLocation?.search ?? "");

    async function handleLogin(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsBanned(false);
        setRecoveryError(null);
        setRecoverySuccess(false);
        setLoading(true);

        try {
            const { user } = await signIn(email.trim(), password, { rememberMe });

            if (!user) {
                setError("Credenziali non valide.");
                return;
            }

            navigate("/verify-otp", {
                state: { from }
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Errore sconosciuto durante il login.";
            if (message.toLowerCase().includes("banned")) {
                setIsBanned(true);
            } else {
                setError(message);
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleRecover() {
        setRecoveryError(null);
        setIsRecovering(true);

        try {
            await recoverAccount(email.trim());
            setRecoverySuccess(true);
            setIsBanned(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (message === "recovery_window_expired") {
                setRecoveryError(
                    "Il periodo di recupero è scaduto. L\u2019account è stato eliminato definitivamente."
                );
            } else {
                setRecoveryError("Impossibile recuperare l'account. Riprova.");
            }
        } finally {
            setIsRecovering(false);
        }
    }

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Accedi
            </Text>

            <form onSubmit={handleLogin} aria-busy={loading}>
                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                />

                <TextInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                />

                <div className={styles.formRow}>
                    <CheckboxInput
                        label="Ricordami"
                        description="Accedi in automatico"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                    />

                    <Text as="p" variant="body-sm">
                        <Link to="/forgot-password" className={styles.forgot}>
                            Password dimenticata?
                        </Link>
                    </Text>
                </div>

                {isBanned && !recoverySuccess && (
                    <div style={{
                        padding: "0.875rem 1rem",
                        border: "1px solid var(--color-warning-300, #fcd34d)",
                        borderRadius: "8px",
                        background: "var(--color-warning-50, #fffbeb)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.625rem"
                    }}>
                        <Text variant="body-sm" weight={600}>
                            Account in fase di eliminazione
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Hai richiesto l&apos;eliminazione del tuo account. Hai 30 giorni per annullare questa operazione.
                        </Text>
                        {recoveryError && (
                            <Text variant="caption" colorVariant="error" as="p">
                                {recoveryError}
                            </Text>
                        )}
                        <Button
                            variant="primary"
                            onClick={handleRecover}
                            loading={isRecovering}
                            disabled={isRecovering}
                        >
                            {isRecovering ? "Recupero in corso..." : "Recupera account"}
                        </Button>
                    </div>
                )}

                {recoverySuccess && (
                    <Text as="p" colorVariant="success" variant="caption" className={styles.feedback}>
                        Account ripristinato con successo. Puoi effettuare di nuovo l&apos;accesso.
                    </Text>
                )}

                {error && (
                    <Text as="p" colorVariant="error" variant="caption" className={styles.feedback}>
                        {error}
                    </Text>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                >
                    Accedi
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.hint}>
                Non hai un account? <Link to="/sign-up">Registrati</Link>
            </Text>
        </div>
    );
}
