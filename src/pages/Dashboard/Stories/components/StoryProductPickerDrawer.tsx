import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    listBaseProductsForPickerWithCategory,
    type ProductPickerItemWithCategory
} from "@/services/supabase/products";
import styles from "./StoryProductPickerDrawer.module.scss";

interface StoryProductPickerDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    onSelect: (product: ProductPickerItemWithCategory) => void;
}

/**
 * Drawer "Collega un prodotto" — ricerca + DataTable, stesso pattern di
 * `PairingProductPicker`. Selezione singola: click riga imposta il prodotto
 * nel draft del parent (StoryDetailPage) e chiude subito, nessuna conferma
 * intermedia — coerente con "un solo prodotto per storia".
 */
export function StoryProductPickerDrawer({ open, onClose, tenantId, onSelect }: StoryProductPickerDrawerProps) {
    const { showToast } = useToast();
    const [products, setProducts] = useState<ProductPickerItemWithCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setSearch("");
        listBaseProductsForPickerWithCategory(tenantId)
            .then(rows => {
                if (!cancelled) setProducts(rows);
            })
            .catch(() => {
                if (!cancelled) showToast({ message: "Errore nel caricamento dei prodotti", type: "error" });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tenantId, showToast]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return products;
        return products.filter(product => product.name.toLowerCase().includes(term));
    }, [products, search]);

    const columns = useMemo<ColumnDefinition<ProductPickerItemWithCategory>[]>(
        () => [
            {
                id: "product",
                header: "Prodotto",
                accessor: row => row.name,
                cell: (_value, row) => (
                    <div className={styles.productCell}>
                        {row.image_url ? (
                            <img src={row.image_url} alt="" className={styles.thumb} />
                        ) : (
                            <span className={styles.thumbPlaceholder} aria-hidden>
                                <Package size={14} />
                            </span>
                        )}
                        <Text variant="body-sm" weight={600} className={styles.name}>
                            {row.name}
                        </Text>
                    </div>
                )
            },
            {
                id: "category",
                header: "Categoria",
                accessor: row => row.category_name ?? "",
                cell: (_value, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.category_name ?? "—"}
                    </Text>
                )
            },
            {
                id: "price",
                header: "Prezzo",
                align: "right",
                accessor: row => row.base_price ?? 0,
                cell: (_value, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.base_price != null ? `${row.base_price.toFixed(2)} €` : "—"}
                    </Text>
                )
            }
        ],
        []
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={720}>
            <DrawerLayout
                bodyLayout="flex"
                header={
                    <div>
                        <Text variant="title-sm" weight={700}>
                            Collega un prodotto
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            La storia comparirà nella scheda del prodotto scelto.
                        </Text>
                    </div>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Annulla
                    </Button>
                }
            >
                <div className={styles.container}>
                    <div className={styles.pickerSearch}>
                        <SearchInput
                            placeholder="Cerca prodotto..."
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            onClear={() => setSearch("")}
                        />
                    </div>

                    <div className={styles.pickerTableWrap}>
                        <DataTable<ProductPickerItemWithCategory>
                            data={filtered}
                            allRowIds={products.map(p => p.id)}
                            columns={columns}
                            isLoading={loading}
                            loadingState={{ message: "Caricamento prodotti..." }}
                            emptyState={{
                                title:
                                    products.length === 0
                                        ? "Nessun prodotto nel catalogo."
                                        : "Nessun prodotto trovato."
                            }}
                            onRowClick={row => {
                                onSelect(row);
                                onClose();
                            }}
                        />
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
