import { useState } from "react";
import { resetPassword } from "@/services/supabase/auth";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { Link } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Auth.module.scss";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setLoading(true);

        try {
            await resetPassword(email.trim());

            // ⚠️ Non riveliamo se l’email esiste o meno
            setSuccess(true);
        } catch {
            // Anche in caso di errore tecnico, mostriamo messaggio neutro
            setSuccess(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Recupera password
            </Text>

            {!success ? (
                <>
                    <Text as="p" variant="body-sm" className={styles.subtitle}>
                        Inserisci l’indirizzo email associato al tuo account. Se esiste un account,
                        ti invieremo un link per reimpostare la password.
                    </Text>

                    <form onSubmit={handleSubmit} aria-busy={loading}>
                        <TextInput
                            label="Email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            disabled={loading}
                        />

                        {error && (
                            <Text
                                as="p"
                                colorVariant="error"
                                variant="caption"
                                className={styles.feedback}
                            >
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
                            Invia link di recupero
                        </Button>
                    </form>

                    <Text as="p" variant="body-sm" className={styles.hint}>
                        Torna alla <Link to="/login">pagina di accesso</Link>
                    </Text>
                </>
            ) : (
                <>
                    <Text as="p" variant="body-sm">
                        Se l’indirizzo email è associato a un account, ti abbiamo inviato un’email
                        con le istruzioni per reimpostare la password.
                    </Text>

                    <Text as="p" variant="caption" className={styles.hint}>
                        Controlla anche la cartella spam o posta indesiderata.
                    </Text>

                    <div className={styles.actions}>
                        <Button as={"a"} href="/login" variant="primary" fullWidth>
                            Torna alla pagina di accesso
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
