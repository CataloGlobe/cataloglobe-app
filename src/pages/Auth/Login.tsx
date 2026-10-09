import { useState, useEffect, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { signIn } from "@services/supabase/auth";
import {
    requestAccountRecovery,
    confirmAccountRecovery,
    DELETED_ACCOUNT_HANDOFF_KEY,
    type DeletedAccountHandoff
} from "@/services/supabase/account";
import { Button, InlineBanner } from "@components/ui";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fromPathOf } from "@/utils/internalPath";
import { savePendingRedirect } from "@/utils/pendingRedirect";
import { resendConfirmationEmail } from "@/services/supabase/auth";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { AuthTabs } from "@/layouts/AuthLayout/AuthTabs";
import { Mail, ShieldCheck } from "lucide-react";
import { PasswordField } from "./PasswordField";
import { COMPANY } from "@/config/company";
import styles from "./Auth.module.scss";

function isRateLimitError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("too many") || m.includes("rate limit") || m.includes("too_many_requests");
}

// Supabase Auth risponde in inglese: mai mostrare il messaggio grezzo.
function getReadableLoginError(err: unknown): string {
    const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
            ? err.code
            : "";
    const message = err instanceof Error ? err.message.toLowerCase() : "";

    if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
        return "Email o password non corretti.";
    }
    if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
        return "Devi ancora confermare l’email: apri il link che ti abbiamo inviato.";
    }
    if (code === "user_not_found") {
        return "Email o password non corretti.";
    }
    if (message.includes("failed to fetch") || message.includes("network")) {
        return "Connessione assente o instabile. Controlla la rete e riprova.";
    }
    return "Non è stato possibile accedere. Riprova.";
}

export default function Login() {
    usePageTitle("Accedi");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isBanned, setIsBanned] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoverySuccess, setRecoverySuccess] = useState(false);
    const [recoveryPartial, setRecoveryPartial] = useState(false);
    // Email non confermata: si offre il reinvio del link (R7).
    const [unconfirmed, setUnconfirmed] = useState(false);
    const [confirmResend, setConfirmResend] = useState<"idle" | "sending" | "failed">("idle");
    const [recoveryOtpSent, setRecoveryOtpSent] = useState(false);
    const [recoveryCode, setRecoveryCode] = useState("");

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
    // Passa from solo se c'è un redirect reale da una route protetta.
    // Se l'utente arriva a /login direttamente (nessuno stato), from = undefined
    // e VerifyOtp userà il fallback /dashboard (che gestisce returning users via TENANT_KEY).
    const from = fromPathOf(location.state);

    async function handleLogin(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setRateLimited(false);
        setIsBanned(false);
        setRecoveryError(null);
        setRecoverySuccess(false);
        setRecoveryPartial(false);
        setUnconfirmed(false);
        setConfirmResend("idle");
        setLoading(true);

        try {
            const { user } = await signIn(email.trim(), password);

            if (!user) {
                setError("Credenziali non valide.");
                return;
            }

            // Da qui decide GuestRoute con l'unico controllo del codice (quello di
            // AuthProvider dopo SIGNED_IN): codice valido → dentro, altrimenti
            // /verify-otp con lo stesso `from`.
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (message.toLowerCase().includes("banned")) {
                setIsBanned(true);
            } else if (isRateLimitError(message)) {
                setRateLimited(true);
            } else {
                setError(getReadableLoginError(err));
                const code = err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : "";
                setUnconfirmed(code === "email_not_confirmed" || message.toLowerCase().includes("email not confirmed"));
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleRequestRecover() {
        setRecoveryError(null);
        setIsRecovering(true);

        try {
            await requestAccountRecovery(email.trim());
            setRecoveryOtpSent(true);
        } catch {
            setRecoveryError("Impossibile inviare il codice. Riprova.");
        } finally {
            setIsRecovering(false);
        }
    }

    async function handleConfirmRecover(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setRecoveryError(null);
        setIsRecovering(true);

        try {
            await confirmAccountRecovery(email.trim(), recoveryCode.trim());
            setRecoverySuccess(true);
            setIsBanned(false);
            setRecoveryOtpSent(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (message === "recovery_window_expired") {
                setRecoveryError(
                    "Il periodo di recupero è scaduto. L\u2019account è stato eliminato definitivamente."
                );
                setRecoveryOtpSent(false);
            } else if (message === "partial_success") {
                // Account già riattivato: il recupero non si può ripetere,
                // e il codice è consumato. Si chiude il flusso e si avvisa.
                setRecoveryPartial(true);
                setIsBanned(false);
                setRecoveryOtpSent(false);
            } else {
                setRecoveryError("Codice non valido o scaduto. Riprova.");
            }
        } finally {
            setIsRecovering(false);
        }
    }

    return (
        <AuthLayout heading="Bentornato." lead="Accedi per gestire menù, sedi e ordini.">
            <div className={styles.auth}>
                <AuthTabs
                    active="login"
                    onSignupClick={() => {
                        // Un invito (o un altro deep link) sopravvive al giro di registrazione (R6).
                        if (from) savePendingRedirect(from);
                    }}
                />

                <form onSubmit={handleLogin} aria-busy={loading}>
                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    startAdornment={<Mail size={18} aria-hidden="true" />}
                />

                <PasswordField
                    label="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                />

                <div className={styles.forgotRow}>
                    <Text as="p" variant="body-sm">
                        <Link to="/forgot-password" className={styles.forgot}>
                            Password dimenticata?
                        </Link>
                    </Text>
                </div>

                {isBanned && !recoverySuccess && !recoveryOtpSent && (
                    <div className={styles.bannedBox}>
                        <Text variant="body-sm" weight={600}>
                            Account in fase di eliminazione
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Hai richiesto l&apos;eliminazione del tuo account. Hai 30 giorni per
                            annullare questa operazione.
                        </Text>
                        {recoveryError && (
                            <Text variant="caption" colorVariant="error" as="p">
                                {recoveryError}
                            </Text>
                        )}
                        <Button
                            variant="primary"
                            onClick={handleRequestRecover}
                            loading={isRecovering}
                            disabled={isRecovering}
                        >
                            {isRecovering ? "Invio in corso..." : "Recupera account"}
                        </Button>
                    </div>
                )}

                {isBanned && !recoverySuccess && recoveryOtpSent && (
                    <div className={styles.bannedBox}>
                        <Text variant="body-sm" weight={600}>
                            Conferma il recupero
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Ti abbiamo inviato un codice via email. Inseriscilo per confermare il
                            recupero dell&apos;account.
                        </Text>
                        {recoveryError && (
                            <Text variant="caption" colorVariant="error" as="p">
                                {recoveryError}
                            </Text>
                        )}
                        <form onSubmit={handleConfirmRecover}>
                            <TextInput
                                label="Codice di verifica"
                                inputMode="numeric"
                                maxLength={6}
                                value={recoveryCode}
                                onChange={e => setRecoveryCode(e.target.value)}
                                required
                                autoComplete="one-time-code"
                            />
                            <Button
                                type="submit"
                                variant="primary"
                                loading={isRecovering}
                                disabled={isRecovering || recoveryCode.trim().length !== 6}
                            >
                                {isRecovering ? "Verifica in corso..." : "Conferma recupero"}
                            </Button>
                        </form>
                    </div>
                )}

                {recoverySuccess && (
                    <Text
                        as="p"
                        colorVariant="success"
                        variant="caption"
                        className={styles.feedback}
                    >
                        Account ripristinato con successo. Puoi effettuare di nuovo
                        l&apos;accesso.
                    </Text>
                )}

                {recoveryPartial && (
                    <InlineBanner variant="warning">
                        Il tuo account è di nuovo attivo, ma non siamo riusciti a sbloccare le tue
                        aziende. Scrivi subito a{" "}
                        <a href={`mailto:${COMPANY.contact.support}`}>{COMPANY.contact.support}</a>:
                        senza un nostro intervento vengono eliminate 30 giorni dopo la richiesta
                        di eliminazione.
                    </InlineBanner>
                )}

                {rateLimited && (
                    <InlineBanner variant="warning">
                        Hai effettuato troppi tentativi. Attendi qualche minuto prima di
                        riprovare.
                    </InlineBanner>
                )}

                {error && <InlineBanner variant="error">{error}</InlineBanner>}

                {unconfirmed && (
                    <Button
                        type="button"
                        variant="secondary"
                        fullWidth
                        loading={confirmResend === "sending"}
                        disabled={confirmResend === "sending"}
                        onClick={async () => {
                            setConfirmResend("sending");
                            try {
                                await resendConfirmationEmail(email.trim());
                                setConfirmResend("idle");
                                // Mail nuova con codice e link: si va dove si scrive il codice.
                                navigate("/check-email", { state: { email: email.trim() } });
                            } catch {
                                setConfirmResend("failed");
                            }
                        }}
                    >
                        Mandami il codice di conferma
                    </Button>
                )}
                {confirmResend === "failed" && (
                    <InlineBanner variant="error">Non siamo riusciti a inviare il codice. Riprova tra poco.</InlineBanner>
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

                <p className={styles.note}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    Per sicurezza, una volta al mese ti chiediamo anche un codice via email.
                </p>
            </div>
        </AuthLayout>
    );
}
