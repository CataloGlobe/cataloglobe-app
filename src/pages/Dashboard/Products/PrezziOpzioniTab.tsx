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
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
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
import { getDisplayPrice } from "@/utils/priceDisplay";
import styles from "./PrezziOpzioniTab.module.scss";

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

function formatMoney(n: number): string {
    return `${n.toFixed(2).replace(".", ",")} €`;
}

/** Riga informativa sotto la lista formati — stessa regola del resolver
 * (`resolveActivityCatalogs.ts`): 1 valore prezzato → prezzo secco, 2+ →
 * "da X" sul minimo. */
function formatPricePreview(group: GroupWithValues): string | null {
    const prices = group.values
        .map(v => v.absolute_price)
        .filter((p): p is number => p !== null);
    if (prices.length === 0) return null;
    if (prices.length === 1) return `Nel menu il prodotto mostra ${formatMoney(prices[0])}`;
    return `Nel menu il prodotto mostra da ${formatMoney(Math.min(...prices))}`;
}

type MaxSelectableMode = "one" | "many";

function parseMaxSelectable(mode: MaxSelectableMode, n: string): number | null {
    if (mode === "one") return 1;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Frase collassata di riepilogo delle regole di scelta — deve restare
 * coerente coi valori reali del gruppo anche quando il pannello è chiuso
 * (in modifica di un gruppo esistente i default possono non essere quelli
 * di fabbrica "una sola/facoltativo"). */
function describeChoiceRules(mode: MaxSelectableMode, n: string, required: boolean): string {
    const parsedN = parseMaxSelectable(mode, n);
    const countPart = mode === "one" ? "una sola opzione" : `fino a ${parsedN ?? "più"} opzioni`;
    const requiredPart = required ? "e deve sceglierla per ordinare" : "e può anche non sceglierla";
    return `Il cliente sceglie ${countPart}, ${requiredPart}.`;
}

interface ChoiceRulesEditorProps {
    mode: MaxSelectableMode;
    onModeChange: (mode: MaxSelectableMode) => void;
    n: string;
    onNChange: (n: string) => void;
    required: boolean;
    onRequiredChange: (required: boolean) => void;
    expanded: boolean;
    onExpand: () => void;
    disabled?: boolean;
}

/** Regole di scelta di un gruppo Configurazioni — progressive disclosure:
 * di default una riga di riepilogo + link, "Fino a quante?" compare solo
 * dopo aver dichiarato che il cliente può scegliere più di un'opzione. */
function ChoiceRulesEditor({
    mode,
    onModeChange,
    n,
    onNChange,
    required,
    onRequiredChange,
    expanded,
    onExpand,
    disabled
}: ChoiceRulesEditorProps) {
    if (!expanded) {
        return (
            <div className={styles.rulesCollapsed}>
                <Text variant="body-sm" colorVariant="muted">
                    {describeChoiceRules(mode, n, required)}
                </Text>
                <button
                    type="button"
                    className={styles.rulesExpandLink}
                    onClick={onExpand}
                    disabled={disabled}
                >
                    Modifica le regole di scelta →
                </button>
            </div>
        );
    }
    return (
        <div className={styles.rulesExpanded}>
            <div className={styles.formSection}>
                <Text variant="body-sm" weight={600}>
                    Il cliente può scegliere più opzioni?
                </Text>
                <div className={styles.pillToggle}>
                    <button
                        type="button"
                        className={mode === "one" ? styles.pillOptionActive : styles.pillOption}
                        onClick={() => onModeChange("one")}
                        disabled={disabled}
                    >
                        No, una sola <span className={styles.pillHint}>(es. la cottura)</span>
                    </button>
                    <button
                        type="button"
                        className={mode === "many" ? styles.pillOptionActive : styles.pillOption}
                        onClick={() => onModeChange("many")}
                        disabled={disabled}
                    >
                        Sì <span className={styles.pillHint}>(es. le aggiunte)</span>
                    </button>
                </div>
                {mode === "many" && (
                    <NumberInput
                        label="Fino a quante?"
                        min="2"
                        value={n}
                        onChange={e => onNChange(e.target.value)}
                        disabled={disabled}
                        containerClassName={styles.quantityN}
                    />
                )}
            </div>
            <div className={styles.formSection}>
                <Text variant="body-sm" weight={600}>
                    È obbligatorio scegliere?
                </Text>
                <div className={styles.pillToggle}>
                    <button
                        type="button"
                        className={!required ? styles.pillOptionActive : styles.pillOption}
                        onClick={() => onRequiredChange(false)}
                        disabled={disabled}
                    >
                        No, è facoltativo
                    </button>
                    <button
                        type="button"
                        className={required ? styles.pillOptionActive : styles.pillOption}
                        onClick={() => onRequiredChange(true)}
                        disabled={disabled}
                    >
                        Sì, deve scegliere per ordinare
                    </button>
                </div>
            </div>
        </div>
    );
}

interface PriceModeToggleProps {
    mode: "unico" | "formato";
    onSelectUnico: () => void;
    onSelectFormato: () => void;
    disabled?: boolean;
}

/** Toggle Prezzo unico / Prezzo per formato — lo stato deriva dai dati
 * (esiste un gruppo PRIMARY_PRICE?), il click esegue la transizione reale
 * (crea/elimina il gruppo), non è solo UI. */
function PriceModeToggle({ mode, onSelectUnico, onSelectFormato, disabled }: PriceModeToggleProps) {
    return (
        <div className={styles.priceModeToggle}>
            <button
                type="button"
                className={mode === "unico" ? styles.priceModeOptionActive : styles.priceModeOption}
                onClick={onSelectUnico}
                disabled={disabled || mode === "unico"}
            >
                Prezzo unico
            </button>
            <button
                type="button"
                className={mode === "formato" ? styles.priceModeOptionActive : styles.priceModeOption}
                onClick={onSelectFormato}
                disabled={disabled || mode === "formato"}
            >
                Prezzo per formato
            </button>
        </div>
    );
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
    onVariantUpdated: () => Promise<void> | void;
}

/**
 * Tab "Prezzi & Opzioni" — 3 card: Prezzo (toggle Unico/Per formato — il
 * gruppo PRIMARY_PRICE è un dettaglio implementativo, mai mostrato come
 * "gruppo" da gestire), Configurazioni (gruppi ADDON, opzionali, spiegati),
 * Varianti (invariata).
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
    // Il gruppo "Formato" (PRIMARY_PRICE) è creato/eliminato dal toggle
    // stesso: l'utente non vede mai il meccanismo di gruppo/valori.
    const [switchingToFormato, setSwitchingToFormato] = useState(false);
    const [revertingToUnico, setRevertingToUnico] = useState(false);
    const [confirmRevertToUnico, setConfirmRevertToUnico] = useState(false);
    // One-shot: precompila la riga di aggiunta del primo formato col vecchio
    // base_price, poi si azzera al primo valore salvato.
    const [justSwitchedToFormato, setJustSwitchedToFormato] = useState(false);
    const [pendingFormatPrice, setPendingFormatPrice] = useState<number | null>(null);

    const handleSwitchToFormato = async () => {
        const priceToMigrate = product.base_price;
        setSwitchingToFormato(true);
        try {
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name: "Formato",
                is_required: true,
                max_selectable: 1,
                group_kind: "PRIMARY_PRICE",
                pricing_mode: "ABSOLUTE"
            });
            setPendingFormatPrice(priceToMigrate);
            setJustSwitchedToFormato(true);
            await onRefreshOptions();
        } catch {
            showToast({ message: "Errore nel passaggio a prezzo per formato", type: "error" });
        } finally {
            setSwitchingToFormato(false);
        }
    };

    const handleConfirmRevertToUnico = async (): Promise<boolean> => {
        if (!primaryPriceGroup) return false;
        try {
            setRevertingToUnico(true);
            await deleteProductOptionGroup(primaryPriceGroup.id, tenantId);
            await onRefreshOptions();
            setBasePriceInput("");
            setEditingBasePrice(true);
            showToast({ message: "Tornato a prezzo unico", type: "success" });
            return true;
        } catch {
            showToast({ message: "Errore nel ripristino del prezzo unico", type: "error" });
            return false;
        } finally {
            setRevertingToUnico(false);
        }
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

    const handleRevertToInherit = async () => {
        try {
            const updated = await updateProduct(product.id, tenantId, { base_price: null });
            onProductUpdated(updated);
            showToast({ message: "Prezzo tornato a ereditato dal padre", type: "success" });
        } catch {
            showToast({ message: "Errore nel cambio prezzo", type: "error" });
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
    const handleCreateFormatValue = async (name: string, price: number) => {
        if (!primaryPriceGroup) return;
        try {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: primaryPriceGroup.id,
                name,
                price_modifier: null,
                absolute_price: price
            });
            await onRefreshOptions();
            setJustSwitchedToFormato(false);
            setPendingFormatPrice(null);
        } catch (err) {
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
            <SectionCard
                title="Prezzo"
                subtitle="Come vuoi indicare il prezzo per questo prodotto"
            >
                {optionsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                ) : isInheriting ? (
                    <div className={styles.inheritMode}>
                        {isLoadingParent ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento prodotto padre...
                            </Text>
                        ) : (
                            <>
                                <Text variant="body-sm" colorVariant="muted">
                                    Il prezzo viene ereditato dal prodotto padre.
                                </Text>
                                {parentProduct && (
                                    <Text variant="body-sm">
                                        Padre: <strong>{parentProduct.name}</strong>
                                        {parentEffectivePrice &&
                                            parentEffectivePrice.type !== "none" &&
                                            ` — ${parentEffectivePrice.label}`}
                                    </Text>
                                )}
                                <div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleStartEditBasePrice}
                                    >
                                        Imposta un prezzo proprio
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className={styles.priceSection}>
                        <PriceModeToggle
                            mode={hasPrimaryGroup ? "formato" : "unico"}
                            onSelectUnico={() => setConfirmRevertToUnico(true)}
                            onSelectFormato={handleSwitchToFormato}
                            disabled={switchingToFormato || revertingToUnico}
                        />

                        {hasPrimaryGroup ? (
                            <div className={styles.formatMode}>
                                {isVariant && (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Prezzo della variante, indipendente dal prodotto principale.
                                    </Text>
                                )}
                                <OptionValueList
                                    values={primaryPriceGroup.values}
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
                                {formatPricePreview(primaryPriceGroup) && (
                                    <Text variant="body-sm" colorVariant="muted">
                                        {formatPricePreview(primaryPriceGroup)}
                                    </Text>
                                )}
                            </div>
                        ) : (
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
                                        {isVariant && product.base_price !== null && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleRevertToInherit}
                                            >
                                                Eredita dal padre
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {confirmRevertToUnico && (
                    <ConfirmDialog
                        isOpen={true}
                        onClose={() => setConfirmRevertToUnico(false)}
                        onConfirm={handleConfirmRevertToUnico}
                        title="Torna a un prezzo unico?"
                        message="Vuoi tornare a un prezzo unico? I formati inseriti verranno eliminati."
                        confirmLabel="Torna a prezzo unico"
                    />
                )}
            </SectionCard>

            {/* ──────────────── Card 2 — Configurazioni ──────────────── */}
            <SectionCard
                title="Configurazioni"
                subtitle="Scelte che il cliente fa quando ordina dal menu"
                badge={addonGroups.length > 0 ? <Badge variant="secondary">{addonGroups.length}</Badge> : undefined}
                actions={
                    addonGroups.length > 0 && !isCreatingGroup ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleOpenCreateGroup}
                        >
                            + Crea gruppo
                        </Button>
                    ) : undefined
                }
            >
                <div className={styles.configInfoBox}>
                    <Text variant="body-sm">
                        Mostrano al cliente le possibili scelte del piatto — es.{" "}
                        <strong>Cottura</strong> (al sangue / media / ben cotta) o{" "}
                        <strong>Aggiunte</strong> (mozzarella +1 €).
                    </Text>
                    <Text variant="body-sm" colorVariant="muted" className={styles.configInfoSecondary}>
                        Se accetti ordini dal menu, il cliente può anche selezionarle.
                    </Text>
                </div>

                {/* Inline create group form */}
                {isCreatingGroup && (
                    <div className={styles.createGroupForm}>
                        <TextInput
                            label="Cosa può scegliere il cliente?"
                            helperText="Il cliente lo vede sopra le opzioni, nel menu"
                            placeholder="es. Cottura · Aggiunte · Contorno"
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
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleOpenCreateGroup}
                            >
                                Crea gruppo
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
                                            helperText="Il cliente lo vede sopra le opzioni, nel menu"
                                            placeholder="es. Cottura · Aggiunte · Contorno"
                                            value={editGroupName}
                                            onChange={e => setEditGroupName(e.target.value)}
                                            disabled={savingGroupId === group.id}
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
                                            {group.max_selectable != null && (
                                                <Badge variant="secondary">
                                                    max {group.max_selectable}
                                                </Badge>
                                            )}
                                            {group.is_required && (
                                                <Badge variant="secondary">Obbligatorio</Badge>
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

                                <OptionValueList
                                    values={group.values}
                                    priceMode="delta"
                                    emptyTitle="Nessuna scelta"
                                    namePlaceholder="Nome (es. Latte)"
                                    pricePlaceholder="Costo aggiuntivo"
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

                {deleteGroup && (
                    <ConfirmDialog
                        isOpen={true}
                        onClose={() => setDeleteGroup(null)}
                        onConfirm={() => handleConfirmDeleteGroup(deleteGroup.id)}
                        title={`Elimina "${deleteGroup.name}"`}
                        message="Sei sicuro di voler eliminare questo gruppo? Tutte le scelte associate verranno eliminate."
                        confirmLabel="Elimina"
                    />
                )}
            </SectionCard>

            {/* ──────────────── Card 3 — Varianti ──────────────── */}
            {!isVariant && (
                <SectionCard
                    title="Varianti"
                    subtitle="Le varianti hanno prezzo e descrizione propri. Si vedono come prodotti separati nel menu pubblico."
                    badge={variants.length > 0 ? <Badge variant="secondary">{variants.length}</Badge> : undefined}
                    actions={
                        variants.length > 0 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onOpenVariantDrawer}
                            >
                                + Aggiungi
                            </Button>
                        ) : undefined
                    }
                >
                    {variants.length === 0 ? (
                        <EmptyState
                            variant="inline"
                            icon={null}
                            title="Nessuna variante"
                            action={
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={onOpenVariantDrawer}
                                >
                                    Aggiungi variante
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
                </SectionCard>
            )}
        </div>
    );
}
