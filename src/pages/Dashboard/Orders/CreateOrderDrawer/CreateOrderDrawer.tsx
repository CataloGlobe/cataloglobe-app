import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, AlertCircle } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";

import { useToast } from "@/context/Toast/ToastContext";

import { submitOrderAdmin } from "@/services/supabase/orders";
import { resolveActivityCatalogs } from "@/services/supabase/resolveActivityCatalogs";
import type {
    ResolvedCollections,
    ResolvedProduct,
    ResolvedCatalog
} from "@/services/supabase/resolveActivityCatalogs";
import type { OrderItemRequest } from "@/types/orders";

import { ProductPicker } from "./components/ProductPicker";
import { ItemConfigurator } from "./components/ItemConfigurator";
import { CartSummary } from "./components/CartSummary";
import { TablePicker } from "./components/TablePicker";

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

interface SelectedTable {
    id: string;
    label: string;
}

export interface CreateOrderDrawerProps {
    open: boolean;
    tenantId: string | null;
    activityId: string | null;
    onClose: () => void;
    onSubmitted?: () => void;
    /**
     * Tavolo pre-selezionato (opzionale). Se passato all'apertura del
     * drawer, il picker viene saltato e si entra direttamente in step
     * "build". Pensato per shortcut futuri (es. CTA dentro un drawer
     * tavolo-specifico). Senza valore: il drawer parte dal picker.
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

type Step = "pick-table" | "build";

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
    const [step, setStep] = useState<Step>(
        initialTableId ? "build" : "pick-table"
    );
    const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(
        initialTableId
            ? { id: initialTableId, label: initialTableLabel ?? "Tavolo" }
            : null
    );
    const [catalogState, setCatalogState] = useState<CatalogState>({ kind: "idle" });
    const [selection, setSelection] = useState<SelectionItem[]>([]);
    const [orderNote, setOrderNote] = useState<string>("");
    const [configuringProductId, setConfiguringProductId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadCatalog = useCallback(async () => {
        if (!activityId) return;
        setCatalogState({ kind: "loading" });
        try {
            const resolved: ResolvedCollections = await resolveActivityCatalogs(activityId);
            const catalog = resolved.catalog;
            if (!catalog || !catalog.categories || catalog.categories.length === 0) {
                setCatalogState({ kind: "empty" });
                return;
            }
            setCatalogState({ kind: "ready", catalog });
        } catch (err) {
            setCatalogState({
                kind: "error",
                message:
                    err instanceof Error
                        ? err.message
                        : "Errore caricamento catalogo"
            });
        }
    }, [activityId]);

    useEffect(() => {
        if (!open) {
            // Reset completo on close
            setStep(initialTableId ? "build" : "pick-table");
            setSelectedTable(
                initialTableId
                    ? { id: initialTableId, label: initialTableLabel ?? "Tavolo" }
                    : null
            );
            setCatalogState({ kind: "idle" });
            setSelection([]);
            setOrderNote("");
            setConfiguringProductId(null);
            setIsSubmitting(false);
            return;
        }
        // Catalogo è activity-level: lo precarica in background appena il drawer
        // apre, indipendentemente dallo step. Quando l'utente sceglie il
        // tavolo, lo step "build" lo trova già pronto.
        void loadCatalog();
    }, [open, initialTableId, initialTableLabel, loadCatalog]);

    const total = useMemo(
        () => selection.reduce((acc, s) => acc + s.unitPrice * s.qty, 0),
        [selection]
    );

    function handleSelectTable(table: SelectedTable): void {
        setSelectedTable(table);
        setStep("build");
    }

    function handleChangeTable(): void {
        // Mantiene il carrello: l'utente cambia il tavolo destinazione,
        // non la composizione dell'ordine.
        setStep("pick-table");
    }

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

    const headerLabel =
        step === "build" && selectedTable
            ? `Crea comanda · ${selectedTable.label}`
            : "Crea comanda · scegli tavolo";

    const canSubmit =
        step === "build" && selection.length > 0 && !isSubmitting && !!selectedTable;

    return (
        <SystemDrawer open={open} onClose={onClose} width={720}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {headerLabel}
                    </Text>
                }
                footer={
                    step === "build" ? (
                        <div className={styles.footerActions}>
                            <div className={styles.footerTotalBlock}>
                                <Text
                                    variant="caption"
                                    colorVariant="muted"
                                    className={styles.footerTotalLabel}
                                >
                                    Totale
                                </Text>
                                <Text
                                    variant="title-sm"
                                    weight={700}
                                    className={styles.footerTotalValue}
                                >
                                    {formatEur(total)}
                                </Text>
                            </div>
                            <div className={styles.footerButtons}>
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
                    ) : (
                        <Button variant="secondary" onClick={onClose}>
                            Annulla
                        </Button>
                    )
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
                ) : step === "pick-table" ? (
                    <div className={styles.content}>
                        <TablePicker
                            tenantId={tenantId}
                            activityId={activityId}
                            onSelect={handleSelectTable}
                        />
                    </div>
                ) : (
                    <form
                        id={FORM_ID}
                        onSubmit={e => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <div className={styles.content}>
                            {selectedTable && (
                                <div className={styles.tableBanner}>
                                    <div className={styles.tableBannerLabel}>
                                        <span className={styles.tableBannerCaption}>
                                            Tavolo
                                        </span>
                                        <span className={styles.tableBannerValue}>
                                            {selectedTable.label}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.changeTableButton}
                                        onClick={handleChangeTable}
                                    >
                                        Cambia tavolo
                                    </button>
                                </div>
                            )}

                            {catalogState.kind === "loading" && (
                                <div className={styles.loading}>
                                    <Text colorVariant="muted">Caricamento catalogo...</Text>
                                </div>
                            )}

                            {catalogState.kind === "error" && (
                                <div className={styles.errorBlock}>
                                    <EmptyState
                                        icon={<AlertCircle size={40} strokeWidth={1.5} />}
                                        title="Errore"
                                        description={catalogState.message}
                                        action={
                                            <Button
                                                variant="secondary"
                                                onClick={() => void loadCatalog()}
                                            >
                                                Riprova
                                            </Button>
                                        }
                                    />
                                </div>
                            )}

                            {catalogState.kind === "empty" && (
                                <div className={styles.errorBlock}>
                                    <EmptyState
                                        icon={<ShoppingCart size={40} strokeWidth={1.5} />}
                                        title="Nessun catalogo attivo"
                                        description="Non c'e' un catalogo attivo in questo momento per la sede selezionata."
                                    />
                                </div>
                            )}

                            {catalogState.kind === "ready" && (
                                <>
                                    <ProductPicker
                                        catalog={catalogState.catalog}
                                        expandedProductId={configuringProductId}
                                        onExpand={setConfiguringProductId}
                                        renderConfigurator={(product: ResolvedProduct) => (
                                            <ItemConfigurator
                                                product={product}
                                                onCancel={() => setConfiguringProductId(null)}
                                                onAdd={handleAddToCart}
                                            />
                                        )}
                                    />
                                    <CartSummary
                                        items={selection}
                                        total={total}
                                        orderNote={orderNote}
                                        onOrderNoteChange={setOrderNote}
                                        onUpdateQty={handleUpdateQty}
                                        onRemove={handleRemoveItem}
                                    />
                                </>
                            )}
                        </div>
                    </form>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default CreateOrderDrawer;
