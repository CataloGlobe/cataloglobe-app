import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { formatCurrency } from "@/utils/formatCurrency";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    type V2Product,
    updateProduct,
    getProduct
} from "@/services/supabase/products";
import {
    type GroupWithValues,
    createProductOptionGroup,
    updateProductOptionGroup,
    deleteProductOptionGroup,
    createOptionValue,
    updateOptionValue,
    deleteOptionValue,
    getProductOptions
} from "@/services/supabase/productOptions";
import { OptionValueList } from "./components/OptionValueList/OptionValueList";
import { ChoiceRulesEditor } from "./components/ChoiceRulesEditor";
import { parseMaxSelectable, type MaxSelectableMode } from "./components/choiceRules";
import { resolvePriceMode, shouldConfirmRevertToUnico, type PriceMode } from "./priceMode";
import { getDisplayPrice } from "@/utils/priceDisplay";
import { resolvePriceSummary } from "@/utils/priceSummary";
import styles from "./PrezziOpzioniTab.module.scss";

function computeFromPrice(
    group: GroupWithValues | null | undefined,
    fallback: number | null
): number | null {
    if (group === undefined) return null;
    if (group !== null && group.values.length > 0) {
        return resolvePriceSummary(group.values.map(v => v.absolute_price)).min;
    }
    return fallback;
}

/** Riga informativa sotto la lista formati — stessa regola del resolver
 * (`resolveActivityCatalogs.ts`): 1 valore prezzato → prezzo secco, 2+ →
 * "da X" sul minimo. */
function formatPricePreview(group: GroupWithValues, menuLabel: string): string | null {
    const summary = resolvePriceSummary(group.values.map(v => v.absolute_price));
    if (summary.kind === "none" || summary.min === null) return null;
    const price = formatCurrency(summary.min);
    return `Nel ${menuLabel} si legge ${summary.kind === "single" ? price : `da ${price}`}.`;
}

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
}

/**
 * Tab "Prezzi & Opzioni" — 3 card: Prezzo (Unico/Per formato su
 * `SegmentedControl` — il gruppo PRIMARY_PRICE è un dettaglio implementativo,
 * mai mostrato come "gruppo" da gestire), Configurazioni (gruppi ADDON),
 * Varianti. Tutto qui si salva subito (registro 10b, «invariato»), e la tab
 * lo dice in testa: è l'eccezione alla bozza della pagina.
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
    const verticalConfig = useVerticalConfig();
    const productLower = verticalConfig.productLabel.toLowerCase();
    const menuLower = verticalConfig.catalogLabel.toLowerCase();
    const { businessId } = useParams<{ businessId: string }>();
    const isVariant = product.parent_product_id !== null;
    const hasPrimaryGroup = primaryPriceGroup !== null;

    // ── Card Prezzo — modalità "Prezzo unico" ───────────────────────────
    const [editingBasePrice, setEditingBasePrice] = useState(false);
    const [basePriceInput, setBasePriceInput] = useState("");
    const [savingBasePrice, setSavingBasePrice] = useState(false);
    const [basePriceError, setBasePriceError] = useState<string | null>(null);

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

    // ── Card Prezzo — toggle Unico ⇄ Per formato ────────────────────────
    // Il gruppo "Formato" (PRIMARY_PRICE) è un dettaglio implementativo:
    // nasce col primo formato inserito (creazione lazy, mai gruppo vuoto) e
    // viene eliminato tornando a prezzo unico. `base_price` NON viene mai
    // azzerato: resta dormiente e riemerge al ritorno indietro.
    const [modeOverride, setModeOverride] = useState<PriceMode | null>(null);
    const [revertingToUnico, setRevertingToUnico] = useState(false);
    const [confirmRevertToUnico, setConfirmRevertToUnico] = useState(false);
    // One-shot: precompila la riga di aggiunta del primo formato col vecchio
    // base_price, poi si azzera al primo valore salvato.
    const [justSwitchedToFormato, setJustSwitchedToFormato] = useState(false);
    const [pendingFormatPrice, setPendingFormatPrice] = useState<number | null>(null);

    const priceMode = resolvePriceMode(modeOverride, hasPrimaryGroup);

    /** Solo UI: nessuna scrittura finché non arriva il primo formato. */
    const handleSelectFormato = () => {
        setPendingFormatPrice(product.base_price);
        setJustSwitchedToFormato(true);
        setModeOverride("formato");
    };

    const handleConfirmRevertToUnico = async (): Promise<boolean> => {
        if (!primaryPriceGroup) return false;
        try {
            setRevertingToUnico(true);
            await deleteProductOptionGroup(primaryPriceGroup.id, tenantId);
            await onRefreshOptions();
            setModeOverride(null);
            setJustSwitchedToFormato(false);
            setPendingFormatPrice(null);
            // Nessun forzamento dell'editing: se il prezzo unico dormiente
            // esiste lo si mostra in sola lettura. L'input vuoto serve solo
            // ai prodotti nati "formats" (es. import AI), senza base_price.
            if (product.base_price === null) {
                setBasePriceInput("");
                setEditingBasePrice(true);
            }
            showToast({ message: "Tornato a prezzo unico", type: "success" });
            return true;
        } catch {
            showToast({ message: "Errore nel ripristino del prezzo unico", type: "error" });
            return false;
        } finally {
            setRevertingToUnico(false);
        }
    };

    const handleSelectUnico = () => {
        // Modale solo se ci sono formati da perdere.
        if (shouldConfirmRevertToUnico(primaryPriceGroup)) {
            setConfirmRevertToUnico(true);
            return;
        }
        // Gruppo esistente ma vuoto (dati legacy): niente da perdere, si
        // elimina senza chiedere — altrimenti la derivazione dal DB
        // riporterebbe subito la card in "per formato".
        if (primaryPriceGroup !== null) {
            void handleConfirmRevertToUnico();
            return;
        }
        setModeOverride(null);
        setJustSwitchedToFormato(false);
        setPendingFormatPrice(null);
    };

    // Variante senza prezzo proprio e senza gruppo → eredita dal padre.
    // Caso di nicchia (solo varianti), gestito con due azioni contestuali
    // invece del vecchio segmented control "Eredita".
    const [parentProduct, setParentProduct] = useState<V2Product | null>(null);
    const [parentPrimaryGroup, setParentPrimaryGroup] = useState<GroupWithValues | null>(null);
    const [isLoadingParent, setIsLoadingParent] = useState(false);
    const isInheriting = isVariant && !hasPrimaryGroup && product.base_price === null;

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

    // Tornare al prezzo del padre cancella quello della variante: si conferma.
    const [confirmInherit, setConfirmInherit] = useState(false);
    const handleRevertToInherit = async (): Promise<boolean> => {
        try {
            const updated = await updateProduct(product.id, tenantId, { base_price: null });
            onProductUpdated(updated);
            showToast({ message: "La variante usa di nuovo il prezzo del padre.", type: "success" });
            return true;
        } catch {
            showToast({ message: "Errore nel cambio prezzo", type: "error" });
            return false;
        }
    };

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

    // Value CRUD sul gruppo Formato (PRIMARY_PRICE) — salvataggio immediato.
    // Creazione lazy: il gruppo PRIMARY_PRICE nasce insieme al suo primo
    // valore. Mai un gruppo vuoto in DB — è lo stato che rendeva il prodotto
    // "per formato" senza prezzo e faceva comparire il modale a vuoto.
    const handleCreateFormatValue = async (name: string, price: number) => {
        try {
            let groupId = primaryPriceGroup?.id ?? null;
            if (groupId === null) {
                const created = await createProductOptionGroup({
                    tenant_id: tenantId,
                    product_id: productId,
                    name: "Formato",
                    is_required: true,
                    max_selectable: 1,
                    group_kind: "PRIMARY_PRICE",
                    pricing_mode: "ABSOLUTE"
                });
                groupId = created.id;
            }
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: groupId,
                name,
                price_modifier: null,
                absolute_price: price
            });
            await onRefreshOptions();
            setJustSwitchedToFormato(false);
            setPendingFormatPrice(null);
            // Dati reali aggiornati → la derivazione dal DB torna autoritativa.
            setModeOverride(null);
        } catch (err) {
            // `modeOverride` resta "formato": l'utente non perde il contesto
            // e può ritentare dalla stessa riga.
            showToast({ message: "Errore nell'aggiunta del formato", type: "error" });
            throw err;
        }
    };

    const handleUpdateFormatValue = async (valueId: string, name: string, price: number) => {
        try {
            await updateOptionValue(valueId, {
                name,
                price_modifier: null,
                absolute_price: price
            });
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nel salvataggio del formato", type: "error" });
            throw err;
        }
    };

    const handleDeleteValue = async (valueId: string) => {
        try {
            await deleteOptionValue(valueId);
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nell'eliminazione", type: "error" });
            throw err;
        }
    };

    // ── Card Configurazioni — solo gruppi ADDON ─────────────────────────
    // Create group form
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupMaxMode, setNewGroupMaxMode] = useState<MaxSelectableMode>("one");
    const [newGroupMaxN, setNewGroupMaxN] = useState("2");
    const [newGroupRequired, setNewGroupRequired] = useState(false);
    const [newGroupRulesExpanded, setNewGroupRulesExpanded] = useState(false);
    const [savingNewGroup, setSavingNewGroup] = useState(false);
    const [newGroupError, setNewGroupError] = useState<string | null>(null);

    const handleOpenCreateGroup = () => {
        setIsCreatingGroup(true);
        setNewGroupName("");
        setNewGroupMaxMode("one");
        setNewGroupMaxN("2");
        setNewGroupRequired(false);
        setNewGroupRulesExpanded(false);
        setNewGroupError(null);
    };

    const handleCloseCreateGroup = () => {
        setIsCreatingGroup(false);
        setNewGroupError(null);
    };

    const handleCreateGroup = async () => {
        const name = newGroupName.trim();
        if (!name) {
            setNewGroupError("Il nome è obbligatorio");
            return;
        }
        try {
            setSavingNewGroup(true);
            setNewGroupError(null);
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name,
                is_required: newGroupRequired,
                max_selectable: parseMaxSelectable(newGroupMaxMode, newGroupMaxN),
                group_kind: "ADDON",
                pricing_mode: "DELTA"
            });
            await onRefreshOptions();
            setIsCreatingGroup(false);
        } catch (err) {
            setNewGroupError(
                err instanceof Error ? err.message : "Errore nella creazione del gruppo"
            );
            showToast({ message: "Errore nella creazione del gruppo", type: "error" });
        } finally {
            setSavingNewGroup(false);
        }
    };

    // Edit group form
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupMaxMode, setEditGroupMaxMode] = useState<MaxSelectableMode>("one");
    const [editGroupMaxN, setEditGroupMaxN] = useState("2");
    const [editGroupRequired, setEditGroupRequired] = useState(false);
    const [editGroupRulesExpanded, setEditGroupRulesExpanded] = useState(false);
    const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
    const [groupEditError, setGroupEditError] = useState<string | null>(null);

    // Delete group dialog
    const [deleteGroup, setDeleteGroup] = useState<GroupWithValues | null>(null);

    const handleStartEditGroup = (group: GroupWithValues) => {
        setEditingGroupId(group.id);
        setEditGroupName(group.name);
        if (group.max_selectable != null && group.max_selectable > 1) {
            setEditGroupMaxMode("many");
            setEditGroupMaxN(String(group.max_selectable));
        } else {
            setEditGroupMaxMode("one");
            setEditGroupMaxN("2");
        }
        setEditGroupRequired(group.is_required);
        setEditGroupRulesExpanded(false);
        setGroupEditError(null);
    };

    const handleCancelEditGroup = () => {
        setEditingGroupId(null);
        setGroupEditError(null);
    };

    const handleSaveGroup = async (group: GroupWithValues) => {
        const name = editGroupName.trim();
        if (!name) {
            setGroupEditError("Il nome è obbligatorio");
            return;
        }
        try {
            setSavingGroupId(group.id);
            await updateProductOptionGroup(group.id, {
                name,
                max_selectable: parseMaxSelectable(editGroupMaxMode, editGroupMaxN),
                is_required: editGroupRequired
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
            await deleteProductOptionGroup(groupId, tenantId);
            await onRefreshOptions();
            return true;
        } catch {
            showToast({ message: "Errore nell'eliminazione del gruppo", type: "error" });
            return false;
        }
    };

    const handleCreateAddonValue = async (group: GroupWithValues, name: string, price: number) => {
        try {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: group.id,
                name,
                price_modifier: price,
                absolute_price: null
            });
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nell'aggiunta della scelta", type: "error" });
            throw err;
        }
    };

    const handleUpdateAddonValue = async (
        group: GroupWithValues,
        valueId: string,
        name: string,
        price: number
    ) => {
        try {
            await updateOptionValue(valueId, {
                name,
                price_modifier: price,
                absolute_price: null
            });
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nel salvataggio della scelta", type: "error" });
            throw err;
        }
    };

    const variantColumns: ColumnDefinition<V2Product>[] = [
        {
            id: "name",
            header: "Nome",
            cell: (_, variant) => (
                <Text variant="body-sm" weight={500}>
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
                        <Text variant="body-sm" colorVariant="muted">
                            —
                        </Text>
                    );
                }
                const fromPrice = computeFromPrice(group, null);
                if (group !== null && group.values.length > 0) {
                    return fromPrice !== null ? (
                        <Text variant="body-sm">da {formatCurrency(fromPrice)}</Text>
                    ) : (
                        <Text variant="body-sm" colorVariant="muted">
                            —
                        </Text>
                    );
                }
                if (variant.base_price != null) {
                    return (
                        <Text variant="body-sm">{formatCurrency(variant.base_price)}</Text>
                    );
                }
                if (variantsParentFromPrice !== null) {
                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            {formatCurrency(variantsParentFromPrice)} (ereditato)
                        </Text>
                    );
                }
                return (
                    <Text variant="body-sm" colorVariant="muted">
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
                    ariaLabel={`Azioni ${variant.name}`}
                    actions={[
                        {
                            label: "Apri",
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
            <Text variant="body-sm" colorVariant="muted">
                In questa scheda ogni modifica si salva subito, senza «Salva».
            </Text>

            {/* ──────────────── Card 1 — Prezzo ──────────────── */}
            <Card title="Prezzo" subtitle={`Come si legge il prezzo del ${productLower} nel ${menuLower}.`}>
                {optionsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                ) : isInheriting ? (
                    <div className={styles.inheritMode}>
                        {isLoadingParent ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento del {productLower} padre...
                            </Text>
                        ) : (
                            <>
                                <Text variant="body-sm" colorVariant="muted">
                                    La variante usa il prezzo del {productLower} padre.
                                </Text>
                                {parentProduct && (
                                    <Text variant="body-sm">
                                        {parentProduct.name}
                                        {parentEffectivePrice &&
                                            parentEffectivePrice.type !== "none" &&
                                            ` · ${parentEffectivePrice.label}`}
                                    </Text>
                                )}
                                <div>
                                    <Button variant="secondary" size="sm" onClick={handleStartEditBasePrice}>
                                        Imposta un prezzo proprio
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className={styles.priceSection}>
                        <div className={styles.fitContent}>
                            <SegmentedControl<PriceMode>
                                value={priceMode}
                                onChange={next => {
                                    if (revertingToUnico || next === priceMode) return;
                                    if (next === "unico") handleSelectUnico();
                                    else handleSelectFormato();
                                }}
                                options={[
                                    { value: "unico", label: "Prezzo unico" },
                                    { value: "formato", label: "Prezzo per formato" }
                                ]}
                            />
                        </div>

                        {isVariant && (
                            <Text variant="body-sm" colorVariant="muted">
                                Prezzo della variante, indipendente dal {productLower} principale.
                            </Text>
                        )}

                        {priceMode === "formato" ? (
                            <div className={styles.formatMode}>
                                <OptionValueList
                                    values={primaryPriceGroup?.values ?? []}
                                    priceMode="absolute"
                                    emptyTitle="Nessun formato"
                                    namePlaceholder="Nome (es. Bottiglia)"
                                    pricePlaceholder="Prezzo"
                                    initialAddPrice={
                                        justSwitchedToFormato && pendingFormatPrice !== null
                                            ? pendingFormatPrice
                                            : undefined
                                    }
                                    autoFocusAdd={justSwitchedToFormato}
                                    onCreate={handleCreateFormatValue}
                                    onUpdate={(id, name, price) =>
                                        handleUpdateFormatValue(id, name, price)
                                    }
                                    onDelete={handleDeleteValue}
                                />
                                {primaryPriceGroup && formatPricePreview(primaryPriceGroup, menuLower) && (
                                    <Text variant="body-sm" colorVariant="muted">
                                        {formatPricePreview(primaryPriceGroup, menuLower)}
                                    </Text>
                                )}
                            </div>
                        ) : editingBasePrice ? (
                            <div className={styles.priceEditRow}>
                                <NumberInput
                                    aria-label="Prezzo"
                                    value={basePriceInput}
                                    onChange={e => setBasePriceInput(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    endAdornment="€"
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
                        ) : product.base_price === null ? (
                            <InlineBanner
                                variant="warning"
                                action={
                                    <Button variant="secondary" size="sm" onClick={handleStartEditBasePrice}>
                                        Imposta prezzo
                                    </Button>
                                }
                            >
                                Prezzo non impostato: nel {menuLower} il {productLower} compare senza prezzo.
                            </InlineBanner>
                        ) : (
                            <div className={styles.priceDisplay}>
                                <Text variant="title-md" weight={600}>
                                    {formatCurrency(product.base_price)}
                                </Text>
                                <Button variant="secondary" size="sm" onClick={handleStartEditBasePrice}>
                                    Modifica
                                </Button>
                                {isVariant && (
                                    <Button variant="ghost" size="sm" onClick={() => setConfirmInherit(true)}>
                                        Usa il prezzo del padre
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <ConfirmDialog
                    isOpen={confirmRevertToUnico}
                    onClose={() => setConfirmRevertToUnico(false)}
                    onConfirm={handleConfirmRevertToUnico}
                    title="Tornare a un prezzo unico?"
                    message="I formati inseriti si eliminano. Non si torna indietro."
                    confirmLabel="Torna a prezzo unico"
                />
                <ConfirmDialog
                    isOpen={confirmInherit}
                    onClose={() => setConfirmInherit(false)}
                    onConfirm={handleRevertToInherit}
                    title="Usare il prezzo del padre?"
                    message={`Il prezzo della variante${product.base_price !== null ? ` (${formatCurrency(product.base_price)})` : ""} si cancella.`}
                    confirmLabel="Usa il prezzo del padre"
                    confirmVariant="primary"
                />
            </Card>

            {/* ──────────────── Card 2 — Configurazioni ──────────────── */}
            <Card
                title="Configurazioni"
                subtitle={`Scelte che il cliente fa quando ordina dal ${menuLower}.`}
                badge={addonGroups.length > 0 ? <Badge variant="secondary">{addonGroups.length}</Badge> : undefined}
                actions={
                    addonGroups.length > 0 && !isCreatingGroup ? (
                        <Button type="button" variant="secondary" size="sm" onClick={handleOpenCreateGroup}>
                            Nuovo gruppo
                        </Button>
                    ) : undefined
                }
            >
                <div className={styles.configBody}>
                    <InlineBanner variant="info">
                        Una scelta fra più opzioni (es. una misura o una cottura) o delle aggiunte, anche a
                        pagamento. Se accetti ordini dal {menuLower}, le seleziona il cliente.
                    </InlineBanner>

                    {/* Inline create group form */}
                    {isCreatingGroup && (
                        <div className={styles.createGroupForm}>
                            <TextInput
                                label="Cosa può scegliere il cliente?"
                                helperText={`Il cliente lo vede sopra le opzioni, nel ${menuLower}`}
                                placeholder="es. Misura · Aggiunte"
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                disabled={savingNewGroup}
                                error={newGroupError ?? undefined}
                            />

                            <ChoiceRulesEditor
                                mode={newGroupMaxMode}
                                onModeChange={setNewGroupMaxMode}
                                n={newGroupMaxN}
                                onNChange={setNewGroupMaxN}
                                required={newGroupRequired}
                                onRequiredChange={setNewGroupRequired}
                                expanded={newGroupRulesExpanded}
                                onExpand={() => setNewGroupRulesExpanded(true)}
                                disabled={savingNewGroup}
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
                            variant="inline"
                            icon={null}
                            title="Nessuna configurazione"
                            action={
                                <Button type="button" variant="secondary" size="sm" onClick={handleOpenCreateGroup}>
                                    Nuovo gruppo
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
                                                label="Cosa può scegliere il cliente?"
                                                helperText={`Il cliente lo vede sopra le opzioni, nel ${menuLower}`}
                                                placeholder="es. Misura · Aggiunte"
                                                value={editGroupName}
                                                onChange={e => setEditGroupName(e.target.value)}
                                                disabled={savingGroupId === group.id}
                                                error={groupEditError ?? undefined}
                                            />
                                            <ChoiceRulesEditor
                                                mode={editGroupMaxMode}
                                                onModeChange={setEditGroupMaxMode}
                                                n={editGroupMaxN}
                                                onNChange={setEditGroupMaxN}
                                                required={editGroupRequired}
                                                onRequiredChange={setEditGroupRequired}
                                                expanded={editGroupRulesExpanded}
                                                onExpand={() => setEditGroupRulesExpanded(true)}
                                                disabled={savingGroupId === group.id}
                                            />
                                            <div className={styles.formatActions}>
                                                <Button
                                                    type="button"
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleSaveGroup(group)}
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
                                                {group.max_selectable != null && group.max_selectable > 1 && (
                                                    <Badge variant="secondary">fino a {group.max_selectable}</Badge>
                                                )}
                                                {group.is_required && (
                                                    <Badge variant="secondary">Obbligatorio</Badge>
                                                )}
                                            </div>
                                            <TableRowActions
                                                ariaLabel={`Azioni ${group.name}`}
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

                                    <OptionValueList
                                        values={group.values}
                                        priceMode="delta"
                                        emptyTitle="Nessuna scelta"
                                        namePlaceholder="Nome (es. Latte)"
                                        pricePlaceholder="0,00"
                                        onCreate={(name, price) =>
                                            handleCreateAddonValue(group, name, price)
                                        }
                                        onUpdate={(id, name, price) =>
                                            handleUpdateAddonValue(group, id, name, price)
                                        }
                                        onDelete={handleDeleteValue}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <ConfirmDialog
                    isOpen={deleteGroup !== null}
                    onClose={() => setDeleteGroup(null)}
                    onConfirm={() => (deleteGroup ? handleConfirmDeleteGroup(deleteGroup.id) : false)}
                    title={`Eliminare «${deleteGroup?.name ?? ""}»?`}
                    message="Si eliminano anche le sue scelte. Non si torna indietro."
                    confirmLabel="Elimina"
                />
            </Card>

            {/* ──────────────── Card 3 — Varianti ──────────────── */}
            {!isVariant && (
                <Card
                    title="Varianti"
                    subtitle={`Prezzo e descrizione propri; nel ${menuLower} pubblico sono ${verticalConfig.productLabelPlural.toLowerCase()} a sé.`}
                    badge={variants.length > 0 ? <Badge variant="secondary">{variants.length}</Badge> : undefined}
                    actions={
                        variants.length > 0 ? (
                            <Button type="button" variant="secondary" size="sm" onClick={onOpenVariantDrawer}>
                                Aggiungi variante
                            </Button>
                        ) : undefined
                    }
                    flush={variants.length > 0}
                >
                    {variants.length === 0 ? (
                        <EmptyState
                            variant="inline"
                            icon={null}
                            title="Nessuna variante"
                            action={
                                <Button type="button" variant="secondary" size="sm" onClick={onOpenVariantDrawer}>
                                    Aggiungi variante
                                </Button>
                            }
                        />
                    ) : (
                        <DataTable
                            data={variants}
                            columns={variantColumns}
                            ariaLabel="Varianti"
                            showFooter={false}
                            onRowClick={variant => navigate(`/business/${businessId}/products/${variant.id}`)}
                        />
                    )}
                </Card>
            )}
        </div>
    );
}
