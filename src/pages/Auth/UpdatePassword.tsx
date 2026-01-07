import { useState } from "react";
import { supabase } from "@services/supabase/client";
import { Input, Button } from "@components/ui";
import { useNavigate } from "react-router-dom";
import styles from "./Auth.module.scss";

export default function UpdatePassword() {
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setMessage("Password aggiornata con successo! 🚀");
            setTimeout(() => navigate("/login"), 2500);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.auth}>
            <h1>Imposta una nuova password</h1>
            <form onSubmit={handleSubmit}>
                <Input
                    label="Nuova password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />

                {error && <p className={styles.error}>{error}</p>}
                {message && <p className={styles.success}>{message}</p>}

                <Button
                    label={loading ? "Aggiornamento..." : "Aggiorna password"}
                    variant="primary"
                    fullWidth
                    disabled={loading}
                />
            </form>
        </div>
    );
}
