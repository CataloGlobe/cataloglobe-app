import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import styles from "../aiMenuImport.module.scss";

interface AnalyzingStepProps {
    error: string | null;
    onRetry: () => void;
}

export function AnalyzingStep({ error, onRetry }: AnalyzingStepProps) {
    if (error) {
        return (
            <div className={styles.errorContainer}>
                <div className={styles.errorIconBox}>
                    <AlertTriangle size={28} />
                </div>
                <div className={styles.errorTitle}>Errore nell'analisi</div>
                <div className={styles.errorMessage}>{error}</div>
                <Button variant="outline" onClick={onRetry}>
                    Riprova
                </Button>
            </div>
        );
    }

    // Indicatore INDETERMINATO: niente percentuale né tempo promessi (erano finti
    // e ripartivano da 0 alla riapertura). Lo spinner pulsante è stateless (CSS) →
    // nessun timer ad alta frequenza, nessuno stato locale da resettare.
    return (
        <div className={styles.analyzingContainer}>
            <div className={styles.pulseIcon}>
                <Sparkles size={28} />
            </div>

            <div className={styles.analyzingMessages}>
                <div className={styles.analyzingMessage}>Analisi del menù in corso…</div>
                <div className={styles.analyzingHint}>
                    I menu complessi possono richiedere qualche istante in più.
                </div>
            </div>
        </div>
    );
}
