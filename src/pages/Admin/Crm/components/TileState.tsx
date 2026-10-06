import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import styles from "../Home.module.scss";

/**
 * Lo stato di un riquadro che carica da solo: «Carico…», la frase italiana
 * dell'errore con «Riprova», il vuoto con la sua frase, oppure il contenuto.
 */
export function TileState({
    loading,
    error,
    onRetry,
    empty = false,
    emptyText,
    children
}: {
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    empty?: boolean;
    emptyText?: string;
    children: ReactNode;
}) {
    if (error) {
        return (
            <div className={styles.tileMessage} role="status">
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {error}
                </Text>
                <Button variant="ghost" size="sm" onClick={onRetry}>
                    Riprova
                </Button>
            </div>
        );
    }
    if (loading) {
        return (
            <div className={styles.tileMessage} aria-busy="true">
                <Text as="span" variant="body-sm" colorVariant="muted">
                    Carico…
                </Text>
            </div>
        );
    }
    if (empty) {
        return (
            <div className={styles.tileMessage}>
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {emptyText}
                </Text>
            </div>
        );
    }
    return <>{children}</>;
}
