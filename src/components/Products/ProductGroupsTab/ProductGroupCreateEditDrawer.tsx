import { useEffect, useState, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createProductGroup,
    updateProductGroup,
    getGroupProducts,
    syncGroupProducts,
    ProductGroupWithCount
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
    groupData: ProductGroupWithCount | null;
    allGroups: ProductGroupWithCount[];
    onSuccess: () => void;
    tenantId?: string;
    defaultParentId?: string;
};

export function ProductGroupCreateEditDrawer({
    open,
    onClose,
    mode,
    groupData,
    allGroups,
    onSuccess,
    tenantId,
    defaultParentId
}: ProductGroupCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";
    const isParentLocked = !isEditing && !!defaultParentId;

    // ── Group form state ─────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [parentGroupId, setParentGroupId] = useState<string | null>(null);

    // ── Product picker state ─────────────────────────────────────────────────
    const [allProducts, setAllProducts] = useState<ProductPickerItem[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
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
        { value: "", label: "Nessun gruppo padre" },
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
        setSelectedProductIds([]);

        if (isEditing && groupData) {
            setName(groupData.name);
            setParentGroupId(groupData.parent_group_id);
        } else {
            setName("");
            setParentGroupId(defaultParentId ?? null);
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
                setSelectedProductIds(assignedIds);
            } catch {
                showToast({ message: "Errore nel caricamento dei prodotti.", type: "error" });
            } finally {
                setIsLoadingProducts(false);
            }
        };

        loadPickerData();
    }, [open, isEditing, groupData, tenantId, showToast, defaultParentId]);

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

            await syncGroupProducts(savedGroupId, tenantId, selectedProductIds);

            showToast({ message: successMessage, type: "success" });
            onSuccess();
            onClose();
        } catch {
            showToast({ message: "Errore nel salvataggio del gruppo.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Product picker columns ───────────────────────────────────────────────
    const pickerColumns: ColumnDefinition<ProductPickerItem>[] = [
        {
            id: "thumbnail",
            header: "",
            width: "40px",
            cell: (_value, row) =>
                row.image_url ? (
                    <img
                        src={row.image_url}
                        alt=""
                        className={styles.pickerThumb}
                    />
                ) : (
                    <div className={styles.pickerThumbPlaceholder} />
                )
        },
        {
            id: "name",
            header: "Prodotto",
            width: "1fr",
            accessor: row => row.name,
            cell: value => (
                <Text variant="body-sm">{value}</Text>
            )
        }
    ];

    // ── Render ────────────────────────────────────────────────────────────────
    const header = (
        <div>
            <Text variant="title-sm" weight={600}>
                {isEditing ? "Modifica gruppo" : "Crea nuovo gruppo"}
            </Text>
            <Text variant="body-sm" colorVariant="muted" className={styles.drawerSubtitle}>
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
                                disabled={isParentLocked}
                            />
                            <Text variant="caption" colorVariant="muted" className={styles.captionHint}>
                                {isParentLocked
                                    ? "Il gruppo padre è stato pre-selezionato."
                                    : "Solo i gruppi principali possono avere sottogruppi. Massima profondità: 1 livello."}
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
                            {selectedProductIds.length > 0 && (
                                <Text variant="caption" colorVariant="muted">
                                    {selectedProductIds.length}{" "}
                                    {selectedProductIds.length === 1 ? "prodotto selezionato" : "prodotti selezionati"}
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

                        <DataTable<ProductPickerItem>
                            data={filteredProducts}
                            columns={pickerColumns}
                            isLoading={isLoadingProducts}
                            selectable
                            selectedRowIds={selectedProductIds}
                            onSelectedRowsChange={setSelectedProductIds}
                            showSelectionBar={false}
                            density="compact"
                            emptyState={
                                <Text variant="body-sm" colorVariant="muted">
                                    {productSearch
                                        ? "Nessun prodotto corrisponde alla ricerca."
                                        : "Nessun prodotto disponibile."}
                                </Text>
                            }
                            loadingState={
                                <Text variant="body-sm" colorVariant="muted">
                                    Caricamento prodotti...
                                </Text>
                            }
                        />
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
