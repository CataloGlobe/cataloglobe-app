import { useEffect, useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import styles from "../aiMenuImport.module.scss";

const MESSAGES = [
    "Analisi del menù in corso...",
    "Identificazione dei prodotti...",
    "Estrazione prezzi e categorie...",
    "Quasi fatto..."
];

interface AnalyzingStepProps {
    error: string | null;
    onRetry: () => void;
}

export function AnalyzingStep({ error, onRetry }: AnalyzingStepProps) {
    const [msgIndex, setMsgIndex] = useState(0);
    const [fakeProgress, setFakeProgress] = useState(0);

    // Rotate messages
    useEffect(() => {
        if (error) return;
        const timer = setInterval(() => {
            setMsgIndex(prev => (prev + 1) % MESSAGES.length);
        }, 3000);
        return () => clearInterval(timer);
    }, [error]);

    // Fake progress bar
    useEffect(() => {
        if (error) return;
        setFakeProgress(0);
        const timer = setInterval(() => {
            setFakeProgress(prev => {
                if (prev >= 90) return prev;
                // Fast start, slow toward end
                const increment = prev < 30 ? 3 : prev < 60 ? 1.5 : 0.5;
                return Math.min(prev + increment, 90);
            });
        }, 300);
        return () => clearInterval(timer);
    }, [error]);

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

    return (
        <div className={styles.analyzingContainer}>
            <div className={styles.pulseIcon}>
                <Sparkles size={28} />
            </div>

            <div className={styles.analyzingMessages}>
                <div className={styles.analyzingMessage}>{MESSAGES[msgIndex]}</div>
                <div className={styles.analyzingHint}>
                    L'analisi può richiedere fino a 30 secondi
                </div>
            </div>

            <div className={styles.analyzingProgress}>
                <div className={styles.progressTrack}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${fakeProgress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
