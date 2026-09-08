import { QrCode } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import styles from "./TablesEmptyState.module.scss";

export interface TablesEmptyStateProps {
    onGoToOrdering: () => void;
    onGoToReservations: () => void;
}

/**
 * Prerequisito della Sala: i tavoli si mappano solo se almeno uno dei due
 * canali (ordinazioni QR o prenotazioni) è attivo. Due rimandi, uno per
 * canale: il ristoratore sceglie il prodotto, non la pagina non lo indovina.
 */
export function TablesEmptyState({ onGoToOrdering, onGoToReservations }: TablesEmptyStateProps) {
    return (
        <EmptyState
            icon={<QrCode size={40} strokeWidth={1.5} />}
            title="Tavoli non disponibili"
            description="Per gestire la sala, abilita prima le Ordinazioni QR o le Prenotazioni per questa sede: ognuna ha la sua scheda."
            action={
                <div className={styles.actions}>
                    <Button variant="primary" onClick={onGoToOrdering}>
                        Vai a Ordinazioni
                    </Button>
                    <Button variant="secondary" onClick={onGoToReservations}>
                        Vai a Prenotazioni
                    </Button>
                </div>
            }
        />
    );
}
