import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { InfoTooltip } from "@/components/ui/Tooltip/InfoTooltip";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    type V2Product,
    updateProduct,
    getProduct
} from "@/services/supabase/products";
import {
    type GroupWithValues,
    type OptionGroupKind,
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

/** Anteprima di ciò che vede il cliente nel menu pubblico, stessa regola
 * del resolver (`resolveActivityCatalogs.ts`): 1 valore prezzato → prezzo
 * secco, 2+ → "da X" sul minimo. Oggi questa anteprima non esiste altrove
 * nel backoffice — la si scopriva solo guardando il menu pubblico. */
function pricePreviewLabel(group: GroupWithValues): string | null {
    const prices = group.values
        .map(v => v.absolute_price)
        .filter((p): p is number => p !== null);
    if (prices.length === 0) return null;
    if (prices.length === 1) return `Il menu mostra ${formatMoney(prices[0])}`;
    return `Il menu mostra "da ${formatMoney(Math.min(...prices))}"`;
}

type MaxSelectableMode = "one" | "many";

const PRICE_KIND_OPTIONS: {
    value: OptionGroupKind;
    title: string;
    description: string;
}[] = [
    {
        value: "PRIMARY_PRICE",
        title: "Definisce il prezzo del prodotto",
        description: "Ogni scelta ha il suo prezzo: Bottiglia 45 €, Calice 9 €. Sostituisce il prezzo base."
    },
    {
        value: "ADDON",
        title: "Aggiunge un costo",
        description: "Ogni scelta somma al prezzo base: Patatine +3 €. Può anche essere gratis."
    }
];

interface KindChooserProps {
    value: OptionGroupKind;
    onChange: (value: OptionGroupKind) => void;
    disablePrimary: boolean;
    disabled?: boolean;
}

/** Le due modalità prezzo di un gruppo — sostituisce il vecchio segmented
 * control "Prezzo singolo / Prezzi per formato": non è più uno switch di
 * pagina, è una proprietà del gruppo scelta alla creazione. */
function KindChooser({ value, onChange, disablePrimary, disabled }: KindChooserProps) {
    return (
        <div className={styles.kindChooser}>
            {PRICE_KIND_OPTIONS.map(opt => {
                const isDisabled = disabled || (opt.value === "PRIMARY_PRICE" && disablePrimary);
                const isActive = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        className={`${styles.kindCard} ${isActive ? styles.kindCardActive : ""}`}
                        onClick={() => !isDisabled && onChange(opt.value)}
                        disabled={isDisabled}
                    >
                        <Text variant="body-sm" weight={600}>
                            {opt.title}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {isDisabled && opt.value === "PRIMARY_PRICE"
                                ? "Un altro gruppo lo fa già"
                                : opt.description}
                        </Text>
                    </button>
                );
            })}
        </div>
    );
}

interface QuantityChooserProps {
    mode: MaxSelectableMode;
    onModeChange: (mode: MaxSelectableMode) => void;
    n: string;
    onNChange: (n: string) => void;
    disabled?: boolean;
}

/** "Quante scelte può fare il cliente?" — solo per gruppi ADDON. */
function QuantityChooser({ mode, onModeChange, n, onNChange, disabled }: QuantityChooserProps) {
    return (
        <div className={styles.quantityChooser}>
            <div className={styles.quantityToggle}>
                <button
                    type="button"
                    className={mode === "one" ? styles.quantityOptionActive : styles.quantityOption}
                    onClick={() => onModeChange("one")}
                    disabled={disabled}
                >
                    Una sola
                </button>
                <button
                    type="button"
                    className={mode === "many" ? styles.quantityOptionActive : styles.quantityOption}
                    onClick={() => onModeChange("many")}
                    disabled={disabled}
                >
                    Più di una
                </button>
            </div>
            {mode === "many" && (
                <NumberInput
                    label="Fino a"
                    min="2"
                    value={n}
                    onChange={e => onNChange(e.target.value)}
                    disabled={disabled}
                    containerClassName={styles.quantityN}
                />
            )}
        </div>
    );
}

function parseMaxSelectable(mode: MaxSelectableMode, n: string): number | null {
    if (mode === "one") return 1;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
 * Tab "Prezzi & Opzioni" — 3 card: Prezzo (campo semplice o dichiarazione
 * "definito dal gruppo X"), Opzioni (gruppi PRIMARY_PRICE + ADDON unificati
 * — un gruppo è una domanda al cliente, la modalità prezzo è una sua
 * proprietà, non uno switch di pagina), Varianti (invariata).
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

    // ── Card Prezzo — campo semplice (nessun gruppo prezzo) ─────────────
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

    // ── Card Opzioni — gruppi PRIMARY_PRICE + ADDON unificati ───────────
    const allGroups = useMemo(
        () => (primaryPriceGroup ? [primaryPriceGroup, ...addonGroups] : addonGroups),
        [primaryPriceGroup, addonGroups]
    );

    // Create group form
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupKind, setNewGroupKind] = useState<OptionGroupKind>("ADDON");
    const [newGroupMaxMode, setNewGroupMaxMode] = useState<MaxSelectableMode>("one");
    const [newGroupMaxN, setNewGroupMaxN] = useState("2");
    const [newGroupRequired, setNewGroupRequired] = useState(false);
    const [savingNewGroup, setSavingNewGroup] = useState(false);
    const [newGroupError, setNewGroupError] = useState<string | null>(null);

    const handleOpenCreateGroup = () => {
        setIsCreatingGroup(true);
        setNewGroupName("");
        setNewGroupKind("ADDON");
        setNewGroupMaxMode("one");
        setNewGroupMaxN("2");
        setNewGroupRequired(false);
        setNewGroupError(null);
    };

    const handleCloseCreateGroup = () => {
        setIsCreatingGroup(false);
        setNewGroupError(null);
    };

    const handleCreateGroup = async () => {
        const name = newGroupName.trim();
        if (!name) {
            setNewGroupError("La domanda è obbligatoria");
            return;
        }
        const isPrimary = newGroupKind === "PRIMARY_PRICE";
        const maxSelectable = isPrimary ? 1 : parseMaxSelectable(newGroupMaxMode, newGroupMaxN);
        try {
            setSavingNewGroup(true);
            setNewGroupError(null);
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name,
                is_required: isPrimary ? true : newGroupRequired,
                max_selectable: maxSelectable,
                group_kind: newGroupKind,
                pricing_mode: isPrimary ? "ABSOLUTE" : "DELTA"
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
        setGroupEditError(null);
    };

    const handleCancelEditGroup = () => {
        setEditingGroupId(null);
        setGroupEditError(null);
    };

    const handleSaveGroup = async (group: GroupWithValues) => {
        const name = editGroupName.trim();
        if (!name) {
            setGroupEditError("La domanda è obbligatoria");
            return;
        }
        const isPrimary = group.group_kind === "PRIMARY_PRICE";
        const maxSelectable = isPrimary
            ? 1
            : parseMaxSelectable(editGroupMaxMode, editGroupMaxN);
        try {
            setSavingGroupId(group.id);
            await updateProductOptionGroup(group.id, {
                name,
                max_selectable: maxSelectable,
                is_required: isPrimary ? true : editGroupRequired
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

    // Value CRUD — generico assoluto/delta in base al kind del gruppo,
    // salvataggio immediato (chiama il service e rilancia per l'errore
    // inline in `OptionValueList`).
    const handleCreateValue = async (group: GroupWithValues, name: string, price: number) => {
        const isPrimary = group.group_kind === "PRIMARY_PRICE";
        try {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: group.id,
                name,
                price_modifier: isPrimary ? null : price,
                absolute_price: isPrimary ? price : null
            });
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nell'aggiunta della scelta", type: "error" });
            throw err;
        }
    };

    const handleUpdateValue = async (
        group: GroupWithValues,
        valueId: string,
        name: string,
        price: number
    ) => {
        const isPrimary = group.group_kind === "PRIMARY_PRICE";
        try {
            await updateOptionValue(valueId, {
                name,
                price_modifier: isPrimary ? null : price,
                absolute_price: isPrimary ? price : null
            });
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nel salvataggio della scelta", type: "error" });
            throw err;
        }
    };

    const handleDeleteValue = async (valueId: string) => {
        try {
            await deleteOptionValue(valueId);
            await onRefreshOptions();
        } catch (err) {
            showToast({ message: "Errore nell'eliminazione della scelta", type: "error" });
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
                ) : hasPrimaryGroup ? (
                    <div className={styles.priceFromGroup}>
                        <Text variant="body">
                            Il prezzo è definito dal gruppo{" "}
                            <strong>{primaryPriceGroup!.name}</strong>.
                        </Text>
                        {pricePreviewLabel(primaryPriceGroup!) && (
                            <Text variant="body-sm" colorVariant="muted">
                                {pricePreviewLabel(primaryPriceGroup!)}
                            </Text>
                        )}
                    </div>
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
            </SectionCard>

            {/* ──────────────── Card 2 — Opzioni ──────────────── */}
            <SectionCard
                title="Opzioni"
                subtitle="Le scelte che il cliente fa quando ordina questo prodotto"
                badge={allGroups.length > 0 ? <Badge variant="secondary">{allGroups.length}</Badge> : undefined}
                actions={
                    allGroups.length > 0 && !isCreatingGroup ? (
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
                {/* Inline create group form */}
                {isCreatingGroup && (
                    <div className={styles.createGroupForm}>
                        <TextInput
                            label="Titolo del gruppo"
                            helperText="Il cliente lo vede sopra le scelte, nel menu"
                            placeholder="Es. Formato · Cottura · Contorno · Aggiunte"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            disabled={savingNewGroup}
                            error={newGroupError ?? undefined}
                        />

                        <div className={styles.formSection}>
                            <Text variant="body-sm" weight={600}>
                                Come funziona il prezzo?
                            </Text>
                            <KindChooser
                                value={newGroupKind}
                                onChange={setNewGroupKind}
                                disablePrimary={hasPrimaryGroup}
                                disabled={savingNewGroup}
                            />
                        </div>

                        {newGroupKind === "ADDON" && (
                            <div className={styles.orderingSection}>
                                <div className={styles.orderingSectionHeader}>
                                    <Text variant="body-sm" weight={600}>
                                        Se il cliente ordina dal menu
                                    </Text>
                                    <InfoTooltip content="Queste impostazioni agiscono solo quando la sede ha l'ordinazione attiva. Senza ordinazione, le opzioni restano visibili nel menu ma non selezionabili." />
                                </div>
                                <div className={styles.formSection}>
                                    <Text variant="body-sm" weight={600}>
                                        Quante scelte può fare il cliente?
                                    </Text>
                                    <QuantityChooser
                                        mode={newGroupMaxMode}
                                        onModeChange={setNewGroupMaxMode}
                                        n={newGroupMaxN}
                                        onNChange={setNewGroupMaxN}
                                        disabled={savingNewGroup}
                                    />
                                </div>
                                <Switch
                                    label="Il cliente deve scegliere"
                                    helperText="Non può completare l'ordine senza aver scelto un'opzione di questo gruppo."
                                    checked={newGroupRequired}
                                    onChange={setNewGroupRequired}
                                    disabled={savingNewGroup}
                                />
                            </div>
                        )}

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
                        Caricamento opzioni...
                    </Text>
                ) : allGroups.length === 0 && !isCreatingGroup ? (
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title="Nessuna opzione"
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
                ) : allGroups.length > 0 ? (
                    <div className={styles.optionGroupsList}>
                        {allGroups.map(group => {
                            const isPrimary = group.group_kind === "PRIMARY_PRICE";
                            return (
                                <div key={group.id} className={styles.groupCard}>
                                    {editingGroupId === group.id ? (
                                        <div className={styles.groupEditForm}>
                                            <TextInput
                                                label="Titolo del gruppo"
                                                helperText="Il cliente lo vede sopra le scelte, nel menu"
                                                placeholder="Es. Formato · Cottura · Contorno · Aggiunte"
                                                value={editGroupName}
                                                onChange={e => setEditGroupName(e.target.value)}
                                                disabled={savingGroupId === group.id}
                                            />
                                            {isPrimary ? (
                                                <Text variant="body-sm" colorVariant="muted">
                                                    Definisce il prezzo del prodotto — sempre
                                                    obbligatorio, una sola scelta per volta.
                                                </Text>
                                            ) : (
                                                <div className={styles.orderingSection}>
                                                    <div className={styles.orderingSectionHeader}>
                                                        <Text variant="body-sm" weight={600}>
                                                            Se il cliente ordina dal menu
                                                        </Text>
                                                        <InfoTooltip content="Queste impostazioni agiscono solo quando la sede ha l'ordinazione attiva. Senza ordinazione, le opzioni restano visibili nel menu ma non selezionabili." />
                                                    </div>
                                                    <div className={styles.formSection}>
                                                        <Text variant="body-sm" weight={600}>
                                                            Quante scelte può fare il cliente?
                                                        </Text>
                                                        <QuantityChooser
                                                            mode={editGroupMaxMode}
                                                            onModeChange={setEditGroupMaxMode}
                                                            n={editGroupMaxN}
                                                            onNChange={setEditGroupMaxN}
                                                            disabled={savingGroupId === group.id}
                                                        />
                                                    </div>
                                                    <Switch
                                                        label="Il cliente deve scegliere"
                                                        helperText="Non può completare l'ordine senza aver scelto un'opzione di questo gruppo."
                                                        checked={editGroupRequired}
                                                        onChange={setEditGroupRequired}
                                                        disabled={savingGroupId === group.id}
                                                    />
                                                </div>
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
                                                {isPrimary ? (
                                                    <Badge variant="secondary">
                                                        Definisce il prezzo
                                                    </Badge>
                                                ) : (
                                                    <>
                                                        <Badge variant="secondary">
                                                            {group.values.length}{" "}
                                                            {group.values.length === 1
                                                                ? "opzione"
                                                                : "opzioni"}
                                                        </Badge>
                                                        {group.max_selectable != null && (
                                                            <Badge variant="secondary">
                                                                max {group.max_selectable}
                                                            </Badge>
                                                        )}
                                                        {group.is_required && (
                                                            <Badge variant="secondary">
                                                                Obbligatorio
                                                            </Badge>
                                                        )}
                                                    </>
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
                                        priceMode={isPrimary ? "absolute" : "delta"}
                                        emptyTitle="Nessuna scelta"
                                        namePlaceholder={
                                            isPrimary ? "Nome (es. Piccola)" : "Nome (es. Latte)"
                                        }
                                        pricePlaceholder={isPrimary ? "Prezzo" : "Costo aggiuntivo"}
                                        onCreate={(name, price) =>
                                            handleCreateValue(group, name, price)
                                        }
                                        onUpdate={(id, name, price) =>
                                            handleUpdateValue(group, id, name, price)
                                        }
                                        onDelete={handleDeleteValue}
                                    />
                                </div>
                            );
                        })}
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
