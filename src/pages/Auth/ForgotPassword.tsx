import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { resetPassword } from "@/services/supabase/auth";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { Link } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { Info, KeyRound, Mail, MailCheck } from "lucide-react";
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
        <AuthLayout
            icon={success ? <MailCheck size={28} aria-hidden="true" /> : <KeyRound size={28} aria-hidden="true" />}
            heading={success ? "Controlla la posta" : "Password dimenticata?"}
            lead={
                success
                    ? "Se l'indirizzo è associato a un account, ti abbiamo mandato il link per reimpostare la password."
                    : "Scrivi la tua email: ti mandiamo un link per sceglierne una nuova."
            }
        >
            <div className={styles.auth}>
                {!success ? (
                    <form onSubmit={handleSubmit} aria-busy={loading}>
                        <TextInput
                            label="Email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            disabled={loading}
                            startAdornment={<Mail size={18} aria-hidden="true" />}
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
                ) : (
                    <p className={styles.note}>
                        <Info size={16} aria-hidden="true" />
                        Non la trovi? Guarda anche nella cartella spam o posta indesiderata.
                    </p>
                )}

                <Text as="p" variant="body-sm" className={styles.hint}>
                    <Link to="/login">Torna ad accedi</Link>
                </Text>
            </div>
        </AuthLayout>
    );
}
