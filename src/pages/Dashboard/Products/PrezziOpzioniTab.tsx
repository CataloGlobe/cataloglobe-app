import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    type V2Product,
    updateProduct,
    getProduct
} from "@/services/supabase/products";
import {
    type GroupWithValues,
    type V2ProductOptionValue,
    updateOptionValue,
    deleteOptionValue,
    deleteProductOptionGroup,
    createPrimaryPriceFormat,
    getProductOptions
} from "@/services/supabase/productOptions";
import { getDisplayPrice } from "@/utils/priceDisplay";
import styles from "./PrezziOpzioniTab.module.scss";

type PriceMode = "inherit" | "single" | "formats";

interface PrezziOpzioniTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    primaryPriceGroup: GroupWithValues | null;
    addonGroups: GroupWithValues[];
    optionsLoading: boolean;
    onRefreshOptions: () => Promise<void>;
    onProductUpdated: (product: V2Product) => void;
    onOpenVariantDrawer: () => void;
    onVariantUpdated: () => Promise<void> | void;
}

/**
 * Tab "Prezzi & Opzioni" — orchestrator delle 3 sub-card che assorbono
 * PricingTab + VariantsTab + ConfigTab. Task 2.2: card Prezzo migrata
 * (logica completa da PricingTab.tsx). Card Varianti + Opzioni extra
 * ancora placeholder, migrazione in 2.3 + 2.4.
 */
export default function PrezziOpzioniTab({
    product,
    tenantId,
    primaryPriceGroup,
    optionsLoading,
    onRefreshOptions,
    onProductUpdated
}: PrezziOpzioniTabProps) {
    const { showToast } = useToast();
    const isVariant = product.parent_product_id !== null;

    // ── Card Prezzo ────────────────────────────────────────────────────

    // Base price inline edit
    const [editingBasePrice, setEditingBasePrice] = useState(false);
    const [basePriceInput, setBasePriceInput] = useState("");
    const [savingBasePrice, setSavingBasePrice] = useState(false);
    const [basePriceError, setBasePriceError] = useState<string | null>(null);

    // Format inline edit
    const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
    const [editingFormatName, setEditingFormatName] = useState("");
    const [editingFormatPrice, setEditingFormatPrice] = useState("");
    const [savingFormatId, setSavingFormatId] = useState<string | null>(null);
    const [formatEditError, setFormatEditError] = useState<string | null>(null);

    // Format delete
    const [, setDeletingFormatId] = useState<string | null>(null);

    // Add format form
    const [newFormatName, setNewFormatName] = useState("");
    const [newFormatPrice, setNewFormatPrice] = useState("");
    const [savingNewFormat, setSavingNewFormat] = useState(false);
    const [newFormatError, setNewFormatError] = useState<string | null>(null);

    // Mode switching
    const [, setIsSwitchingMode] = useState(false);

    // Parent product data (for variants in inherit mode)
    const [parentProduct, setParentProduct] = useState<V2Product | null>(null);
    const [parentPrimaryGroup, setParentPrimaryGroup] = useState<GroupWithValues | null>(null);
    const [isLoadingParent, setIsLoadingParent] = useState(false);

    const formats = primaryPriceGroup?.values ?? [];
    const hasFormats = formats.length > 0;

    // Price mode — derived from actual data once options have loaded.
    const [priceMode, setPriceMode] = useState<PriceMode>("single");

    useEffect(() => {
        if (!optionsLoading) {
            const hasFormatValues = (primaryPriceGroup?.values ?? []).length > 0;
            if (hasFormatValues) {
                setPriceMode("formats");
            } else if (isVariant && product.base_price === null) {
                setPriceMode("inherit");
            } else {
                setPriceMode("single");
            }
        }
    }, [optionsLoading, primaryPriceGroup, product.base_price, isVariant]);

    // Load parent when this is a variant
    const loadParent = useCallback(async () => {
        if (!isVariant || !product.parent_product_id) return;
        setIsLoadingParent(true);
        try {
            const [parent, opts] = await Promise.all([
                getProduct(product.parent_product_id, tenantId),
                getProductOptions(product.parent_product_id)
            ]);
            setParentProduct(parent);
            setParentPrimaryGroup(opts.primaryPriceGroup);
        } catch {
            /* parent load failure is silent — display shows "—" */
        } finally {
            setIsLoadingParent(false);
        }
    }, [product.parent_product_id, tenantId, isVariant]);

    useEffect(() => {
        loadParent();
    }, [loadParent]);

    // Effective price of the parent for display
    const parentEffectivePrice = parentProduct
        ? getDisplayPrice({
              base_price: parentProduct.base_price,
              option_groups: parentPrimaryGroup
                  ? [
                        {
                            group_kind: "PRIMARY_PRICE",
                            values: parentPrimaryGroup.values
                        }
                    ]
                  : undefined
          })
        : null;

    // --- Mode switching ---
    const handleSwitchMode = async (newMode: PriceMode) => {
        if (newMode === priceMode) return;

        if (newMode === "inherit") {
            try {
                setIsSwitchingMode(true);
                if (product.base_price !== null) {
                    const updated = await updateProduct(product.id, tenantId, {
                        base_price: null
                    });
                    onProductUpdated(updated);
                }
                if (primaryPriceGroup) {
                    await deleteProductOptionGroup(primaryPriceGroup.id, tenantId);
                    await onRefreshOptions();
                }
            } catch {
                showToast({ message: "Errore nel cambio modalità prezzo", type: "error" });
            } finally {
                setIsSwitchingMode(false);
            }
        }

        setPriceMode(newMode);
    };

    // --- Base price ---
    const handleStartEditBasePrice = () => {
        setBasePriceInput(product.base_price !== null ? String(product.base_price) : "");
        setBasePriceError(null);
        setEditingBasePrice(true);
    };

    const handleCancelEditBasePrice = () => {
        setEditingBasePrice(false);
        setBasePriceError(null);
    };

    const handleSaveBasePrice = async () => {
        const parsed = parseFloat(basePriceInput.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setBasePriceError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingBasePrice(true);
            const updated = await updateProduct(product.id, tenantId, { base_price: parsed });
            onProductUpdated(updated);
            setEditingBasePrice(false);
            showToast({ message: "Prezzo aggiornato", type: "success" });
        } catch {
            setBasePriceError("Errore nel salvataggio del prezzo base");
            showToast({ message: "Errore nel salvataggio del prezzo", type: "error" });
        } finally {
            setSavingBasePrice(false);
        }
    };

    // --- Format edit ---
    const handleStartEditFormat = (val: V2ProductOptionValue) => {
        setEditingFormatId(val.id);
        setEditingFormatName(val.name);
        setEditingFormatPrice(val.absolute_price !== null ? String(val.absolute_price) : "");
        setFormatEditError(null);
    };

    const handleCancelEditFormat = () => {
        setEditingFormatId(null);
        setFormatEditError(null);
    };

    const handleSaveFormat = async (valueId: string) => {
        const name = editingFormatName.trim();
        if (!name) {
            setFormatEditError("Il nome non può essere vuoto");
            return;
        }
        const parsed = parseFloat(editingFormatPrice.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setFormatEditError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingFormatId(valueId);
            await updateOptionValue(valueId, { name, absolute_price: parsed });
            await onRefreshOptions();
            setEditingFormatId(null);
            showToast({ message: "Formato aggiornato", type: "success" });
        } catch {
            setFormatEditError("Errore nel salvataggio del formato");
            showToast({ message: "Errore nel salvataggio del formato", type: "error" });
        } finally {
            setSavingFormatId(null);
        }
    };

    // --- Format delete ---
    const handleDeleteFormat = async (val: V2ProductOptionValue) => {
        try {
            setDeletingFormatId(val.id);
            await deleteOptionValue(val.id);
            const remainingValues = formats.filter(v => v.id !== val.id);
            if (remainingValues.length === 0 && primaryPriceGroup) {
                await deleteProductOptionGroup(primaryPriceGroup.id, tenantId);
            }
            await onRefreshOptions();
            showToast({ message: "Formato eliminato", type: "success" });
        } catch {
            showToast({ message: "Errore nell'eliminazione del formato", type: "error" });
        } finally {
            setDeletingFormatId(null);
        }
    };

    // --- Add format ---
    const handleAddFormat = async () => {
        const name = newFormatName.trim();
        if (!name) {
            setNewFormatError("Il nome non può essere vuoto");
            return;
        }
        const parsed = parseFloat(newFormatPrice.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setNewFormatError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingNewFormat(true);
            setNewFormatError(null);
            await createPrimaryPriceFormat(product.id, tenantId, name, parsed);
            await onRefreshOptions();
            setNewFormatName("");
            setNewFormatPrice("");
            showToast({ message: "Formato aggiunto", type: "success" });
        } catch {
            setNewFormatError("Errore nell'aggiunta del formato");
            showToast({ message: "Errore nell'aggiunta del formato", type: "error" });
        } finally {
            setSavingNewFormat(false);
        }
    };

    const modeOptions = isVariant
        ? [
              { value: "inherit" as PriceMode, label: "Eredita" },
              { value: "single" as PriceMode, label: "Prezzo singolo" },
              { value: "formats" as PriceMode, label: "Formati" }
          ]
        : [
              { value: "single" as PriceMode, label: "Prezzo singolo" },
              { value: "formats" as PriceMode, label: "Prezzi per formato" }
          ];

    return (
        <div className={styles.grid}>
            {/* ──────────────── Card 1 — Prezzo ──────────────── */}
            <section className={styles.card} data-section="prezzo">
                <header className={styles.cardHeader}>
                    <span className={styles.cardLabel}>Prezzo</span>
                </header>
                <div className={styles.cardHelp}>
                    Come vuoi indicare il prezzo per questo prodotto
                </div>

                <div className={styles.modeRow}>
                    <SegmentedControl<PriceMode>
                        value={priceMode}
                        onChange={newMode => {
                            void handleSwitchMode(newMode);
                        }}
                        options={modeOptions}
                    />
                </div>

                {/* ── Single mode ───────────────────────────────────── */}
                {priceMode === "single" && (
                    <div className={styles.singleMode}>
                        {isVariant && (
                            <Text variant="body-sm" colorVariant="muted">
                                Prezzo della variante, indipendente dal prodotto principale.
                            </Text>
                        )}
                        {editingBasePrice ? (
                            <div className={styles.priceEditRow}>
                                <NumberInput
                                    value={basePriceInput}
                                    onChange={e => setBasePriceInput(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    error={basePriceError ?? undefined}
                                    disabled={savingBasePrice}
                                />
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleSaveBasePrice}
                                    disabled={savingBasePrice}
                                    loading={savingBasePrice}
                                >
                                    Salva
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEditBasePrice}
                                    disabled={savingBasePrice}
                                >
                                    Annulla
                                </Button>
                            </div>
                        ) : (
                            <div className={styles.priceDisplay}>
                                <span className={styles.priceValue}>
                                    {product.base_price !== null
                                        ? product.base_price.toFixed(2)
                                        : "—"}
                                </span>
                                <span className={styles.priceCurrency}>€</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleStartEditBasePrice}
                                >
                                    Modifica
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Formats mode ──────────────────────────────────── */}
                {priceMode === "formats" && (
                    <div className={styles.formatsMode}>
                        {optionsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento formati...
                            </Text>
                        ) : (
                            <>
                                {hasFormats ? (
                                    formats.map(val =>
                                        editingFormatId === val.id ? (
                                            <div
                                                key={val.id}
                                                className={styles.formatEditRow}
                                            >
                                                <TextInput
                                                    value={editingFormatName}
                                                    onChange={e =>
                                                        setEditingFormatName(e.target.value)
                                                    }
                                                    placeholder="Nome formato"
                                                    disabled={savingFormatId === val.id}
                                                />
                                                <NumberInput
                                                    value={editingFormatPrice}
                                                    onChange={e =>
                                                        setEditingFormatPrice(e.target.value)
                                                    }
                                                    placeholder="Prezzo €"
                                                    min="0"
                                                    step="0.01"
                                                    disabled={savingFormatId === val.id}
                                                />
                                                <div className={styles.formatActions}>
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleSaveFormat(val.id)
                                                        }
                                                        disabled={savingFormatId === val.id}
                                                        loading={savingFormatId === val.id}
                                                    >
                                                        Salva
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handleCancelEditFormat}
                                                        disabled={savingFormatId === val.id}
                                                    >
                                                        Annulla
                                                    </Button>
                                                </div>
                                                {formatEditError && (
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="error"
                                                        className={styles.formatRowError}
                                                    >
                                                        {formatEditError}
                                                    </Text>
                                                )}
                                            </div>
                                        ) : (
                                            <div key={val.id} className={styles.formatRow}>
                                                <Text variant="body" weight={500}>
                                                    {val.name}
                                                </Text>
                                                <Text variant="body">
                                                    {val.absolute_price !== null
                                                        ? `${val.absolute_price.toFixed(2)} €`
                                                        : "—"}
                                                </Text>
                                                <div className={styles.formatActions}>
                                                    <TableRowActions
                                                        actions={[
                                                            {
                                                                label: "Modifica",
                                                                onClick: () =>
                                                                    handleStartEditFormat(val)
                                                            },
                                                            {
                                                                label: "Elimina",
                                                                onClick: () =>
                                                                    handleDeleteFormat(val),
                                                                variant: "destructive",
                                                                separator: true
                                                            }
                                                        ]}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    )
                                ) : (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Nessun formato configurato. Aggiungi il primo formato qui sotto.
                                    </Text>
                                )}

                                <div className={styles.addFormatRow}>
                                    <TextInput
                                        placeholder="Nome (es. 33cl)"
                                        value={newFormatName}
                                        onChange={e => setNewFormatName(e.target.value)}
                                        disabled={savingNewFormat}
                                    />
                                    <NumberInput
                                        placeholder="Prezzo €"
                                        value={newFormatPrice}
                                        onChange={e => setNewFormatPrice(e.target.value)}
                                        min="0"
                                        step="0.01"
                                        disabled={savingNewFormat}
                                    />
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={handleAddFormat}
                                        disabled={savingNewFormat}
                                        loading={savingNewFormat}
                                    >
                                        Aggiungi
                                    </Button>
                                </div>
                                {newFormatError && (
                                    <Text variant="body-sm" colorVariant="error">
                                        {newFormatError}
                                    </Text>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── Inherit mode ──────────────────────────────────── */}
                {priceMode === "inherit" && (
                    <div className={styles.inheritMode}>
                        {isLoadingParent ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento prodotto padre...
                            </Text>
                        ) : (
                            <>
                                <Text variant="body-sm" colorVariant="muted">
                                    Il prezzo viene ereditato dal prodotto padre. Modificalo lì.
                                </Text>
                                {parentProduct && (
                                    <Text variant="body-sm">
                                        Padre:{" "}
                                        <strong>{parentProduct.name}</strong>
                                        {parentEffectivePrice &&
                                            parentEffectivePrice.type !== "none" &&
                                            ` — ${parentEffectivePrice.label}`}
                                    </Text>
                                )}
                            </>
                        )}
                    </div>
                )}
            </section>

            {/* ──────────────── Card 2 — Varianti — placeholder ──────────────── */}
            {!isVariant && (
                <section className={styles.card} data-section="varianti">
                    <header className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Varianti</span>
                    </header>
                    <div className={styles.placeholder}>
                        Sub-sezione Varianti — Task 2.3
                    </div>
                </section>
            )}

            {/* ──────────────── Card 3 — Opzioni extra — placeholder ──────────────── */}
            <section className={styles.card} data-section="opzioni">
                <header className={styles.cardHeader}>
                    <span className={styles.cardLabel}>Opzioni extra</span>
                </header>
                <div className={styles.placeholder}>
                    Sub-sezione Opzioni extra — Task 2.4
                </div>
            </section>
        </div>
    );
}
