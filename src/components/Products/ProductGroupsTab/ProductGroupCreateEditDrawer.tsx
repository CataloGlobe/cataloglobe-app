import React, { useEffect, useState, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createProductGroup,
    updateProductGroup,
    getGroupProducts,
    syncGroupProducts,
    ProductGroup
} from "@/services/supabase/productGroups";
import {
    listBaseProductsForPicker,
    ProductPickerItem
} from "@/services/supabase/products";
import styles from "./ProductGroupsTab.module.scss";

export type GroupFormMode = "create" | "edit";

type ProductGroupCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: GroupFormMode;
    groupData: ProductGroup | null;
    allGroups: ProductGroup[];
    onSuccess: () => void;
    tenantId?: string;
};

export function ProductGroupCreateEditDrawer({
    open,
    onClose,
    mode,
    groupData,
    allGroups,
    onSuccess,
    tenantId
}: ProductGroupCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";

    // ── Group form state ─────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [parentGroupId, setParentGroupId] = useState<string | null>(null);

    // ── Product picker state ─────────────────────────────────────────────────
    const [allProducts, setAllProducts] = useState<ProductPickerItem[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
    const [productSearch, setProductSearch] = useState("");

    // ── Parent group options ─────────────────────────────────────────────────
    const parentOptions = useMemo(() => {
        const rootGroups = allGroups.filter(g => g.parent_group_id === null);
        if (isEditing && groupData) {
            return rootGroups.filter(g => g.id !== groupData.id);
        }
        return rootGroups;
    }, [allGroups, isEditing, groupData]);

    const selectOptions = [
        { value: "", label: "Nessun gruppo padre (Root)" },
        ...parentOptions.map(g => ({ value: g.id, label: g.name }))
    ];

    // ── Filtered product list ────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return allProducts;
        const q = productSearch.toLowerCase();
        return allProducts.filter(p => p.name.toLowerCase().includes(q));
    }, [allProducts, productSearch]);

    // ── On open: reset + load data ───────────────────────────────────────────
    useEffect(() => {
        if (!open) return;

        setIsSaving(false);
        setProductSearch("");

        if (isEditing && groupData) {
            setName(groupData.name);
            setParentGroupId(groupData.parent_group_id);
        } else {
            setName("");
            setParentGroupId(null);
            setSelectedProductIds(new Set());
        }

        if (!tenantId) return;

        const loadPickerData = async () => {
            setIsLoadingProducts(true);
            try {
                const [products, assignedIds] = await Promise.all([
                    listBaseProductsForPicker(tenantId),
                    isEditing && groupData
                        ? getGroupProducts(groupData.id, tenantId)
                        : Promise.resolve([] as string[])
                ]);
                setAllProducts(products);
                setSelectedProductIds(new Set(assignedIds));
            } catch {
                showToast({ message: "Errore nel caricamento dei prodotti.", type: "error" });
            } finally {
                setIsLoadingProducts(false);
            }
        };

        loadPickerData();
    }, [open, isEditing, groupData, tenantId, showToast]);

    // ── Toggle single product ────────────────────────────────────────────────
    const toggleProduct = (productId: string) => {
        setSelectedProductIds(prev => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    };

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!tenantId) {
            showToast({ message: "Errore: tenantId mancante.", type: "error" });
            return;
        }
        if (!name.trim()) {
            showToast({ message: "Il nome del gruppo è obbligatorio.", type: "info" });
            return;
        }

        setIsSaving(true);
        try {
            let savedGroupId: string;
            let successMessage: string;

            if (isEditing && groupData) {
                await updateProductGroup(groupData.id, {
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                savedGroupId = groupData.id;
                successMessage = "Gruppo aggiornato con successo.";
            } else {
                const newGroup = await createProductGroup({
                    tenant_id: tenantId,
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                savedGroupId = newGroup.id;
                successMessage = "Gruppo creato con successo.";
            }

            // tenantId is guaranteed non-undefined here due to the early return guard above
            await syncGroupProducts(savedGroupId, tenantId!, Array.from(selectedProductIds));

            showToast({ message: successMessage, type: "success" });
            onSuccess();
            onClose();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Errore durante il salvataggio.";
            console.error("Errore salvataggio gruppo:", error);
            showToast({ message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const header = (
        <div>
            <Text variant="title-sm" weight={600}>
                {isEditing ? "Modifica gruppo" : "Crea nuovo gruppo"}
            </Text>
            <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 4 }}>
                {isEditing
                    ? "Modifica i dettagli del gruppo di prodotti."
                    : "Aggiungi un nuovo gruppo per organizzare i tuoi prodotti."}
            </Text>
        </div>
    );

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                Salva
            </Button>
        </>
    );

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout header={header} footer={footer}>
                <div className={styles.formBody}>
                    {/* ── Group details ─────────────────────────────────────── */}
                    <div className={styles.formSection}>
                        <div className={styles.formRow}>
                            <TextInput
                                label="Nome gruppo"
                                placeholder="Es: Bevande, Snack..."
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formRow}>
                            <Select
                                label="Gruppo padre (opzionale)"
                                value={parentGroupId || ""}
                                onChange={e => setParentGroupId(e.target.value || null)}
                                options={selectOptions}
                            />
                            <Text variant="caption" colorVariant="muted" style={{ marginTop: 4 }}>
                                Solo i gruppi principali possono avere sottogruppi. Massima
                                profondità: 1 livello.
                            </Text>
                        </div>
                    </div>

                    {/* ── Divider ───────────────────────────────────────────── */}
                    <div className={styles.sectionDivider} />

                    {/* ── Product picker ────────────────────────────────────── */}
                    <div className={styles.pickerSection}>
                        <div className={styles.pickerHeader}>
                            <Text variant="body" weight={600}>
                                Prodotti inclusi
                            </Text>
                            {selectedProductIds.size > 0 && (
                                <Text variant="caption" colorVariant="muted">
                                    {selectedProductIds.size}{" "}
                                    {selectedProductIds.size === 1 ? "prodotto selezionato" : "prodotti selezionati"}
                                </Text>
                            )}
                        </div>

                        <SearchInput
                            placeholder="Cerca prodotto..."
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            onClear={() => setProductSearch("")}
                            allowClear
                        />

                        <div className={styles.pickerList}>
                            {isLoadingProducts ? (
                                <div className={styles.pickerLoading}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento prodotti...
                                    </Text>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className={styles.pickerEmptyState}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {productSearch
                                            ? "Nessun prodotto corrisponde alla ricerca."
                                            : "Nessun prodotto disponibile."}
                                    </Text>
                                </div>
                            ) : (
                                filteredProducts.map(product => {
                                    const isSelected = selectedProductIds.has(product.id);
                                    return (
                                        <div
                                            key={product.id}
                                            className={`${styles.pickerItem} ${isSelected ? styles.pickerItemSelected : ""}`}
                                            onClick={() => toggleProduct(product.id)}
                                        >
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt=""
                                                    className={styles.pickerItemThumb}
                                                />
                                            ) : (
                                                <div className={styles.pickerItemThumbPlaceholder} />
                                            )}

                                            <Text
                                                variant="body-sm"
                                                weight={isSelected ? 600 : 400}
                                                className={styles.pickerItemName}
                                            >
                                                {product.name}
                                            </Text>

                                            {/* Stop-propagation wrapper prevents double-toggle:
                                                the row div's onClick already handles toggling;
                                                if the click reaches the CheckboxInput's label,
                                                its onChange would fire a second toggle. */}
                                            <div onClick={e => e.stopPropagation()}>
                                                <CheckboxInput
                                                    checked={isSelected}
                                                    onChange={() => toggleProduct(product.id)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
