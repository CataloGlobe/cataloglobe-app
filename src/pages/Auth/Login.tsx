import { useState, type FormEvent } from "react";
import { signIn } from "@services/supabase/auth";
import { Button, Input } from "@components/ui";
import styles from "./Auth.module.scss";
import { useNavigate } from "react-router-dom";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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
            <h1>Accedi</h1>

            <form onSubmit={handleLogin}>
                <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />

                <Input
                    label="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />

                {error && <p className={styles.error}>{error}</p>}

                <Button
                    label={loading ? "Caricamento..." : "Accedi"}
                    variant="primary"
                    fullWidth
                    disabled={loading}
                />
            </form>
        </div>
    );
}
