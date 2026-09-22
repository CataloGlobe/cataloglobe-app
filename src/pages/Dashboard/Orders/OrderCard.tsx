import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Ban,
    MoreVertical,
    Eye,
    Printer,
    Trash2,
    CheckCheck,
    CornerUpLeft,
    User
} from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { IconButton } from "@/components/ui/Button/IconButton";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Menu } from "@/components/ui/Menu/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { formatRelativeTime } from "@/utils/relativeTime";
import type { V2OrderItem, V2OrderWithItems } from "@/types/orders";
import type { ComandaPrintState } from "./hooks/comandaPrintState";
import styles from "./OrderCard.module.scss";

interface Props {
    order: V2OrderWithItems;
    onAcknowledge: (order: V2OrderWithItems) => Promise<void>;
    /**
     * Optional. When provided and the order is in `acknowledged`, the
     * primary CTA becomes "Pronto" (mark-order-ready) and the deliver CTA
     * is demoted to a secondary "Servito direttamente" affordance for
     * workflows that skip the explicit ready step. When omitted, the
     * legacy behaviour applies: primary "Consegna" on acknowledged.
     */
    onMarkReady?: (order: V2OrderWithItems) => Promise<void>;
    onDeliver: (order: V2OrderWithItems) => Promise<void>;
    onCancel: (order: V2OrderWithItems) => void;
    /**
     * Annulla articolo (pre-servizio): soft-cancel per-riga via drawer.
     * Disponibile solo su submitted | acknowledged | ready.
     */
    onCancelItem: (order: V2OrderWithItems) => void;
    onViewDetail: (order: V2OrderWithItems) => void;
    /**
     * Optional. Disponibile su status `acknowledged`: "Rimetti in Nuove"
     * (acknowledged → submitted). Quando omesso, la voce e' nascosta.
     */
    onUnacknowledge?: (order: V2OrderWithItems) => Promise<void>;
    /**
     * Optional. Disponibile su status `ready`: "Rimetti in lavorazione"
     * (ready → acknowledged). Quando omesso, la voce e' nascosta.
     */
    onUnready?: (order: V2OrderWithItems) => Promise<void>;
    tableLabel: string;
    tableZone: string | null;
    /**
     * Mappa `user_id → display_name` per risolvere il nome dell'operatore
     * sulla pill "Staff" quando `order.created_by_user_id` e' valorizzato.
     * Lookup mancante → fallback label "Staff" senza nome.
     */
    operatorNames?: Map<string, string>;
    /**
     * Stato di stampa della comanda di QUESTO ordine, derivato dai suoi
     * `print_jobs` (kind='comanda'). La stampa parte in automatico
     * all'arrivo dell'ordine: quel che la card offre e' sempre una
     * ristampa, e la sua esistenza dipende dal job dell'ordine, non dalle
     * stampanti della sede.
     *   - null/undefined → nessun job terminale: nessun pulsante
     *   - "done"   → "Ristampa", azione secondaria discreta nel footer
     *   - "failed" → badge "Comanda non stampata" + "Riprova" + rimando
     *                allo stato stampanti (`printersHref`)
     * Il fallback di stampa da browser NON vive piu' qui (resta in
     * OrderDetailDrawer).
     */
    comandaPrintState?: ComandaPrintState | null;
    /** Ristampa/riprova via `sunmi-reprint-order`. Attesa reale (toast nel parent). */
    onReprint?: (order: V2OrderWithItems) => Promise<void>;
    /** Link alla sezione stampanti della sede (mostrato solo su "failed"). */
    printersHref?: string;
    canManage?: boolean;
    canEdit?: boolean;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

const ITEMS_PREVIEW_LIMIT = 3;

/**
 * Badge "Primo ordine · verifica il tavolo" disattivato in attesa di
 * validazione UX con cliente reale — il gate backend (trigger
 * enforce_order_group_verification, colonna order_groups.verified_at) RESTA
 * ATTIVO e continua a bloccare l'avanzamento degli ordini non verificati.
 * Qui si disattiva SOLO il rendering del badge (rumore/wording da ripensare:
 * appare duplicato su ogni ordine del gruppo, testo "primo" fuorviante).
 * Markup, logica realtime e join group_verified_at restano intatti.
 * Riattivare mettendo `true`.
 */
const SHOW_UNVERIFIED_BADGE = false;

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

/**
 * Modificatori (opzione + aggiunte) e nota della riga, in una riga di testo.
 * `null` se non c'è niente: la `ListRow` resta a una riga.
 */
function formatItemDetail(item: V2OrderItem): string | null {
    const parts: string[] = [];
    if (item.options_snapshot.primary_option) {
        parts.push(item.options_snapshot.primary_option.value_name);
    }
    for (const addon of item.options_snapshot.addons) {
        parts.push(addon.value_name);
    }
    const modifiers = parts.join(", ");
    const note = item.item_notes?.trim();
    const detail = [modifiers, note ? `“${note}”` : ""].filter(Boolean).join(" · ");
    return detail || null;
}

export default function OrderCard({
    order,
    onAcknowledge,
    onMarkReady,
    onDeliver,
    onCancel,
    onCancelItem,
    onViewDetail,
    onUnacknowledge,
    onUnready,
    tableLabel,
    tableZone,
    operatorNames,
    comandaPrintState,
    onReprint,
    printersHref,
    canManage,
    canEdit
}: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [itemsExpanded, setItemsExpanded] = useState(false);
    const [isReprinting, setIsReprinting] = useState(false);

    async function handleReprint() {
        if (!onReprint) return;
        setIsReprinting(true);
        try {
            await onReprint(order);
        } finally {
            setIsReprinting(false);
        }
    }

    async function runPrimary(action: () => Promise<void>) {
        setIsProcessing(true);
        try {
            await action();
        } finally {
            setIsProcessing(false);
        }
    }

    const items = order.items ?? [];
    const hasOverflow = items.length > ITEMS_PREVIEW_LIMIT;
    const visibleItems = itemsExpanded || !hasOverflow ? items : items.slice(0, ITEMS_PREVIEW_LIMIT);
    const overflowCount = items.length - ITEMS_PREVIEW_LIMIT;

    const trimmedOrderNotes = order.notes?.trim();
    const hasOrderNotes = !!trimmedOrderNotes;
    const printFailed = comandaPrintState === "failed" && order.status !== "cancelled";

    const attribution =
        order.created_by_user_id != null ? (
            <Badge>
                <User size={12} aria-hidden /> {operatorNames?.get(order.created_by_user_id) ?? "Staff"}
            </Badge>
        ) : (
            <Badge>
                <User size={12} aria-hidden /> Cliente
            </Badge>
        );

    const primaryAction = (label: string, action: () => Promise<void>) => (
        <Button
            className={styles.primaryCta}
            variant="primary"
            onClick={() => void runPrimary(action)}
            loading={isProcessing}
            disabled={canEdit === false || isProcessing}
        >
            {label}
        </Button>
    );

    return (
        <div className={styles.card} data-status={order.status}>
            <Card
                title={tableLabel}
                subtitle={[tableZone, formatRelativeTime(order.submitted_at)].filter(Boolean).join(" · ")}
                badge={attribution}
                flush
                bodyClassName={styles.body}
            >
                {SHOW_UNVERIFIED_BADGE && order.group_verified_at == null && (
                    <div className={styles.block}>
                        <StatusBadge variant="warning" label="Primo ordine · verifica il tavolo" />
                    </div>
                )}

                {printFailed && (
                    <div className={styles.block}>
                        <InlineBanner
                            variant="error"
                            icon={<Printer size={16} aria-hidden />}
                            action={
                                onReprint ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleReprint()}
                                        loading={isReprinting}
                                        disabled={canEdit === false || isReprinting}
                                    >
                                        Riprova
                                    </Button>
                                ) : undefined
                            }
                        >
                            Comanda non stampata: avvisa a voce o riprova.
                            {printersHref && (
                                <>
                                    {" "}
                                    <Link to={printersHref}>Stato stampanti</Link>
                                </>
                            )}
                        </InlineBanner>
                    </div>
                )}

                <ul className={styles.items}>
                    {visibleItems.map(item => {
                        const isCancelled = item.cancelled_at != null;
                        const detail = formatItemDetail(item);
                        return (
                            <li key={item.id} className={styles.item} data-cancelled={isCancelled || undefined}>
                                <Text as="span" variant="body-sm" weight={600} colorVariant="muted">
                                    {item.quantity}×
                                </Text>
                                <span className={styles.itemName}>
                                    <Text as="span" variant="body-sm" weight={500}>
                                        {item.product_name_snapshot}
                                    </Text>
                                    {isCancelled && <StatusBadge variant="neutral" label="Annullato" />}
                                    {detail && (
                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.itemDetail}>
                                            {detail}
                                        </Text>
                                    )}
                                </span>
                                <Text as="span" variant="body-sm" colorVariant="muted" className={styles.itemAmount}>
                                    {formatEur(item.line_total)}
                                </Text>
                            </li>
                        );
                    })}
                </ul>
                {hasOverflow && (
                    <div className={styles.expander}>
                        <Button variant="ghost" size="sm" onClick={() => setItemsExpanded(prev => !prev)}>
                            {itemsExpanded
                                ? "Mostra meno"
                                : `+${overflowCount} ${overflowCount === 1 ? "piatto" : "piatti"}`}
                        </Button>
                    </div>
                )}

                {hasOrderNotes && (
                    <div className={styles.block}>
                        {printFailed ? (
                            // Un solo banner per superficie: il secondo è un testo.
                            <Text variant="body-sm">Nota: {trimmedOrderNotes}</Text>
                        ) : (
                            <InlineBanner variant="info">{trimmedOrderNotes}</InlineBanner>
                        )}
                    </div>
                )}

                <div className={styles.total}>
                    <Text as="span" variant="body-sm" weight={600}>
                        Totale
                    </Text>
                    <Text as="span" weight={600}>
                        {formatEur(order.total_amount)}
                    </Text>
                </div>

                {canManage !== false && (
                    <div className={styles.footer}>
                        <Menu
                            align="start"
                            side="top"
                            trigger={
                                <IconButton
                                    icon={<MoreVertical size={18} />}
                                    variant="secondary"
                                    aria-label={`Altre azioni per ${tableLabel}`}
                                    disabled={isProcessing}
                                />
                            }
                        >
                            {(order.status === "submitted" ||
                                order.status === "acknowledged" ||
                                order.status === "ready") && (
                                <Menu.Item icon={Ban} onSelect={() => onCancelItem(order)}>
                                    Annulla articolo
                                </Menu.Item>
                            )}
                            {order.status === "acknowledged" && (
                                <Menu.Item
                                    icon={CheckCheck}
                                    onSelect={() => void runPrimary(() => onDeliver(order))}
                                >
                                    Servito direttamente
                                </Menu.Item>
                            )}
                            {order.status === "acknowledged" && onUnacknowledge && (
                                <Menu.Item
                                    icon={CornerUpLeft}
                                    onSelect={() => void runPrimary(() => onUnacknowledge(order))}
                                >
                                    Rimetti in Nuove
                                </Menu.Item>
                            )}
                            {order.status === "ready" && onUnready && (
                                <Menu.Item
                                    icon={CornerUpLeft}
                                    onSelect={() => void runPrimary(() => onUnready(order))}
                                >
                                    Rimetti in lavorazione
                                </Menu.Item>
                            )}
                            <Menu.Item icon={Eye} onSelect={() => onViewDetail(order)}>
                                Vedi dettaglio
                            </Menu.Item>
                            <Menu.Separator />
                            <Menu.Item
                                icon={Trash2}
                                variant="destructive"
                                onSelect={() => onCancel(order)}
                            >
                                Annulla ordine
                            </Menu.Item>
                        </Menu>

                        {comandaPrintState === "done" && onReprint && order.status !== "cancelled" && (
                            <Tooltip content="Ristampa comanda">
                                <IconButton
                                    icon={<Printer size={16} />}
                                    aria-label="Ristampa comanda"
                                    variant="secondary"
                                    onClick={() => void handleReprint()}
                                    disabled={isProcessing || isReprinting || canEdit === false}
                                />
                            </Tooltip>
                        )}

                        {order.status === "submitted" && primaryAction("Conferma", () => onAcknowledge(order))}
                        {order.status === "acknowledged" && onMarkReady && primaryAction("Pronto", () => onMarkReady(order))}
                        {order.status === "acknowledged" && !onMarkReady && primaryAction("Consegna", () => onDeliver(order))}
                        {order.status === "ready" && primaryAction("Servita", () => onDeliver(order))}
                    </div>
                )}
            </Card>
        </div>
    );
}
