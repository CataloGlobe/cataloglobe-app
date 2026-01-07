import { useState } from "react";
import { resetPassword } from "@services/supabase/auth";
import { Input, Button } from "@components/ui";
import { Link } from "react-router-dom";
import styles from "./Auth.module.scss";

export default function ResetPassword() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMessage("");
        setError("");

        try {
            await resetPassword(email);
            setMessage("Ti abbiamo inviato un'email per reimpostare la password.");
        } catch (err) {
            if (err instanceof Error) setError(err.message);
        }
    }

    return (
        <div className={styles.auth}>
            <h1>Recupera Password</h1>
            <form onSubmit={handleSubmit}>
                <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                {error && <p className={styles.error}>{error}</p>}
                {message && <p className={styles.success}>{message}</p>}
                <Button label="Invia email di reset" variant="primary" fullWidth />
            </form>

            <p className={styles.switch}>
                Torna al <Link to="/login">Login</Link>
            </p>
        </div>
    );
}
