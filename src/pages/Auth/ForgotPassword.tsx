import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { resetPassword } from "@/services/supabase/auth";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { Link } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import styles from "./Auth.module.scss";

export default function ForgotPassword() {
    usePageTitle("Recupera Password");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        try {
            await resetPassword(email.trim());
            // ⚠️ Non riveliamo se l'email esiste o meno
            setSuccess(true);
        } catch {
            // Anche in caso di errore tecnico, mostriamo messaggio neutro
            setSuccess(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Password dimenticata?
                </Text>

                {!success ? (
                    <>
                        <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                            Inserisci la tua email: ti invieremo un link per reimpostare la password.
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
                            <Link to="/login">Torna alla login</Link>
                        </Text>
                    </>
                ) : (
                    <>
                        <Text as="p" variant="body-sm" colorVariant="muted">
                            Se l&apos;indirizzo email è associato a un account, ti abbiamo inviato le
                            istruzioni per reimpostare la password.
                        </Text>

                        <Text as="p" variant="caption" colorVariant="muted" className={styles.hint}>
                            Controlla anche la cartella spam o posta indesiderata.
                        </Text>

                        <div className={styles.actions}>
                            <Button as="a" href="/login" variant="primary" fullWidth>
                                Torna alla login
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </AuthLayout>
    );
}
