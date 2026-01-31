import { useState, type FormEvent } from "react";
import { signIn } from "@services/supabase/auth";
import { Button } from "@components/ui";
import { Link, useNavigate } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleLogin(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const session = await signIn(email, password);

            if (!session?.user) {
                setError("Credenziali non valide.");
                setLoading(false);
                return;
            }

            // Salvo info per OTP
            localStorage.setItem("pendingUserId", session.user.id);
            localStorage.setItem("pendingUserEmail", session.user.email ?? email);
            localStorage.removeItem("otpValidated");

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                        userId: session.user.id,
                        email: session.user.email ?? email
                    })
                }
            );

            if (!response.ok) {
                setError("Errore durante l'invio del codice OTP.");
                setLoading(false);
                return;
            }

            navigate("/verify-otp");
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError("Errore sconosciuto durante il login.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Accedi
            </Text>

            <form onSubmit={handleLogin}>
                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                <TextInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />
                {/* // TODO: implementare il pulsante Ricordami */}
                <div className={styles.formRow}>
                    <CheckboxInput
                        label="Ricordami"
                        description="Accedi in automatico"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                    />

                    <Text as="p" variant="body-sm">
                        <Link to="/reset-password" className={styles.forgot}>
                            Password dimenticata?
                        </Link>
                    </Text>
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                >
                    {loading ? "Caricamento..." : "Accedi"}
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.signupHint}>
                Non hai un account? <Link to="/sign-up">Registrati</Link>
            </Text>
        </div>
    );
}
