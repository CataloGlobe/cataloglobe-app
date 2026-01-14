import { useState } from "react";
import { resetPassword } from "@services/supabase/auth";
import { Button } from "@components/ui";
import Text from "@/components/ui/Text/Text";
import { Link } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
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
            <Text as="h1" variant="title-md">
                Recupera Password
            </Text>
            <form onSubmit={handleSubmit}>
                <TextInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
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
                <Button label="Invia email di reset" variant="primary" fullWidth />
            </form>

            <Text as="p" variant="body-sm">
                Torna alla <Link to="/login">Login</Link>
            </Text>
        </div>
    );
}
