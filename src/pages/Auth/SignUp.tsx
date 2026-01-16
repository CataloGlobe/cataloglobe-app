import { useState } from "react";
import { signUp } from "@services/supabase/auth";
import { Button } from "@components/ui";
import Text from "@/components/ui/Text/Text";
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
            <Text as="h1" variant="title-md">
                Registrati
            </Text>
            <form onSubmit={handleSubmit}>
                <TextInput label="Nome" value={name} onChange={e => setName(e.target.value)} />

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

                {error && (
                    <Text as="p" colorVariant="error" variant="caption">
                        {error}
                    </Text>
                )}
                {success && (
                    <Text as="p" colorVariant="success" variant="caption">
                        {success}
                    </Text>
                )}
                <Button variant="primary" fullWidth>
                    Crea account
                </Button>
            </form>

            <Text as="p" variant="body-sm">
                Hai già un account? <Link to="/login">Accedi</Link>
            </Text>
        </div>
    );
}
