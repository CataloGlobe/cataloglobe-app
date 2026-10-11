import { useState } from "react";
import { Ban, CheckCheck, CornerUpLeft, MoreVertical, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Menu } from "@/components/ui/Menu/Menu";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderDetailDrawer.module.scss";

/**
 * Le azioni della card, anche nel dettaglio accanto (D131, punto 3): chi
 * guarda un ordine lo conferma, lo segna pronto o servito senza chiuderlo.
 * Stesse voci e stesse regole di `OrderCard`: la principale in viola, le
 * altre nel «⋯», l'annullamento in fondo.
 */
export interface OrderLiveActions {
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    onMarkReady?: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    onCancelItem: (order: V2OrderWithItems) => void;
    onUnacknowledge?: (order: V2OrderWithItems) => Promise<void>;
    onUnready?: (order: V2OrderWithItems) => Promise<void>;
    canManage?: boolean;
    canEdit?: boolean;
}

interface Props {
    order: V2OrderWithItems;
    actions: OrderLiveActions;
    /** «Stampa» o «Ristampa comanda»; assente se l'ordine è annullato. */
    printLabel: string | null;
    onPrint: () => void;
}

export function OrderDetailActions({ order, actions, printLabel, onPrint }: Props) {
    const [busy, setBusy] = useState(false);
    const { onAcknowledge, onMarkReady, onDeliver, onCancel, onCancelItem, onUnacknowledge, onUnready, canEdit } = actions;
    const locked = canEdit === false || busy;

    async function run(action: () => Promise<void>) {
        setBusy(true);
        try {
            await action();
        } finally {
            setBusy(false);
        }
    }

    const primary =
        order.status === "submitted"
            ? { label: "Conferma", action: () => onAcknowledge(order) }
            : order.status === "acknowledged"
              ? onMarkReady
                  ? { label: "Pronto", action: () => onMarkReady(order) }
                  : { label: "Consegna", action: () => onDeliver(order) }
              : order.status === "ready"
                ? { label: "Servita", action: () => onDeliver(order) }
                : null;

    return (
        <div className={styles.actions}>
            <Menu
                align="start"
                side="top"
                trigger={<IconButton icon={<MoreVertical size={18} />} variant="secondary" aria-label="Altre azioni" disabled={busy} />}
            >
                <Menu.Item icon={Ban} onSelect={() => onCancelItem(order)}>
                    Annulla articolo
                </Menu.Item>
                {order.status === "acknowledged" && (
                    <Menu.Item icon={CheckCheck} onSelect={() => void run(() => onDeliver(order))}>
                        Servito direttamente
                    </Menu.Item>
                )}
                {order.status === "acknowledged" && onUnacknowledge && (
                    <Menu.Item icon={CornerUpLeft} onSelect={() => void run(() => onUnacknowledge(order))}>
                        Rimetti in Nuove
                    </Menu.Item>
                )}
                {order.status === "ready" && onUnready && (
                    <Menu.Item icon={CornerUpLeft} onSelect={() => void run(() => onUnready(order))}>
                        Rimetti in lavorazione
                    </Menu.Item>
                )}
                <Menu.Separator />
                <Menu.Item icon={Trash2} variant="destructive" onSelect={() => onCancel(order)}>
                    Annulla ordine
                </Menu.Item>
            </Menu>
            <span className={styles.actionsGap} />
            {printLabel && (
                <Button variant="secondary" leftIcon={<Printer size={14} />} onClick={onPrint} disabled={busy}>
                    {printLabel}
                </Button>
            )}
            {primary && (
                <Button variant="primary" onClick={() => void run(primary.action)} loading={busy} disabled={locked}>
                    {primary.label}
                </Button>
            )}
        </div>
    );
}
