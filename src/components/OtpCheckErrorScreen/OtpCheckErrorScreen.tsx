import { Button } from "@components/ui";
import styles from "./OtpCheckErrorScreen.module.scss";

export function OtpCheckErrorScreen() {
    return (
        <div className={styles.root} role="alert" aria-live="assertive">
            <div className={styles.content}>
                <h1 className={styles.title}>Connessione persa</h1>
                <p className={styles.message}>
                    Impossibile verificare la tua sessione. Ricarica la pagina per riprovare.
                </p>
                <Button onClick={() => window.location.reload()}>Ricarica</Button>
            </div>
        </div>
    );
}
