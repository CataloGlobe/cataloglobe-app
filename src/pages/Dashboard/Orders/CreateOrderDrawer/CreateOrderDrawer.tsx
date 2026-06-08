import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SearchInput } from "@/components/ui/Input/SearchInput";

import { useToast } from "@/context/Toast/ToastContext";

import { submitOrderAdmin } from "@/services/supabase/orders";
import { resolveActivityCatalogs } from "@/services/supabase/resolveActivityCatalogs";
import { listTablesWithState } from "@/services/supabase/tables";
import type {
    ResolvedCollections,
    ResolvedProduct,
    ResolvedCatalog
} from "@/services/supabase/resolveActivityCatalogs";
import type { OrderItemRequest, V2TableWithState } from "@/types/orders";

import { ProductPicker } from "./components/ProductPicker";
import { ItemConfigurator } from "./components/ItemConfigurator";
import { CartSummary } from "./components/CartSummary";
import { TableSelect, type SelectedTable } from "./components/TableSelect";

import styles from "./CreateOrderDrawer.module.scss";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

export interface SelectionItem {
    rowId: string;
    product_id: string;
    product_name: string;
    primary_option_value_id?: string;
    primary_option_label?: string;
    addon_value_ids: string[];
    addon_labels: string[];
    qty: number;
    unitPrice: number;
    item_notes?: string;
}

export interface CreateOrderDrawerProps {
    open: boolean;
    tenantId: string | null;
    activityId: string | null;
    onClose: () => void;
    onSubmitted?: () => void;
    /**
     * Tavolo pre-selezionato (opzionale). Se passato, la <select>
     * tavolo viene preimpostata all'apertura del drawer. Pensato per
     * shortcut futuri (CTA da contesto tavolo-specifico).
     */
    initialTableId?: string;
    initialTableLabel?: string;
}

type CatalogState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; catalog: ResolvedCatalog }
    | { kind: "empty" }
    | { kind: "error"; message: string };

interface TablesState {
    items: V2TableWithState[];
    isLoading: boolean;
    error: string | null;
}

const FORM_ID = "create-comanda-form";

export function CreateOrderDrawer({
    open,
    tenantId,
    activityId,
    onClose,
    onSubmitted,
    initialTableId,
    initialTableLabel
}: CreateOrderDrawerProps) {
    const { showToast } = useToast();

    const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(
        initialTableId
            ? { id: initialTableId, label: initialTableLabel ?? "Tavolo" }
            : null
    );
    const [catalogState, setCatalogState] = useState<CatalogState>({ kind: "idle" });
    const [tablesState, setTablesState] = useState<TablesState>({
        items: [],
        isLoading: false,
        error: null
    });
    const [selection, setSelection] = useState<SelectionItem[]>([]);
    const [orderNote, setOrderNote] = useState<string>("");
    const [configuringProductId, setConfiguringProductId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [isStickyExpanded, setIsStickyExpanded] = useState<boolean>(false);

    const loadAll = useCallback(async () => {
        if (!tenantId || !activityId) return;
        setCatalogState({ kind: "loading" });
        setTablesState({ items: [], isLoading: true, error: null });

        // Catalogo + tavoli in parallelo: indipendenti, riducono attesa.
        const [catalogResult, tablesResult] = await Promise.allSettled([
            resolveActivityCatalogs(activityId),
            listTablesWithState(tenantId, activityId)
        ]);

        if (catalogResult.status === "fulfilled") {
            const resolved: ResolvedCollections = catalogResult.value;
            const catalog = resolved.catalog;
            if (!catalog || !catalog.categories || catalog.categories.length === 0) {
                setCatalogState({ kind: "empty" });
            } else {
                setCatalogState({ kind: "ready", catalog });
            }
        } else {
            const err = catalogResult.reason;
            setCatalogState({
                kind: "error",
                message:
                    err instanceof Error ? err.message : "Errore caricamento catalogo"
            });
        }

        if (tablesResult.status === "fulfilled") {
            setTablesState({ items: tablesResult.value, isLoading: false, error: null });
        } else {
            const err = tablesResult.reason;
            setTablesState({
                items: [],
                isLoading: false,
                error: err instanceof Error ? err.message : "Errore caricamento tavoli"
            });
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        if (!open) {
            // Reset completo on close
            setSelectedTable(
                initialTableId
                    ? { id: initialTableId, label: initialTableLabel ?? "Tavolo" }
                    : null
            );
            setCatalogState({ kind: "idle" });
            setTablesState({ items: [], isLoading: false, error: null });
            setSelection([]);
            setOrderNote("");
            setConfiguringProductId(null);
            setIsSubmitting(false);
            setSearchQuery("");
            setIsStickyExpanded(false);
            return;
        }
        void loadAll();
    }, [open, initialTableId, initialTableLabel, loadAll]);

    const total = useMemo(
        () => selection.reduce((acc, s) => acc + s.unitPrice * s.qty, 0),
        [selection]
    );

    const itemsCount = useMemo(
        () => selection.reduce((acc, s) => acc + s.qty, 0),
        [selection]
    );

    function handleAddToCart(item: SelectionItem): void {
        setSelection(prev => [...prev, item]);
        setConfiguringProductId(null);
    }

    function handleRemoveItem(rowId: string): void {
        setSelection(prev => prev.filter(s => s.rowId !== rowId));
    }

    function handleUpdateQty(rowId: string, qty: number): void {
        if (qty <= 0) {
            handleRemoveItem(rowId);
            return;
        }
        setSelection(prev =>
            prev.map(s => (s.rowId === rowId ? { ...s, qty } : s))
        );
    }

    async function handleSubmit(): Promise<void> {
        if (!selectedTable || selection.length === 0 || isSubmitting) return;
        setIsSubmitting(true);

        const items: OrderItemRequest[] = selection.map(s => {
            const entry: OrderItemRequest = {
                product_id: s.product_id,
                quantity: s.qty
            };
            if (s.primary_option_value_id) {
                entry.primary_option_value_id = s.primary_option_value_id;
            }
            if (s.addon_value_ids.length > 0) {
                entry.addon_value_ids = s.addon_value_ids;
            }
            const note = s.item_notes?.trim();
            if (note) {
                entry.item_notes = note;
            }
            return entry;
        });

        const trimmedNote = orderNote.trim();
        const notesArg = trimmedNote.length > 0 ? trimmedNote : undefined;

        try {
            await submitOrderAdmin(selectedTable.id, items, notesArg);
            showToast({ message: "Comanda registrata", type: "success" });
            onSubmitted?.();
            onClose();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Errore durante l'invio della comanda";
            const code = (err as Error & { code?: string }).code;

            if (message === "INVALID_ITEMS") {
                showToast({
                    message:
                        "Alcuni prodotti non sono validi o non sono piu' disponibili. Controlla la selezione.",
                    type: "error"
                });
            } else if (code === "ORDERING_UNAVAILABLE") {
                showToast({
                    message: message || "Comanda non registrabile in questo momento.",
                    type: "error"
                });
                onClose();
            } else {
                showToast({ message, type: "error" });
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    const headerLabel = "Crea ordine";
    const canSubmit = selection.length > 0 && !isSubmitting && !!selectedTable;

    const renderMenuBody = () => {
        if (catalogState.kind === "loading") {
            return (
                <div className={styles.loading}>
                    <Text colorVariant="muted">Caricamento catalogo...</Text>
                </div>
            );
        }
        if (catalogState.kind === "error") {
            return (
                <div className={styles.errorBlock}>
                    <EmptyState
                        icon={<AlertCircle size={40} strokeWidth={1.5} />}
                        title="Errore"
                        description={catalogState.message}
                        action={
                            <Button variant="secondary" onClick={() => void loadAll()}>
                                Riprova
                            </Button>
                        }
                    />
                </div>
            );
        }
        if (catalogState.kind === "empty") {
            return (
                <div className={styles.errorBlock}>
                    <EmptyState
                        icon={<ShoppingCart size={40} strokeWidth={1.5} />}
                        title="Nessun catalogo attivo"
                        description="Non c'e' un catalogo attivo in questo momento per la sede selezionata."
                    />
                </div>
            );
        }
        if (catalogState.kind === "ready") {
            return (
                <ProductPicker
                    catalog={catalogState.catalog}
                    expandedProductId={configuringProductId}
                    onExpand={setConfiguringProductId}
                    query={searchQuery}
                    renderConfigurator={(product: ResolvedProduct) => (
                        <ItemConfigurator
                            product={product}
                            onCancel={() => setConfiguringProductId(null)}
                            onAdd={handleAddToCart}
                        />
                    )}
                />
            );
        }
        return null;
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={960}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {headerLabel}
                    </Text>
                }
                footer={
                    <div className={styles.drawerFooter}>
                        <div className={styles.drawerFooterTotalBlock}>
                            <span className={styles.drawerFooterTotalLabel}>
                                Totale
                            </span>
                            <span className={styles.drawerFooterTotalValue}>
                                {formatEur(total)}
                            </span>
                        </div>
                        <div className={styles.drawerFooterActions}>
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form={FORM_ID}
                                loading={isSubmitting}
                                disabled={!canSubmit}
                            >
                                Invia comanda
                            </Button>
                        </div>
                    </div>
                }
            >
                {!tenantId || !activityId ? (
                    <div className={styles.errorBlock}>
                        <EmptyState
                            icon={<AlertCircle size={40} strokeWidth={1.5} />}
                            title="Sede non disponibile"
                            description="Seleziona una sede per registrare una comanda."
                        />
                    </div>
                ) : (
                    <form
                        id={FORM_ID}
                        className={styles.shell}
                        onSubmit={e => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <div className={styles.topBand}>
                            <div className={styles.topBandRow}>
                                <div className={styles.topBandCol}>
                                    <TableSelect
                                        tables={tablesState.items}
                                        isLoading={tablesState.isLoading}
                                        error={tablesState.error}
                                        value={selectedTable?.id ?? null}
                                        onChange={setSelectedTable}
                                    />
                                </div>
                                <div className={styles.topBandCol}>
                                    <SearchInput
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Cerca prodotto..."
                                        allowClear
                                        onClear={() => setSearchQuery("")}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.body}>
                            <div className={styles.menuPanel}>{renderMenuBody()}</div>

                            <aside
                                className={styles.orderPanel}
                                aria-label="Pannello ordine"
                            >
                                <div className={styles.orderPanelHeader}>
                                    <div className={styles.orderPanelHeaderCaption}>
                                        Tavolo
                                    </div>
                                    {selectedTable ? (
                                        <div className={styles.orderPanelHeaderValue}>
                                            {selectedTable.label}
                                        </div>
                                    ) : (
                                        <div className={styles.orderPanelHeaderEmpty}>
                                            Nessun tavolo selezionato
                                        </div>
                                    )}
                                </div>
                                <div className={styles.orderPanelBody}>
                                    <CartSummary
                                        items={selection}
                                        total={total}
                                        orderNote={orderNote}
                                        onOrderNoteChange={setOrderNote}
                                        onUpdateQty={handleUpdateQty}
                                        onRemove={handleRemoveItem}
                                    />
                                </div>
                            </aside>
                        </div>

                        {/* Sticky cart bar (mobile / 1-col layout): info +
                            espansione carrello. Submit vive nel footer del
                            drawer, qui niente bottone per evitare doppione. */}
                        <div className={styles.stickyBar}>
                            <button
                                type="button"
                                className={styles.stickyHeader}
                                onClick={() => setIsStickyExpanded(v => !v)}
                                aria-expanded={isStickyExpanded}
                            >
                                <div className={styles.stickyLeft}>
                                    <span className={styles.stickyCount}>
                                        {itemsCount}{" "}
                                        {itemsCount === 1 ? "articolo" : "articoli"}
                                    </span>
                                    <span className={styles.stickyTotal}>
                                        {formatEur(total)}
                                    </span>
                                </div>
                                <div className={styles.stickyRight}>
                                    {isStickyExpanded ? (
                                        <ChevronDown size={18} />
                                    ) : (
                                        <ChevronUp size={18} />
                                    )}
                                </div>
                            </button>
                            {isStickyExpanded && (
                                <div className={styles.stickyExpansion}>
                                    <CartSummary
                                        items={selection}
                                        total={total}
                                        orderNote={orderNote}
                                        onOrderNoteChange={setOrderNote}
                                        onUpdateQty={handleUpdateQty}
                                        onRemove={handleRemoveItem}
                                    />
                                </div>
                            )}
                        </div>
                    </form>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default CreateOrderDrawer;
