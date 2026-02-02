import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui";
import styles from "./Auth.module.scss";

export default function ResetPassword() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [sessionValid, setSessionValid] = useState<boolean | null>(null);

    /* ------------------------------------------------------------------
     * VERIFICA SESSIONE RECOVERY
     * ------------------------------------------------------------------ */
    useEffect(() => {
        let cancelled = false;

        async function checkSession() {
            const { data } = await supabase.auth.getSession();

            if (cancelled) return;

            if (!data.session) {
                setSessionValid(false);
            } else {
                setSessionValid(true);
            }
        }

        checkSession();
        return () => {
            cancelled = true;
        };
    }, []);

    /* ------------------------------------------------------------------
     * SUBMIT
     * ------------------------------------------------------------------ */
    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;

        setError(null);

        if (password.length < 8) {
            setError("La password deve contenere almeno 8 caratteri.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Le password non coincidono.");
            return;
        }

        try {
            setLoading(true);

            const { error: updateError } = await supabase.auth.updateUser({
                password
            });

            if (updateError) {
                throw updateError;
            }

            // Pulizia stato locale
            localStorage.removeItem("otpValidated");
            localStorage.removeItem("otpSent");
            localStorage.removeItem("pendingUserId");
            localStorage.removeItem("pendingUserEmail");

            setSuccess(true);
        } catch {
            setError(
                "Non è stato possibile aggiornare la password. Il link potrebbe essere scaduto."
            );
        } finally {
            setLoading(false);
        }
    };

    /* ------------------------------------------------------------------ */

    if (sessionValid === null) {
        return (
            <div className={styles.auth}>
                <Text as="p" variant="body-sm">
                    Verifica del link in corso…
                </Text>
            </div>
        );
    }

    if (sessionValid === false) {
        return (
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Link non valido
                </Text>

                <Text as="p" variant="body-sm" className={styles.subtitle}>
                    Questo link per il reset della password non è valido o è scaduto.
                </Text>

                <Text as="p" variant="body-sm">
                    Puoi richiedere un nuovo link di recupero dalla pagina dedicata.
                </Text>

                <div className={styles.actions}>
                    <Button as={"a"} href="/forgot-password" variant="primary" fullWidth>
                        Recupera password
                    </Button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Password aggiornata
                </Text>

                <Text as="p" variant="body-sm">
                    La tua password è stata aggiornata correttamente. Ora puoi accedere con le nuove
                    credenziali.
                </Text>

                <div className={styles.actions}>
                    <Button as={"a"} href="/login" variant="primary" fullWidth>
                        Vai alla pagina di accesso
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Reimposta password
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Inserisci una nuova password per il tuo account.
            </Text>

            <form onSubmit={handleSubmit} aria-busy={loading}>
                <TextInput
                    label="Nuova password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                />

                <TextInput
                    label="Conferma nuova password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                />

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
                    Aggiorna password
                </Button>
            </form>
        </div>
    );
}
