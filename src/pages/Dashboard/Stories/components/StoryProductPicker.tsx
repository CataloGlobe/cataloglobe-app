import { formatCurrency } from "@/utils/formatCurrency";
import Text from "@/components/ui/Text/Text";
import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { listBaseProductsForPicker, ProductPickerItem } from "@/services/supabase/products";
import { StoryProductPickerDrawer } from "./StoryProductPickerDrawer";
import styles from "./StoryProductPicker.module.scss";

interface StoryProductPickerProps {
    tenantId: string | null;
    value: string | null;
    onChange: (productId: string | null) => void;
    disabled?: boolean;
}

/**
 * Riga "prodotto collegato" — presentazionale, controlled dal draft del
 * parent (`productId` in StoryDetailPage). La selezione avviene nel drawer
 * `StoryProductPickerDrawer` (tabella ricercabile); qui restano solo lo
 * stato vuoto (CTA che apre il drawer) e la riga selezionata (Cambia/Rimuovi).
 */
export function StoryProductPicker({ tenantId, value, onChange, disabled }: StoryProductPickerProps) {
    const [products, setProducts] = useState<ProductPickerItem[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        if (!tenantId) return;
        listBaseProductsForPicker(tenantId)
            .then(setProducts)
            .catch(err => console.error("[StoryProductPicker] fetch failed:", err));
    }, [tenantId]);

    const selected = useMemo(() => products.find(p => p.id === value) ?? null, [products, value]);

    return (
        <>
            {selected ? (
                <div className={styles.selectedRow} role="status" aria-label="Prodotto collegato">
                    {selected.image_url ? (
                        <img src={selected.image_url} alt="" className={styles.thumb} />
                    ) : (
                        <div className={styles.thumbPlaceholder}>
                            <Package size={16} strokeWidth={2} aria-hidden="true" />
                        </div>
                    )}
                    <div className={styles.meta}>
                        <Text as="span" variant="body-sm" weight={600} className={styles.name}>{selected.name}</Text>
                        {selected.base_price != null && (
                            <Text as="span" variant="caption" colorVariant="muted">{formatCurrency(selected.base_price)}</Text>
                        )}
                    </div>
                    {!disabled && (
                        <div className={styles.rowActions}>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className={styles.changeBtn}
                                onClick={() => setDrawerOpen(true)}
                            >
                                Cambia
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                                Rimuovi
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Package size={15} strokeWidth={2} />}
                    onClick={() => setDrawerOpen(true)}
                    disabled={disabled}
                >
                    Collega un prodotto
                </Button>
            )}

            {tenantId && (
                <StoryProductPickerDrawer
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    tenantId={tenantId}
                    onSelect={product => onChange(product.id)}
                />
            )}
        </>
    );
}
