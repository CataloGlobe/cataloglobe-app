import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
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
    onAdd: (item: {
        pairedProductId: string;
        pairedProductName: string | null;
        pairedProductImageUrl: string | null;
    }) => void;
}

/**
 * Picker category-free (base products del tenant) per aggiungere abbinamenti.
 * Resta aperto ad ogni scelta: il prodotto scelto sparisce dalla lista
 * (escluso dal parent via `excludeIds`), così si possono aggiungere più
 * abbinamenti in sequenza. Chiusura esplicita via footer.
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

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setSearch("");
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
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
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

                {loading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento prodotti...
                    </Text>
                ) : filtered.length === 0 ? (
                    <div className={styles.pickerEmpty}>
                        <Text variant="body-sm" colorVariant="muted">
                            {products.length === 0
                                ? "Nessun prodotto disponibile."
                                : "Nessun prodotto da aggiungere."}
                        </Text>
                    </div>
                ) : (
                    <div className={styles.pickerList}>
                        {filtered.map(product => (
                            <button
                                key={product.id}
                                type="button"
                                className={styles.pickerItem}
                                onClick={() =>
                                    onAdd({
                                        pairedProductId: product.id,
                                        pairedProductName: product.name,
                                        pairedProductImageUrl: product.image_url
                                    })
                                }
                            >
                                {product.image_url ? (
                                    <img
                                        src={product.image_url}
                                        alt=""
                                        className={styles.pickerThumb}
                                    />
                                ) : (
                                    <span className={styles.pickerThumbPlaceholder} aria-hidden>
                                        <ImageOff size={16} />
                                    </span>
                                )}
                                <Text variant="body-sm" weight={500} className={styles.pickerName}>
                                    {product.name}
                                </Text>
                            </button>
                        ))}
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default PairingProductPicker;
