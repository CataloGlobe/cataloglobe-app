import { useState } from "react";
import { Button } from "@components/ui";
import styles from "./OtpCheckErrorScreen.module.scss";

type OtpCheckErrorScreenProps = {
    onRetry: () => Promise<void> | void;
};

export function OtpCheckErrorScreen({ onRetry }: OtpCheckErrorScreenProps) {
    const [busy, setBusy] = useState(false);

    async function handleClick() {
        if (busy) return;
        setBusy(true);
        try {
            await onRetry();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={styles.root} role="alert" aria-live="assertive">
            <div className={styles.content}>
                <h1 className={styles.title}>Connessione persa</h1>
                <p className={styles.message}>
                    Impossibile verificare la tua sessione. Riprova tra qualche secondo.
                </p>
                <Button onClick={handleClick} disabled={busy}>
                    {busy ? "Riprovo..." : "Riprova"}
                </Button>
            </div>
        </div>
    );
}
