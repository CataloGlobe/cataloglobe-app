import { useState } from "react";
import { supabase } from "@services/supabase/client";
import { Button } from "@components/ui";
import Text from "@/components/ui/Text/Text";
import { useNavigate } from "react-router-dom";
import styles from "./Auth.module.scss";
import { TextInput } from "@/components/ui/Input/TextInput";

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
            <Text as="h1" variant="title-md">
                Imposta una nuova password
            </Text>
            <form onSubmit={handleSubmit}>
                <TextInput
                    label="Nuova password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />

                {error && (
                    <Text as="p" colorVariant="error" variant="caption">
                        {error}
                    </Text>
                )}
                {message && (
                    <Text as="p" colorVariant="info" variant="caption">
                        {message}
                    </Text>
                )}

                <Button variant="primary" fullWidth loading={loading} disabled={loading}>
                    {loading ? "Aggiornamento..." : "Aggiorna password"}
                </Button>
            </form>
        </div>
    );
}
