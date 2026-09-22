import { useId, useRef } from "react";
import { Check, Printer, RotateCcw, X } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { V2OrderWithItems } from "@/types/orders";
import PrintReceipt from "./PrintReceipt";
import { orderStatusBadge } from "./orderStatusBadge";
import styles from "./OrderDetailDrawer.module.scss";

/**
 * Ordine del dettaglio con l'annotazione storno opzionale che lo Storico
 * calcola a runtime (`annotatedHistory` in Orders.tsx) e passa per reference:
 *   - `rectified` = il padre ha almeno uno storno figlio;
 *   - `netTotal`  = lordo − Σ storni (mostrato barrato/netto nel Totale);
 *   - `storni`    = figli storno (non renderizzati a questo livello).
 * Tutti opzionali: dalla board Comande arriva un ordine grezzo (assenti) e il
 * chip/netto semplicemente non compaiono. Tipo locale: nessun accoppiamento a
 * `historyColumns`/`Orders` (stesso principio delle classi SCSS locali).
 */
type OrderDetailOrder = V2OrderWithItems & {
    rectified?: boolean;
    netTotal?: number;
    storni?: V2OrderWithItems[];
};

interface Props {
    open: boolean;
    order: OrderDetailOrder | null;
    tableLabel: string;
    tableZone: string | null;
    /**
     * Mappa `user_id → display_name` (owner + active members) per risolvere
     * il nome operatore nella riga "Creata da" quando
     * `order.created_by_user_id` è valorizzato. Map vuota / lookup mancante →
     * fallback "Staff". Per ordini staff il `customer_name_snapshot`
     * ("Comanda manuale") viene soppresso: è un placeholder, non un cliente.
     */
    operatorNames?: Map<string, string>;
    /** true = la sede ha stampanti cloud Sunmi attive. Cambia la label del bottone. */
    hasPrinters?: boolean;
    /**
     * Optional. Quando fornita, il bottone "Stampa"/"Ristampa comanda" la
     * invoca invece del dialogo di stampa del browser (stesso pattern di
     * `OrderCard.onPrint`).
     */
    onPrint?: (order: V2OrderWithItems) => void;
    onClose: () => void;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function formatAbsolute(iso: string): string {
    return DATETIME_FORMATTER.format(new Date(iso));
}

type OrderItem = NonNullable<V2OrderWithItems["items"]>[number];

/**
 * Opzione, aggiunte e note di un articolo in una riga sola di testo, nell'ordine
 * in cui la cucina le legge. Va nel sottotitolo della `ListRow` senza limite di
 * righe (`wrapSubtitle="full"`): tagliata, direbbe metà delle aggiunte.
 */
function itemDetail(item: OrderItem): string | null {
    const parts: string[] = [];
    const primary = item.options_snapshot.primary_option;
    if (primary) parts.push(`${primary.group_name}: ${primary.value_name}`);
    const addons = item.options_snapshot.addons;
    if (addons.length > 0) {
        const list = addons.map(addon =>
            addon.price_delta !== 0
                ? `${addon.value_name} (${addon.price_delta > 0 ? "+" : ""}${formatEur(addon.price_delta)})`
                : addon.value_name
        );
        parts.push(`Aggiunte: ${list.join(", ")}`);
    }
    if (item.item_notes) parts.push(`Note: ${item.item_notes}`);
    return parts.length > 0 ? parts.join(" · ") : null;
}

export default function OrderDetailDrawer({
    open,
    order,
    tableLabel,
    tableZone,
    operatorNames,
    hasPrinters,
    onPrint,
    onClose
}: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    function handlePrint() {
        if (onPrint) {
            if (order) onPrint(order);
            return;
        }
        if (printRef.current) {
            printRef.current.setAttribute("data-printing", "true");
            window.print();
            printRef.current.removeAttribute("data-printing");
        }
    }

    if (!order) {
        return (
            <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
                <DrawerLayout
                    title="Dettaglio ordine"
                    titleId={titleId}
                    onClose={onClose}
                    footer={
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                    }
                >
                    <Text colorVariant="muted">Ordine non disponibile</Text>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    const { variant: stVariant, label: stLabel } = orderStatusBadge(order.status);
    const canPrint = order.status !== "cancelled";

    // Padre rettificato (NON l'ordine-che-È-storno, gestito dal banner più sotto).
    const isRectifiedParent = !order.is_rectification && !!order.rectified;
    // Netto valido solo se distinto dal lordo: altrimenti importo singolo.
    const showNet =
        isRectifiedParent &&
        order.netTotal != null &&
        order.netTotal !== order.total_amount;

    // Chi l'ha mandata: l'operatore per le comande staff, il nome del cliente
    // per quelle dal tavolo ("Comanda manuale" è un segnaposto, non un cliente).
    const author =
        order.created_by_user_id != null
            ? `Creata da ${operatorNames?.get(order.created_by_user_id) ?? "Staff"}`
            : order.customer_name_snapshot
              ? `Cliente: ${order.customer_name_snapshot}`
              : null;

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
            <DrawerLayout
                title="Dettaglio ordine"
                titleId={titleId}
                onClose={onClose}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                        {canPrint && (
                            <Button
                                variant="primary"
                                leftIcon={<Printer size={14} />}
                                onClick={handlePrint}
                            >
                                {hasPrinters ? "Ristampa comanda" : "Stampa"}
                            </Button>
                        )}
                    </>
                }
            >
                <div className={styles.content}>
                    <div className={styles.summary}>
                        <div className={styles.summaryLine}>
                            <StatusBadge variant={stVariant} label={stLabel} />
                            {isRectifiedParent && (
                                <Badge>
                                    <RotateCcw size={12} aria-hidden /> Rettificato
                                </Badge>
                            )}
                            <Text weight={600}>
                                {tableLabel}
                                {tableZone ? ` · ${tableZone}` : ""}
                            </Text>
                        </div>
                        <Text variant="body-sm" colorVariant="muted">
                            Inviato {formatAbsolute(order.submitted_at)}
                            {author ? ` · ${author}` : ""}
                        </Text>
                    </div>

                    {order.is_rectification && (
                        <InlineBanner variant="info" icon={<RotateCcw size={16} aria-hidden />}>
                            Questa è una rettifica: storno parziale di un ordine precedente.
                        </InlineBanner>
                    )}

                    <Card title="Articoli" flush>
                        {(order.items ?? []).map(item => {
                            const isCancelled = item.cancelled_at != null;
                            return (
                                <ListRow
                                    key={item.id}
                                    title={item.product_name_snapshot}
                                    subtitle={itemDetail(item)}
                                    wrapSubtitle="full"
                                    metaInline
                                    muted={isCancelled}
                                    meta={
                                        <>
                                            {isCancelled && <StatusBadge variant="neutral" label="Annullato" />}
                                            <Text variant="body-sm" colorVariant="muted">
                                                {item.quantity}×
                                            </Text>
                                            <Text variant="body-sm" weight={500}>
                                                {formatEur(item.line_total)}
                                            </Text>
                                        </>
                                    }
                                />
                            );
                        })}
                        <ListRow
                            title="Totale"
                            metaInline
                            meta={
                                showNet ? (
                                    <>
                                        <Text variant="body-sm" colorVariant="muted" className={styles.grossStrike}>
                                            {formatEur(order.total_amount)}
                                        </Text>
                                        <Text weight={600}>{formatEur(order.netTotal as number)}</Text>
                                    </>
                                ) : (
                                    <Text weight={600}>{formatEur(order.total_amount)}</Text>
                                )
                            }
                        />
                    </Card>

                    {order.notes && (
                        <Card title="Note ordine">
                            <Text variant="body-sm">{order.notes}</Text>
                        </Card>
                    )}

                    <Card title="Storico" flush>
                        <ListRow
                            leading={<Check size={16} aria-hidden className={styles.eventDone} />}
                            title="Inviato"
                            metaInline
                            meta={<Text variant="body-sm" colorVariant="muted">{formatAbsolute(order.submitted_at)}</Text>}
                        />
                        {order.acknowledged_at && (
                            <ListRow
                                leading={<Check size={16} aria-hidden className={styles.eventDone} />}
                                title="Confermato"
                                metaInline
                                meta={<Text variant="body-sm" colorVariant="muted">{formatAbsolute(order.acknowledged_at)}</Text>}
                            />
                        )}
                        {order.delivered_at && (
                            <ListRow
                                leading={<Check size={16} aria-hidden className={styles.eventDone} />}
                                title="Consegnato"
                                metaInline
                                meta={<Text variant="body-sm" colorVariant="muted">{formatAbsolute(order.delivered_at)}</Text>}
                            />
                        )}
                        {order.cancelled_at && (
                            <ListRow
                                leading={<X size={16} aria-hidden className={styles.eventCancelled} />}
                                title="Cancellato"
                                subtitle={
                                    [
                                        order.cancelled_by
                                            ? order.cancelled_by === "customer"
                                                ? "Dal cliente"
                                                : "Dallo staff"
                                            : null,
                                        order.cancellation_reason ? `Motivo: ${order.cancellation_reason}` : null
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") || undefined
                                }
                                wrapSubtitle="full"
                                metaInline
                                meta={<Text variant="body-sm" colorVariant="muted">{formatAbsolute(order.cancelled_at)}</Text>}
                            />
                        )}
                    </Card>
                </div>

                <PrintReceipt
                    ref={printRef}
                    order={order}
                    tableLabel={tableLabel}
                    tableZone={tableZone}
                    operatorNames={operatorNames}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
