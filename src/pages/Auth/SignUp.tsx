import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "@/services/supabase/auth";
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
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

            const { user, session } = data ?? {};

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

            if (user?.id) {
                // Profilo creato dal trigger handle_new_user (auth.users)
                // Nessuna scrittura diretta qui per evitare errori RLS.
            }

            // Registrazione riuscita → email di conferma
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
                    Registrati
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.hint}>
                Hai già un account? <a href="/login">Accedi</a>
            </Text>
        </div>
    );
}
