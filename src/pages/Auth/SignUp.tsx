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
        return "Esiste già un account con questa email.";
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
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleSubmit: React.FormEventHandler = async e => {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setLoading(true);

        try {
            await signUp(email.trim(), password, name.trim() || undefined);

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
                <TextInput
                    label="Nome"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    disabled={loading}
                />

                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                />

                <TextInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
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
                    Registrati
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.hint}>
                Hai già un account? <a href="/login">Accedi</a>
            </Text>
        </div>
    );
}
