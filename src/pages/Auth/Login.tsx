import { useState, type FormEvent } from "react";
import { signIn } from "@services/supabase/auth";
import { Button } from "@components/ui";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || "/dashboard";

    async function handleLogin(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const { user } = await signIn(email.trim(), password, { rememberMe });

            if (!user) {
                setError("Credenziali non valide.");
                return;
            }

            // Salvo info per OTP
            localStorage.setItem("pendingUserId", user.id);
            localStorage.setItem("pendingUserEmail", user.email ?? email.trim());
            localStorage.removeItem("otpValidatedUserId");
            localStorage.removeItem("otpSent");

            navigate("/verify-otp", {
                state: { from }
            });
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

            <form onSubmit={handleLogin} aria-busy={loading}>
                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                />

                <TextInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                />

                <div className={styles.formRow}>
                    <CheckboxInput
                        label="Ricordami"
                        description="Accedi in automatico"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                    />

                    <Text as="p" variant="body-sm">
                        <Link to="/forgot-password" className={styles.forgot}>
                            Password dimenticata?
                        </Link>
                    </Text>
                </div>

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
                    Accedi
                </Button>
            </form>

            <Text as="p" variant="body-sm" className={styles.hint}>
                Non hai un account? <Link to="/sign-up">Registrati</Link>
            </Text>
        </div>
    );
}
