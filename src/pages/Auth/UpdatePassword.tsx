import { useState } from "react";
import { supabase } from "@/services/supabase/client";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Auth.module.scss";

export default function UpdatePassword() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setSuccess(false);

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

            setPassword("");
            setConfirmPassword("");
            setSuccess(true);
        } catch {
            setError("Non è stato possibile aggiornare la password. Riprova.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Sicurezza account
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Puoi aggiornare la password del tuo account in qualsiasi momento.
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

                {success && (
                    <Text
                        as="p"
                        colorVariant="success"
                        variant="caption"
                        className={styles.feedback}
                    >
                        Password aggiornata con successo.
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
