import { useLocation } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import styles from "./Auth.module.scss";

type LocationState = {
    email?: string;
};

export default function CheckEmail() {
    const location = useLocation();
    const state = location.state as LocationState | null;
    const email = state?.email;

    return (
        <div className={styles.auth} role="status" aria-live="polite">
            <Text as="h1" variant="title-md">
                Conferma la tua email
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Abbiamo inviato un’email di conferma
                {email ? (
                    <>
                        {" "}
                        all’indirizzo <strong>{email}</strong>
                    </>
                ) : null}
                .
            </Text>

            <Text as="p" variant="body-sm">
                Apri l’email e clicca sul link di conferma per attivare il tuo account. Dopo la
                conferma potrai accedere a Cataloglobe.
            </Text>

            <div className={styles.actions}>
                <Button as={"a"} href="/login" variant="primary" fullWidth>
                    Vai alla pagina di accesso
                </Button>
            </div>

            <Text as="p" variant="caption" className={styles.hint}>
                Non trovi l’email? Controlla anche la cartella spam o posta indesiderata. Se dopo
                qualche minuto non è arrivata, puoi riprovare dalla pagina di accesso.
            </Text>
        </div>
    );
}
