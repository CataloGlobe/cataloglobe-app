import { useEffect, useMemo, useState } from "react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { listFeaturedPickerCatalog, type FeaturedPickerProduct } from "@/services/supabase/featuredContents";
import { getDisplayPrice } from "@/utils/priceDisplay";
import styles from "./ProductPickerList.module.scss";

interface ProductPickerListProps {
    selectedProductIds: string[];
    onSelectionChange: (productIds: string[]) => void;
    /** Il catalogo caricato: chi collega i prodotti in bozza ne legge nome e prezzo. */
    onCatalogLoaded?: (products: FeaturedPickerProduct[]) => void;
}

type ProductRow = FeaturedPickerProduct;

type ProductGroupOption = {
    id: string;
    name: string;
};

export default function ProductPickerList({
    selectedProductIds,
    onSelectionChange,
    onCatalogLoaded
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
        if (!tenantId) return;
        let cancelled = false;
        setLoading(true);
        listFeaturedPickerCatalog(tenantId)
            .then(catalog => {
                if (cancelled) return;
                setProducts(catalog.products);
                setGroupOptions(catalog.groups);
                const nextMap = new Map<string, Set<string>>();
                for (const row of catalog.groupItems) {
                    const current = nextMap.get(row.group_id) ?? new Set<string>();
                    current.add(row.product_id);
                    nextMap.set(row.group_id, current);
                }
                setGroupProductMap(nextMap);
                onCatalogLoaded?.(catalog.products);
            })
            .catch(error => {
                console.error("Error loading products for picker", error);
                showToast({ type: "error", message: "Impossibile caricare la lista prodotti." });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // onCatalogLoaded è un callback del chiamante: una volta per apertura basta.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                header: "Prezzo",
                accessor: row => row.id,
                align: "right",
                width: "140px",
                cell: (_value, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {getDisplayPrice(row).label}
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
                    ariaLabel="Prodotti da collegare"
                    data={filteredProducts}
                    allRowIds={products.map(p => p.id)}
                    columns={columns}
                    isLoading={loading}
                    loadingState={{ message: "Caricamento prodotti disponibili..." }}
                    emptyState={{ title: "Nessun prodotto trovato con i filtri attuali." }}
                    pageSize={25}
                    pageSizeOptions={[25, 50, 100, "all"]}
                    selectable
                    selectedRowIds={selectedProductIds}
                    onSelectedRowsChange={onSelectionChange}
                    showSelectionBar={false}
                />
            </div>
        </div>
    );
}
