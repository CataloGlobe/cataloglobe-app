import { QrCode } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";

export interface TablesEmptyStateProps {
    onGoToSettings: () => void;
}

export function TablesEmptyState({ onGoToSettings }: TablesEmptyStateProps) {
    return (
        <EmptyState
            icon={<QrCode size={40} strokeWidth={1.5} />}
            title="Tavoli non disponibili"
            description="Per gestire i tavoli, abilita prima le Ordinazioni QR per questa sede dalla scheda Impostazioni."
            action={
                <Button variant="primary" onClick={onGoToSettings}>
                    Vai alle impostazioni
                </Button>
            }
        />
    );
}
