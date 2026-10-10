import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { resetPassword } from "@/services/supabase/auth";
import { Button } from "@/components/ui";
import { Link } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { KeyRound, Mail, MailCheck } from "lucide-react";
import styles from "./Auth.module.scss";

const RESEND_COOLDOWN = 30;

export default function ForgotPassword() {
    usePageTitle("Recupera Password");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [resendSeconds, setResendSeconds] = useState(0);
    const [resent, setResent] = useState(false);

    useEffect(() => {
        if (resendSeconds <= 0) return;
        const id = setInterval(() => setResendSeconds(s => s - 1), 1000);
        return () => clearInterval(id);
    }, [resendSeconds]);

    const send = useCallback(async (address: string) => {
        setLoading(true);
        try {
            await resetPassword(address);
        } catch {
            // Messaggio neutro anche su errore tecnico: non si dice se l'email esiste.
        } finally {
            setLoading(false);
            setSentTo(address);
            setResendSeconds(RESEND_COOLDOWN);
        }
    }, []);

    const handleSubmit: React.FormEventHandler = e => {
        e.preventDefault();
        if (loading) return;
        setResent(false);
        void send(email.trim());
    };

    const handleResend = () => {
        if (!sentTo || loading || resendSeconds > 0) return;
        setResent(true);
        void send(sentTo);
    };

    if (sentTo) {
        // Stessa forma di «Conferma la tua email»: email scritta, righe in fondo
        // con lo stesso stile, reinvio dopo 30 s.
        const resendLine: ReactNode = (
            <>
                {resent ? "Mandata di nuovo." : "Non è arrivata? Guarda nello spam o"}{" "}
                <button
                    type="button"
                    className={styles.textLink}
                    disabled={resendSeconds > 0 || loading}
                    onClick={handleResend}
                >
                    {loading ? "invio in corso…" : resent ? "rimandala" : "invia di nuovo"}
                </button>
                {resendSeconds > 0 && !loading && <span className={styles.wait}> tra {resendSeconds} s</span>}
            </>
        );

        return (
            <AuthLayout
                icon={<MailCheck size={28} aria-hidden="true" />}
                heading="Controlla la tua email"
                lead={
                    <>
                        Se <strong>{sentTo}</strong> ha un account, ti abbiamo mandato un link per scegliere una nuova
                        password.
                    </>
                }
            >
                <div className={styles.links}>
                    <p role="status" aria-live="polite">
                        {resendLine}
                    </p>
                    <p>
                        Email sbagliata?{" "}
                        <button type="button" className={styles.textLink} onClick={() => setSentTo(null)}>
                            Correggila
                        </button>
                    </p>
                    <p>
                        <Link to="/login" className={styles.textLink}>
                            Torna ad accedi
                        </Link>
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            icon={<KeyRound size={28} aria-hidden="true" />}
            heading="Password dimenticata?"
            lead="Scrivi la tua email: ti mandiamo un link per sceglierne una nuova."
        >
            <div className={styles.auth}>
                <form onSubmit={handleSubmit} aria-busy={loading}>
                    <TextInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        autoFocus={!!email}
                        disabled={loading}
                        startAdornment={<Mail size={18} aria-hidden="true" />}
                    />

                    <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                        Invia link di recupero
                    </Button>
                </form>

                <div className={styles.links}>
                    <p>
                        <Link to="/login" className={styles.textLink}>
                            Torna ad accedi
                        </Link>
                    </p>
                </div>
            </div>
        </AuthLayout>
    );
}
