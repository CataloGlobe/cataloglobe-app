import { useState } from "react";
import { signUp } from "@services/supabase/auth";
import { Input, Button } from "@components/ui";
import { useNavigate, Link } from "react-router-dom";
import styles from "./Auth.module.scss";
import { TextInput } from "@/components/ui/Input/TextInput";

export default function SignUp() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setSuccess("");

        try {
            await signUp(email, password, name);
            setSuccess(
                "Registrazione completata! Controlla la tua email per confermare l'account."
            );
            setTimeout(() => navigate("/login"), 3000);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
        }
    }

    return (
        <div className={styles.auth}>
            <h1>Registrati</h1>
            <form onSubmit={handleSubmit}>
                <TextInput label="Nome" value={name} onChange={e => setName(e.target.value)} />
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
                {success && <p className={styles.success}>{success}</p>}
                <Button label="Crea account" variant="primary" fullWidth />
            </form>

            <p className={styles.switch}>
                Hai già un account? <Link to="/login">Accedi</Link>
            </p>
        </div>
    );
}
