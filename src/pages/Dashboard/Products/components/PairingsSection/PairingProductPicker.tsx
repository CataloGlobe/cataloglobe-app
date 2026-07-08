import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    listBaseProductsForPicker,
    type ProductPickerItem
} from "@/services/supabase/products";
import styles from "./PairingsSection.module.scss";

interface PairingProductPickerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    /** Prodotto sorgente — mai selezionabile come abbinato di se stesso. */
    currentProductId: string;
    /** Abbinati già presenti nel draft — esclusi dalla lista. */
    excludeIds: string[];
    onAdd: (items: {
        pairedProductId: string;
        pairedProductName: string | null;
        pairedProductImageUrl: string | null;
    }[]) => void;
}

/**
 * Picker standard (DataTable selectable + SearchInput) per aggiungere
 * abbinamenti — stesso pattern del picker prodotti di Highlights
 * (`ProductPickerList`), con fetch/esclusione dedicate: solo base products
 * del tenant, esclusi prodotto corrente + già-abbinati. Selezione multipla
 * con conferma esplicita ("Aggiungi") invece di add-on-click.
 */
export function PairingProductPicker({
    open,
    onClose,
    tenantId,
    currentProductId,
    excludeIds,
    onAdd
}: PairingProductPickerProps) {
    const { showToast } = useToast();
    const [products, setProducts] = useState<ProductPickerItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setSearch("");
        setSelectedIds([]);
        listBaseProductsForPicker(tenantId)
            .then(rows => {
                if (!cancelled) setProducts(rows);
            })
            .catch(() => {
                if (!cancelled)
                    showToast({ message: "Errore nel caricamento dei prodotti", type: "error" });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tenantId, showToast]);

    const excludeSet = useMemo(
        () => new Set([currentProductId, ...excludeIds]),
        [currentProductId, excludeIds]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter(product => {
            if (excludeSet.has(product.id)) return false;
            if (term && !product.name.toLowerCase().includes(term)) return false;
            return true;
        });
    }, [products, excludeSet, search]);

    const columns = useMemo<ColumnDefinition<ProductPickerItem>[]>(
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
                                <ImageOff size={14} />
                            </span>
                        )}
                        <Text variant="body-sm" weight={600} className={styles.name}>
                            {row.name}
                        </Text>
                    </div>
                )
            }
        ],
        []
    );

    const handleConfirm = () => {
        if (selectedIds.length === 0) return;
        const selectedSet = new Set(selectedIds);
        const items = products
            .filter(product => selectedSet.has(product.id))
            .map(product => ({
                pairedProductId: product.id,
                pairedProductName: product.name,
                pairedProductImageUrl: product.image_url
            }));
        onAdd(items);
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={700}>
                            Aggiungi abbinamento
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Scegli i prodotti che stanno bene insieme.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirm}
                            disabled={selectedIds.length === 0}
                        >
                            Aggiungi
                        </Button>
                    </>
                }
            >
                <div className={styles.pickerSearch}>
                    <SearchInput
                        placeholder="Cerca prodotto..."
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        onClear={() => setSearch("")}
                    />
                </div>

                <div className={styles.pickerTableWrap}>
                    <DataTable<ProductPickerItem>
                        data={filtered}
                        allRowIds={products.map(p => p.id)}
                        columns={columns}
                        isLoading={loading}
                        loadingState={{ message: "Caricamento prodotti..." }}
                        emptyState={{
                            title:
                                products.length === 0
                                    ? "Nessun prodotto disponibile."
                                    : "Nessun prodotto da aggiungere."
                        }}
                        maxHeight="calc(100dvh - 320px)"
                        selectable
                        selectedRowIds={selectedIds}
                        onSelectedRowsChange={setSelectedIds}
                        showSelectionBar={false}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default PairingProductPicker;
