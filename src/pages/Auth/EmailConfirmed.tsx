import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Info } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { resendConfirmationEmail } from "@/services/supabase/auth";
import { parseConfirmationLink } from "@/utils/confirmationLink";
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
    const [status, setStatus] = useState<
        "loading" | "success" | "expired" | "error" | "already" | "otherAccount"
    >("loading");
    // Account già dentro quando si apre il link di un altro (stato "otherAccount").
    const [currentEmail, setCurrentEmail] = useState<string | null>(null);
    const startedRef = useRef(false);

    // Resend state — usato solo negli stati di errore
    const [resendEmail, setResendEmail] = useState("");
    const [resendLoading, setResendLoading] = useState(false);
    const [resendDone, setResendDone] = useState(false);
    const [resendRateLimited, setResendRateLimited] = useState(false);
    const [resendFailed, setResendFailed] = useState(false);

    const verifyLink = useCallback(async () => {
        const link = parseConfirmationLink(window.location.search);
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;

        // Prima il link, poi la sessione: «già verificata» solo se il link
        // manca. Con un link e un altro account dentro, il link non si consuma
        // finché non si esce, altrimenti si cambierebbe account senza dirlo.
        if (!link) {
            setStatus(session ? "already" : "error");
            return;
        }
        if (session) {
            setCurrentEmail(session.user.email ?? null);
            setStatus("otherAccount");
            return;
        }

        const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
        if (!error) {
            setStatus("success");
            return;
        }
        // GoTrue dà otp_expired sia per il link scaduto sia per quello già usato.
        const code = (error as { code?: string }).code;
        setStatus(code === "otp_expired" ? "expired" : "error");
    }, []);

    useEffect(() => {
        // Una volta sola: in sviluppo StrictMode monta due volte, e il secondo
        // verifyOtp troverebbe il link già consumato.
        if (startedRef.current) return;
        startedRef.current = true;
        verifyLink().catch(() => setStatus("error"));
    }, [verifyLink]);

    const handleSignOutAndConfirm = useCallback(async () => {
        setStatus("loading");
        // Solo questo dispositivo: le altre sessioni dell'account restano.
        await supabase.auth.signOut({ scope: "local" });
        await verifyLink().catch(() => setStatus("error"));
    }, [verifyLink]);

    const handleResend = useCallback(async () => {
        if (!resendEmail.trim() || resendLoading) return;
        setResendLoading(true);
        setResendDone(false);
        setResendRateLimited(false);
        setResendFailed(false);
        try {
            await resendConfirmationEmail(resendEmail.trim());
            setResendDone(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (isRateLimitError(message)) {
                setResendRateLimited(true);
            } else {
                setResendFailed(true);
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

    if (status === "otherAccount") {
        return (
            <AuthLayout>
                <div className={styles.auth}>
                    <div className={styles.statusIcon}>
                        <Info size={48} color="var(--text-muted, #64748b)" strokeWidth={1.5} />
                    </div>
                    <Text as="h1" variant="title-md">
                        Sei dentro con un altro account
                    </Text>
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                        {currentEmail
                            ? `Hai già fatto l'accesso come ${currentEmail}. `
                            : "Hai già fatto l'accesso con un altro account. "}
                        Per confermare la nuova email esci da questo account.
                    </Text>
                    <Button variant="primary" fullWidth onClick={handleSignOutAndConfirm}>
                        Esci e conferma
                    </Button>
                    <Button variant="secondary" fullWidth onClick={() => navigate("/workspace")}>
                        Resta in questo account
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

    // status === "expired" | "error"
    return (
        <AuthLayout>
            <div className={styles.auth}>
                <div className={styles.statusIcon}>
                    <Info size={48} color="var(--text-muted, #64748b)" strokeWidth={1.5} />
                </div>
                <Text as="h1" variant="title-md">
                    {status === "expired" ? "Link scaduto o già usato" : "Verifica non riuscita"}
                </Text>
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.subtitle}>
                    {status === "expired"
                        ? "Se hai già confermato l'email, puoi accedere. Altrimenti inserisci la tua email per ricevere un nuovo link."
                        : "Il link non è valido. Inserisci la tua email per ricevere un nuovo link di conferma."}
                </Text>

                <TextInput
                    label="Email"
                    type="email"
                    value={resendEmail}
                    onChange={e => {
                        setResendEmail(e.target.value);
                        setResendDone(false);
                        setResendRateLimited(false);
                        setResendFailed(false);
                    }}
                    autoComplete="email"
                    disabled={resendLoading}
                />

                {resendDone && (
                    <Text as="p" colorVariant="success" variant="caption" className={styles.feedback}>
                        Email inviata. Controlla la tua casella.
                    </Text>
                )}

                {resendFailed && (
                    <Text as="p" colorVariant="error" variant="caption" className={styles.feedback}>
                        Non siamo riusciti a inviare l'email. Riprova tra poco.
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

                {status === "expired" && (
                    <Button variant="secondary" fullWidth onClick={() => navigate("/login")}>
                        Accedi
                    </Button>
                )}
            </div>
        </AuthLayout>
    );
}
