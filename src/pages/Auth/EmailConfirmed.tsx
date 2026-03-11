import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import styles from "./Auth.module.scss";

export default function EmailConfirmed() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"redirecting" | "checking" | "success">("checking");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const confirmationUrl = params.get("confirmation_url");

        if (confirmationUrl) {
            const decoded = decodeURIComponent(confirmationUrl);
            setStatus("redirecting");
            window.location.href = decoded;
            return;
        }

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (data.session) {
                    setStatus("success");
                } else {
                    setStatus("checking");
                }
            })
            .catch(() => setStatus("checking"));
    }, []);

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
