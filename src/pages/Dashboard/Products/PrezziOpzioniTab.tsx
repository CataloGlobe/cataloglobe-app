import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LayoutGrid, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
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
    createProductOptionGroup,
    updateProductOptionGroup,
    deleteProductOptionGroup,
    createOptionValue,
    updateOptionValue,
    deleteOptionValue,
    createPrimaryPriceFormat,
    getProductOptions
} from "@/services/supabase/productOptions";
import { getDisplayPrice } from "@/utils/priceDisplay";
import styles from "./PrezziOpzioniTab.module.scss";

function formatDelta(n: number | null): string {
    if (n === null) return "—";
    return n >= 0 ? `+${n.toFixed(2)} €` : `${n.toFixed(2)} €`;
}

function computeFromPrice(
    group: GroupWithValues | null | undefined,
    fallback: number | null
): number | null {
    if (group === undefined) return null;
    if (group !== null && group.values.length > 0) {
        const prices = group.values
            .map(v => v.absolute_price)
            .filter((p): p is number => p !== null);
        return prices.length > 0 ? Math.min(...prices) : null;
    }
    return fallback;
}

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
 * il contenuto delle vecchie PricingTab + VariantsTab + ConfigTab.
 * Card Prezzo: SegmentedControl modalità + base price edit + formats CRUD
 * + inherit (per varianti).
 * Card Varianti: lista varianti + EmptyState con CTA manuale + matrice.
 * Card Opzioni extra: CRUD addon groups + values inline.
 */
export default function PrezziOpzioniTab({
    product,
    productId,
    tenantId,
    primaryPriceGroup,
    addonGroups,
    optionsLoading,
    onRefreshOptions,
    onProductUpdated,
    onOpenVariantDrawer
}: PrezziOpzioniTabProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
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

    // ── Card Varianti ──────────────────────────────────────────────────
    // useMemo evita di ricreare array reference ad ogni render — senza
    // memoization l'effect che fetcha variant options entrava in loop
    // perché `variants` era dep e cambiava ref ogni render.
    const variants = useMemo(
        () =>
            [...(product.variants ?? [])].sort((a, b) =>
                a.name.localeCompare(b.name, "it")
            ),
        [product.variants]
    );

    const [variantOptions, setVariantOptions] = useState<
        Record<string, GroupWithValues | null>
    >({});
    const [parentGroup, setParentGroup] = useState<
        GroupWithValues | null | undefined
    >(undefined);

    useEffect(() => {
        if (isVariant) return;
        let cancelled = false;
        void getProductOptions(product.id)
            .then(opts => {
                if (!cancelled) setParentGroup(opts.primaryPriceGroup);
            })
            .catch(() => {
                if (!cancelled) setParentGroup(null);
            });
        return () => {
            cancelled = true;
        };
    }, [product.id, isVariant]);

    useEffect(() => {
        if (isVariant || variants.length === 0) {
            setVariantOptions({});
            return;
        }
        let cancelled = false;
        void Promise.all(
            variants.map(v =>
                getProductOptions(v.id).then(opts => ({
                    id: v.id,
                    group: opts.primaryPriceGroup
                }))
            )
        )
            .then(results => {
                if (cancelled) return;
                const map: Record<string, GroupWithValues | null> = {};
                for (const r of results) {
                    map[r.id] = r.group;
                }
                setVariantOptions(map);
            })
            .catch(() => {
                /* silent — price cells fall back to "—" */
            });
        return () => {
            cancelled = true;
        };
    }, [variants, isVariant]);

    const variantsParentFromPrice = computeFromPrice(parentGroup, product.base_price);

    // ── Card Opzioni extra ────────────────────────────────────────────
    // Create group form (toggle CTA)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [savingNewGroup, setSavingNewGroup] = useState(false);
    const [newGroupError, setNewGroupError] = useState<string | null>(null);

    // Edit group
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupMaxSelectable, setEditGroupMaxSelectable] = useState<number | null>(null);
    const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
    const [groupEditError, setGroupEditError] = useState<string | null>(null);

    // Delete group dialog
    const [deleteGroup, setDeleteGroup] = useState<GroupWithValues | null>(null);
    const [, setDeletingGroupId] = useState<string | null>(null);

    // Edit value
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [editValueName, setEditValueName] = useState("");
    const [editValuePrice, setEditValuePrice] = useState("");
    const [savingValueId, setSavingValueId] = useState<string | null>(null);
    const [valueEditError, setValueEditError] = useState<string | null>(null);

    // Delete value
    const [, setDeletingValueId] = useState<string | null>(null);

    // Add value (per group)
    const [newValueNames, setNewValueNames] = useState<Record<string, string>>({});
    const [newValuePrices, setNewValuePrices] = useState<Record<string, string>>({});
    const [savingNewValueGroupId, setSavingNewValueGroupId] = useState<string | null>(null);
    const [newValueErrors, setNewValueErrors] = useState<Record<string, string | null>>({});

    const handleOpenCreateGroup = () => {
        setIsCreatingGroup(true);
        setNewGroupName("");
        setNewGroupError(null);
    };

    const handleCloseCreateGroup = () => {
        setIsCreatingGroup(false);
        setNewGroupName("");
        setNewGroupError(null);
    };

    const handleCreateGroup = async () => {
        const name = newGroupName.trim();
        if (!name) {
            setNewGroupError("Il nome del gruppo è obbligatorio");
            return;
        }
        try {
            setSavingNewGroup(true);
            setNewGroupError(null);
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name,
                is_required: false,
                max_selectable: null,
                group_kind: "ADDON",
                pricing_mode: "DELTA"
            });
            await onRefreshOptions();
            setNewGroupName("");
            setIsCreatingGroup(false);
        } catch {
            setNewGroupError("Errore nella creazione del gruppo");
            showToast({ message: "Errore nella creazione del gruppo", type: "error" });
        } finally {
            setSavingNewGroup(false);
        }
    };

    const handleStartEditGroup = (group: GroupWithValues) => {
        setEditingGroupId(group.id);
        setEditGroupName(group.name);
        setEditGroupMaxSelectable(group.max_selectable ?? null);
        setGroupEditError(null);
    };

    const handleCancelEditGroup = () => {
        setEditingGroupId(null);
        setGroupEditError(null);
    };

    const handleSaveGroup = async (groupId: string) => {
        const name = editGroupName.trim();
        if (!name) {
            setGroupEditError("Il nome del gruppo è obbligatorio");
            return;
        }
        try {
            setSavingGroupId(groupId);
            await updateProductOptionGroup(groupId, {
                name,
                max_selectable: editGroupMaxSelectable
            });
            await onRefreshOptions();
            setEditingGroupId(null);
        } catch {
            setGroupEditError("Errore nel salvataggio del gruppo");
            showToast({ message: "Errore nel salvataggio del gruppo", type: "error" });
        } finally {
            setSavingGroupId(null);
        }
    };

    const handleConfirmDeleteGroup = async (groupId: string): Promise<boolean> => {
        try {
            setDeletingGroupId(groupId);
            await deleteProductOptionGroup(groupId);
            await onRefreshOptions();
            return true;
        } catch {
            showToast({ message: "Errore nell'eliminazione del gruppo", type: "error" });
            return false;
        } finally {
            setDeletingGroupId(null);
        }
    };

    const handleStartEditValue = (val: V2ProductOptionValue) => {
        setEditingValueId(val.id);
        setEditValueName(val.name);
        setEditValuePrice(val.price_modifier !== null ? String(val.price_modifier) : "0");
        setValueEditError(null);
    };

    const handleCancelEditValue = () => {
        setEditingValueId(null);
        setValueEditError(null);
    };

    const handleSaveValue = async (valueId: string) => {
        const name = editValueName.trim();
        if (!name) {
            setValueEditError("Il nome è obbligatorio");
            return;
        }
        const parsed = parseFloat(editValuePrice.replace(",", "."));
        if (isNaN(parsed)) {
            setValueEditError("Inserisci un numero valido (es. 0.50 o -0.50)");
            return;
        }
        try {
            setSavingValueId(valueId);
            await updateOptionValue(valueId, { name, price_modifier: parsed });
            await onRefreshOptions();
            setEditingValueId(null);
        } catch {
            setValueEditError("Errore nel salvataggio del valore");
            showToast({ message: "Errore nel salvataggio del valore", type: "error" });
        } finally {
            setSavingValueId(null);
        }
    };

    const handleDeleteValue = async (valueId: string) => {
        try {
            setDeletingValueId(valueId);
            await deleteOptionValue(valueId);
            await onRefreshOptions();
        } catch {
            showToast({ message: "Errore nell'eliminazione del valore", type: "error" });
        } finally {
            setDeletingValueId(null);
        }
    };

    const handleAddValue = async (groupId: string) => {
        const name = (newValueNames[groupId] ?? "").trim();
        if (!name) {
            setNewValueErrors(prev => ({ ...prev, [groupId]: "Il nome è obbligatorio" }));
            return;
        }
        const priceStr = (newValuePrices[groupId] ?? "0").replace(",", ".");
        const parsed = parseFloat(priceStr);
        if (isNaN(parsed)) {
            setNewValueErrors(prev => ({
                ...prev,
                [groupId]: "Inserisci un numero valido (es. 0.50 o -0.50)"
            }));
            return;
        }
        try {
            setSavingNewValueGroupId(groupId);
            setNewValueErrors(prev => ({ ...prev, [groupId]: null }));
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: groupId,
                name,
                price_modifier: parsed,
                absolute_price: null
            });
            await onRefreshOptions();
            setNewValueNames(prev => ({ ...prev, [groupId]: "" }));
            setNewValuePrices(prev => ({ ...prev, [groupId]: "" }));
        } catch {
            setNewValueErrors(prev => ({
                ...prev,
                [groupId]: "Errore nell'aggiunta del valore"
            }));
            showToast({ message: "Errore nell'aggiunta del valore", type: "error" });
        } finally {
            setSavingNewValueGroupId(null);
        }
    };

    const valueColumns: ColumnDefinition<V2ProductOptionValue>[] = [
        {
            id: "name",
            header: "Nome",
            cell: (_, val) =>
                editingValueId === val.id ? (
                    <div className={styles.cellStack}>
                        <TextInput
                            value={editValueName}
                            onChange={e => setEditValueName(e.target.value)}
                            placeholder="Nome valore"
                            disabled={savingValueId === val.id}
                        />
                        {valueEditError && (
                            <Text variant="body-sm" colorVariant="error">
                                {valueEditError}
                            </Text>
                        )}
                    </div>
                ) : (
                    <Text variant="body">{val.name}</Text>
                )
        },
        {
            id: "delta",
            header: "Delta €",
            width: "140px",
            cell: (_, val) =>
                editingValueId === val.id ? (
                    <NumberInput
                        value={editValuePrice}
                        onChange={e => setEditValuePrice(e.target.value)}
                        placeholder="Delta €"
                        step="0.01"
                        disabled={savingValueId === val.id}
                    />
                ) : (
                    <Text variant="body">{formatDelta(val.price_modifier)}</Text>
                )
        },
        {
            id: "actions",
            header: "",
            width: "80px",
            align: "right",
            cell: (_, val) =>
                editingValueId === val.id ? (
                    <div className={styles.formatActions}>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSaveValue(val.id)}
                            disabled={savingValueId === val.id}
                            loading={savingValueId === val.id}
                        >
                            Salva
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEditValue}
                            disabled={savingValueId === val.id}
                        >
                            Annulla
                        </Button>
                    </div>
                ) : (
                    <TableRowActions
                        actions={[
                            {
                                label: "Modifica",
                                onClick: () => handleStartEditValue(val)
                            },
                            {
                                label: "Elimina",
                                onClick: () => handleDeleteValue(val.id),
                                variant: "destructive",
                                separator: true
                            }
                        ]}
                    />
                )
        }
    ];

    const variantColumns: ColumnDefinition<V2Product>[] = [
        {
            id: "name",
            header: "Nome",
            cell: (_, variant) => (
                <Text variant="body" weight={500}>
                    {variant.name}
                </Text>
            )
        },
        {
            id: "price",
            header: "Prezzo",
            width: "160px",
            cell: (_, variant) => {
                const group = variantOptions[variant.id];
                if (group === undefined) {
                    return (
                        <Text variant="body" colorVariant="muted">
                            —
                        </Text>
                    );
                }
                const fromPrice = computeFromPrice(group, null);
                if (group !== null && group.values.length > 0) {
                    return fromPrice !== null ? (
                        <Text variant="body">da {fromPrice.toFixed(2)} €</Text>
                    ) : (
                        <Text variant="body" colorVariant="muted">
                            —
                        </Text>
                    );
                }
                if (variant.base_price != null) {
                    return (
                        <Text variant="body">{variant.base_price.toFixed(2)} €</Text>
                    );
                }
                if (variantsParentFromPrice !== null) {
                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            {variantsParentFromPrice.toFixed(2)} € (ereditato)
                        </Text>
                    );
                }
                return (
                    <Text variant="body" colorVariant="muted">
                        —
                    </Text>
                );
            }
        },
        {
            id: "actions",
            header: "",
            width: "48px",
            align: "right",
            cell: (_, variant) => (
                <TableRowActions
                    actions={[
                        {
                            label: "Modifica",
                            onClick: () =>
                                navigate(`/business/${businessId}/products/${variant.id}`)
                        }
                    ]}
                />
            )
        }
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

            {/* ──────────────── Card 2 — Varianti ──────────────── */}
            {!isVariant && (
                <section className={styles.card} data-section="varianti">
                    <header className={styles.cardHeader}>
                        <div className={styles.cardHeaderContent}>
                            <span className={styles.cardLabel}>Varianti</span>
                            {variants.length > 0 && (
                                <Badge variant="secondary">{variants.length}</Badge>
                            )}
                        </div>
                        {variants.length > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onOpenVariantDrawer}
                            >
                                + Aggiungi
                            </Button>
                        )}
                    </header>

                    {variants.length === 0 ? (
                        <EmptyState
                            icon={<LayoutGrid size={24} strokeWidth={1.8} />}
                            title="Nessuna variante"
                            description="Le varianti hanno prezzo e descrizione propri. Si vedono come prodotti separati nel menu pubblico."
                            action={
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={onOpenVariantDrawer}
                                >
                                    Aggiungi manualmente
                                </Button>
                            }
                        />
                    ) : (
                        <DataTable
                            data={variants}
                            columns={variantColumns}
                            onRowClick={variant =>
                                navigate(
                                    `/business/${businessId}/products/${variant.id}`
                                )
                            }
                        />
                    )}
                </section>
            )}

            {/* ──────────────── Card 3 — Opzioni extra ──────────────── */}
            <section className={styles.card} data-section="opzioni">
                <header className={styles.cardHeader}>
                    <div className={styles.cardHeaderContent}>
                        <span className={styles.cardLabel}>Opzioni extra</span>
                    </div>
                    {addonGroups.length > 0 && !isCreatingGroup && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleOpenCreateGroup}
                        >
                            + Crea gruppo
                        </Button>
                    )}
                </header>
                <div className={styles.cardHelp}>
                    Configurazioni selezionabili dal cliente (es. cottura, aggiunte)
                </div>

                {/* Inline create group form */}
                {isCreatingGroup && (
                    <div className={styles.createGroupForm}>
                        <TextInput
                            label="Nome gruppo"
                            placeholder="Es. Cottura, Aggiunte..."
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            disabled={savingNewGroup}
                            error={newGroupError ?? undefined}
                        />
                        <div className={styles.formatActions}>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={handleCreateGroup}
                                disabled={savingNewGroup}
                                loading={savingNewGroup}
                            >
                                Crea
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleCloseCreateGroup}
                                disabled={savingNewGroup}
                            >
                                Annulla
                            </Button>
                        </div>
                    </div>
                )}

                {optionsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento configurazioni...
                    </Text>
                ) : addonGroups.length === 0 && !isCreatingGroup ? (
                    <EmptyState
                        icon={<ListPlus size={24} strokeWidth={1.8} />}
                        title="Nessuna opzione extra"
                        description='Aggiungi gruppi come "Cottura" (al sangue/medio/ben cotta) o "Aggiunte" (mozzarella, prosciutto…).'
                        action={
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleOpenCreateGroup}
                            >
                                + Crea primo gruppo
                            </Button>
                        }
                    />
                ) : addonGroups.length > 0 ? (
                    <div className={styles.optionGroupsList}>
                        {addonGroups.map(group => (
                            <div key={group.id} className={styles.groupCard}>
                                {editingGroupId === group.id ? (
                                    <div className={styles.groupEditForm}>
                                        <TextInput
                                            label="Nome gruppo"
                                            value={editGroupName}
                                            onChange={e => setEditGroupName(e.target.value)}
                                            disabled={savingGroupId === group.id}
                                        />
                                        <Switch
                                            label="Limita selezione"
                                            checked={editGroupMaxSelectable !== null}
                                            onChange={checked =>
                                                setEditGroupMaxSelectable(checked ? 1 : null)
                                            }
                                            disabled={savingGroupId === group.id}
                                        />
                                        {editGroupMaxSelectable !== null && (
                                            <NumberInput
                                                label="Massimo selezionabile"
                                                min="1"
                                                value={editGroupMaxSelectable.toString()}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (!isNaN(val) && val > 0)
                                                        setEditGroupMaxSelectable(val);
                                                }}
                                                disabled={savingGroupId === group.id}
                                            />
                                        )}
                                        {groupEditError && (
                                            <Text variant="body-sm" colorVariant="error">
                                                {groupEditError}
                                            </Text>
                                        )}
                                        <div className={styles.formatActions}>
                                            <Button
                                                type="button"
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handleSaveGroup(group.id)}
                                                disabled={savingGroupId === group.id}
                                                loading={savingGroupId === group.id}
                                            >
                                                Salva
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancelEditGroup}
                                                disabled={savingGroupId === group.id}
                                            >
                                                Annulla
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.groupHeader}>
                                        <div className={styles.groupMeta}>
                                            <Text variant="body" weight={600}>
                                                {group.name}
                                            </Text>
                                            <Badge variant="secondary">
                                                {group.values.length}{" "}
                                                {group.values.length === 1 ? "opzione" : "opzioni"}
                                            </Badge>
                                            {group.max_selectable != null && (
                                                <Badge variant="secondary">
                                                    max {group.max_selectable}
                                                </Badge>
                                            )}
                                        </div>
                                        <TableRowActions
                                            actions={[
                                                {
                                                    label: "Modifica",
                                                    onClick: () => handleStartEditGroup(group)
                                                },
                                                {
                                                    label: "Elimina",
                                                    onClick: () => setDeleteGroup(group),
                                                    variant: "destructive",
                                                    separator: true
                                                }
                                            ]}
                                        />
                                    </div>
                                )}

                                <DataTable
                                    data={group.values}
                                    columns={valueColumns}
                                    emptyState={{ title: "Nessun valore configurato" }}
                                />

                                <div className={styles.addValueRow}>
                                    <TextInput
                                        placeholder="Nome (es. Latte)"
                                        value={newValueNames[group.id] ?? ""}
                                        onChange={e =>
                                            setNewValueNames(prev => ({
                                                ...prev,
                                                [group.id]: e.target.value
                                            }))
                                        }
                                        disabled={savingNewValueGroupId === group.id}
                                    />
                                    <NumberInput
                                        placeholder="Delta € (es. 0.50)"
                                        value={newValuePrices[group.id] ?? ""}
                                        onChange={e =>
                                            setNewValuePrices(prev => ({
                                                ...prev,
                                                [group.id]: e.target.value
                                            }))
                                        }
                                        step="0.01"
                                        disabled={savingNewValueGroupId === group.id}
                                    />
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleAddValue(group.id)}
                                        disabled={savingNewValueGroupId === group.id}
                                        loading={savingNewValueGroupId === group.id}
                                    >
                                        Aggiungi
                                    </Button>
                                </div>
                                {newValueErrors[group.id] && (
                                    <Text variant="body-sm" colorVariant="error">
                                        {newValueErrors[group.id]}
                                    </Text>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}

                {deleteGroup && (
                    <ConfirmDialog
                        isOpen={true}
                        onClose={() => setDeleteGroup(null)}
                        onConfirm={() => handleConfirmDeleteGroup(deleteGroup.id)}
                        title={`Elimina "${deleteGroup.name}"`}
                        message="Sei sicuro di voler eliminare questo gruppo? Tutti i valori associati verranno eliminati."
                        confirmLabel="Elimina"
                    />
                )}
            </section>
        </div>
    );
}
