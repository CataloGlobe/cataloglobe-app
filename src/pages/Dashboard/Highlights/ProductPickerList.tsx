import { useEffect, useMemo, useState } from "react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { supabase } from "@/services/supabase/client";
import styles from "./ProductPickerList.module.scss";

interface ProductPickerListProps {
    selectedProductIds: string[];
    onSelectionChange: (productIds: string[]) => void;
}

type ProductRow = {
    id: string;
    name: string;
    base_price: number | null;
};

type ProductGroupOption = {
    id: string;
    name: string;
};

type ProductGroupItemRow = {
    product_id: string;
    group_id: string;
};

export default function ProductPickerList({
    selectedProductIds,
    onSelectionChange
}: ProductPickerListProps) {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [groupOptions, setGroupOptions] = useState<ProductGroupOption[]>([]);
    const [groupProductMap, setGroupProductMap] = useState<Map<string, Set<string>>>(new Map());
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const loadProducts = async () => {
            try {
                setLoading(true);
                const [{ data: productsData, error: productsError }, groupsRes, groupItemsRes] =
                    await Promise.all([
                        supabase
                            .from("products")
                            .select("id, name, base_price")
                            .order("name", { ascending: true }),
                        tenantId
                            ? supabase
                                  .from("product_groups")
                                  .select("id, name")
                                  .eq("tenant_id", tenantId)
                                  .order("name", { ascending: true })
                            : Promise.resolve({ data: [], error: null } as any),
                        tenantId
                            ? supabase
                                  .from("product_group_items")
                                  .select("product_id, group_id")
                                  .eq("tenant_id", tenantId)
                            : Promise.resolve({ data: [], error: null } as any)
                    ]);

                if (productsError) throw productsError;
                if (groupsRes.error) throw groupsRes.error;
                if (groupItemsRes.error) throw groupItemsRes.error;

                setProducts((productsData ?? []) as ProductRow[]);
                setGroupOptions((groupsRes.data ?? []) as ProductGroupOption[]);

                const nextMap = new Map<string, Set<string>>();
                for (const row of (groupItemsRes.data ?? []) as ProductGroupItemRow[]) {
                    const current = nextMap.get(row.group_id) ?? new Set<string>();
                    current.add(row.product_id);
                    nextMap.set(row.group_id, current);
                }
                setGroupProductMap(nextMap);
            } catch (error) {
                console.error("Error loading products for picker", error);
                showToast({ type: "error", message: "Impossibile caricare la lista prodotti." });
            } finally {
                setLoading(false);
            }
        };

        loadProducts();
    }, [showToast, tenantId]);

    const filteredProducts = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const allowedProductIds =
            selectedGroupId.length > 0 ? groupProductMap.get(selectedGroupId) : null;

        return products.filter(product => {
            if (allowedProductIds && !allowedProductIds.has(product.id)) return false;
            if (!normalizedSearch) return true;
            return product.name.toLowerCase().includes(normalizedSearch);
        });
    }, [products, searchTerm, selectedGroupId, groupProductMap]);

    const columns = useMemo<ColumnDefinition<ProductRow>[]>(
        () => [
            {
                id: "name",
                header: "Prodotto",
                accessor: row => row.name,
                cell: value => (
                    <div className={styles.nameCell}>
                        <Text variant="body-sm" weight={600}>
                            {String(value)}
                        </Text>
                    </div>
                )
            },
            {
                id: "price",
                header: "Prezzo base",
                accessor: row => row.base_price,
                align: "right",
                width: "140px",
                cell: value => (
                    <Text variant="body-sm" colorVariant="muted">
                        {typeof value === "number" ? `€${value.toFixed(2)}` : "-"}
                    </Text>
                )
            }
        ],
        []
    );

    return (
        <div className={styles.container}>
            <div className={styles.filtersBlock}>
                <Select
                    label="Gruppo prodotto"
                    value={selectedGroupId}
                    onChange={event => setSelectedGroupId(event.target.value)}
                    options={[
                        { value: "", label: "Tutti i gruppi" },
                        ...groupOptions.map(group => ({ value: group.id, label: group.name }))
                    ]}
                />

                <SearchInput
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    onClear={() => setSearchTerm("")}
                    placeholder="Cerca prodotto..."
                    allowClear
                />
            </div>

            <div className={styles.tableWrap}>
                <DataTable<ProductRow>
                    data={filteredProducts}
                    columns={columns}
                    isLoading={loading}
                    loadingState="Caricamento prodotti disponibili..."
                    emptyState="Nessun prodotto trovato con i filtri attuali."
                    rowsPerPage={8}
                    selectable
                    selectedRowIds={selectedProductIds}
                    onSelectedRowsChange={onSelectionChange}
                    showSelectionBar={false}
                />
            </div>
        </div>
    );
}
