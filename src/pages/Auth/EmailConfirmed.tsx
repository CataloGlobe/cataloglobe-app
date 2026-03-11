import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";

export default function EmailConfirmed() {
    const navigate = useNavigate();

    const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");

    useEffect(() => {
        const verify = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session) {
                setStatus("already");
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const confirmationUrl = params.get("confirmation_url");

            if (!confirmationUrl) {
                setStatus("error");
                return;
            }

            try {
                const decoded = decodeURIComponent(confirmationUrl);
                const url = new URL(decoded);

                // Supabase può usare token o token_hash
                const tokenHash =
                    url.searchParams.get("token_hash") || url.searchParams.get("token");

                const type = url.searchParams.get("type") as
                    | "signup"
                    | "magiclink"
                    | "recovery"
                    | null;

                if (!tokenHash || !type) {
                    setStatus("error");
                    return;
                }

                const { error } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type
                });

                if (error) {
                    setStatus("error");
                } else {
                    setStatus("success");
                }
            } catch {
                setStatus("error");
            }
        };

        verify();
    }, []);

    if (status === "already") {
        return (
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Email già verificata
                </Text>

                <Text as="p" variant="body-sm" className={styles.subtitle}>
                    Il tuo account è già attivo.
                </Text>

                <Button variant="primary" fullWidth onClick={() => navigate("/workspace")}>
                    Torna alla dashboard
                </Button>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Email verificata con successo
                </Text>

                <Text as="p" variant="body-sm" className={styles.subtitle}>
                    La tua email è stata verificata. Ora puoi accedere al tuo account.
                </Text>

                <Button variant="primary" fullWidth onClick={() => navigate("/login")}>
                    Accedi
                </Button>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className={styles.auth}>
                <Text as="h1" variant="title-md">
                    Errore nella verifica della email
                </Text>

                <Text as="p" variant="body-sm" className={styles.subtitle}>
                    Il link potrebbe essere scaduto. Richiedi una nuova email di conferma.
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Verifica della tua email in corso...
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Attendi qualche secondo, stiamo completando la verifica.
            </Text>
        </div>
    );
}
