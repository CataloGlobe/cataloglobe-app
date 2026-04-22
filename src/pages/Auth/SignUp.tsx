import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate } from "react-router-dom";
import { signUp } from "@/services/supabase/auth";
import { isDisposableEmail } from "@utils/validateEmail";
import { Button } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";

function getReadableSignUpError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes("already registered") || normalized.includes("already exists")) {
        return "Questa email è già registrata. Prova ad accedere oppure recupera la password.";
    }

    if (normalized.includes("invalid email")) {
        return "Inserisci un indirizzo email valido.";
    }

    if (normalized.includes("password")) {
        return "La password deve essere più sicura (almeno 8 caratteri).";
    }

    if (normalized.includes("too many")) {
        return "Hai effettuato troppe richieste. Riprova più tardi.";
    }

    return "Errore durante la registrazione. Riprova.";
}

export default function SignUp() {
    usePageTitle('Registrati');
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [termsAccepted, setTermsAccepted] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setFieldErrors({});

        const nextErrors: Record<string, string> = {};

        if (!firstName.trim()) nextErrors.firstName = "Il nome è obbligatorio.";
        if (!lastName.trim()) nextErrors.lastName = "Il cognome è obbligatorio.";
        if (!email.trim()) nextErrors.email = "L'email è obbligatoria.";
        else if (isDisposableEmail(email.trim())) nextErrors.email = "Non è possibile registrarsi con un indirizzo email temporaneo. Utilizza un indirizzo email permanente.";
        if (password.length < 8)
            nextErrors.password = "La password deve contenere almeno 8 caratteri.";
        if (password !== confirmPassword)
            nextErrors.confirmPassword = "Le password non coincidono.";

        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            return;
        }

        setLoading(true);

        try {
            const { data, error: signUpError } = await signUp(email.trim(), password, {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: phone.trim() || null
            });

            if (signUpError) {
                setError(getReadableSignUpError(signUpError.message));
                return;
            }

            const { user } = data ?? {};

            if (!user?.id) {
                setError("Errore durante la registrazione. Riprova.");
                return;
            }

            if (Array.isArray(user.identities) && user.identities.length === 0) {
                setError(
                    "Questa email è già registrata. Prova ad accedere oppure recupera la password."
                );
                return;
            }

            // Registrazione riuscita → email di conferma
            // Il consenso GDPR viene registrato automaticamente dal trigger handle_new_user
            // usando consent_privacy_version e consent_terms_version passati in raw_user_meta_data.
            navigate("/check-email", {
                state: { email: email.trim() }
            });
        } catch (err) {
            if (err instanceof Error) {
                setError(getReadableSignUpError(err.message));
            } else {
                setError("Errore durante la registrazione. Riprova.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Crea il tuo account
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Inserisci i tuoi dati per creare un nuovo account.
            </Text>

            <form onSubmit={handleSubmit} aria-busy={loading}>
                <div className={styles.formRow}>
                    <TextInput
                        label="Nome"
                        value={firstName}
                        onChange={e => {
                            setFirstName(e.target.value);
                            if (fieldErrors.firstName) {
                                setFieldErrors(prev => ({ ...prev, firstName: "" }));
                            }
                        }}
                        required
                        autoComplete="given-name"
                        disabled={loading}
                        error={fieldErrors.firstName}
                    />

                    <TextInput
                        label="Cognome"
                        value={lastName}
                        onChange={e => {
                            setLastName(e.target.value);
                            if (fieldErrors.lastName) {
                                setFieldErrors(prev => ({ ...prev, lastName: "" }));
                            }
                        }}
                        required
                        autoComplete="family-name"
                        disabled={loading}
                        error={fieldErrors.lastName}
                    />
                </div>

                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) {
                            setFieldErrors(prev => ({ ...prev, email: "" }));
                        }
                    }}
                    required
                    autoComplete="email"
                    disabled={loading}
                    error={fieldErrors.email}
                />

                <TextInput
                    label="Telefono"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    autoComplete="tel"
                    disabled={loading}
                />

                <TextInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                            setFieldErrors(prev => ({ ...prev, password: "" }));
                        }
                    }}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                    error={fieldErrors.password}
                />

                <TextInput
                    label="Conferma password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirmPassword) {
                            setFieldErrors(prev => ({ ...prev, confirmPassword: "" }));
                        }
                    }}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                    error={fieldErrors.confirmPassword}
                />

                <label className={styles.consentLabel}>
                    <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className={styles.consentCheckbox}
                    />
                    <span className={styles.consentText}>
                        Ho letto e accetto la{' '}
                        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                            Privacy Policy
                        </a>{' '}
                        e i{' '}
                        <a href="/legal/termini" target="_blank" rel="noopener noreferrer">
                            Termini di Servizio
                        </a>
                    </span>
                </label>

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
                    disabled={loading || !termsAccepted}
                >
                    Registrati
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.hint}>
                Hai già un account? <a href="/login">Accedi</a>
            </Text>
        </div>
    );
}
