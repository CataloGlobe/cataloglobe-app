import { formatCurrency } from "@/utils/formatCurrency";
import Text from "@/components/ui/Text/Text";
import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import type { ProductPickerItem } from "@/services/supabase/products";
import { StoryProductPickerDrawer } from "./StoryProductPickerDrawer";
import styles from "./StoryProductPicker.module.scss";

/**
 * I prodotti base, letti una volta dalla pagina e passati a ogni picker
 * (prima ogni picker e ogni blocco Prodotto faceva la sua lettura).
 * `items` null = non caricato: in caricamento, o `failed`.
 */
export type StoryProductOptions = { items: ProductPickerItem[] | null; failed: boolean };

interface StoryProductPickerProps {
    tenantId: string | null;
    value: string | null;
    onChange: (productId: string | null) => void;
    options: StoryProductOptions;
    /** Nome da mostrare se l'elenco non arriva (il prodotto letto con la storia). */
    fallbackName?: string | null;
    disabled?: boolean;
}

/**
 * Riga "prodotto collegato" — presentazionale, controlled dal draft del
 * parent (`productId` in StoryDetailPage). La selezione avviene nel drawer
 * `StoryProductPickerDrawer` (tabella ricercabile); qui restano lo stato
 * vuoto (CTA che apre il drawer) e la riga del collegato (Cambia/Rimuovi).
 * Con un prodotto collegato la CTA vuota non compare mai: in caricamento
 * c'è lo scheletro, e un prodotto che l'elenco non ha (tolto, o diventato
 * variante) si dice «non disponibile», sempre con Cambia e Rimuovi.
 */
export function StoryProductPicker({ tenantId, value, onChange, options, fallbackName, disabled }: StoryProductPickerProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    const selected = useMemo(() => options.items?.find(p => p.id === value) ?? null, [options.items, value]);
    const loading = value !== null && options.items === null && !options.failed;

    const row = (name: string, caption: string | null, imageUrl: string | null) => (
        <div className={styles.selectedRow} role="status" aria-label="Prodotto collegato">
            {imageUrl ? (
                <img src={imageUrl} alt="" className={styles.thumb} />
            ) : (
                <div className={styles.thumbPlaceholder}>
                    <Package size={16} strokeWidth={2} aria-hidden="true" />
                </div>
            )}
            <div className={styles.meta}>
                <Text as="span" variant="body-sm" weight={600} className={styles.name}>{name}</Text>
                {caption && (
                    <Text as="span" variant="caption" colorVariant="muted">{caption}</Text>
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
    );

    const content =
        value === null ? (
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
        ) : loading ? (
            <Skeleton width="100%" height={40} radius="var(--radius-inner)" />
        ) : selected ? (
            row(selected.name, selected.base_price != null ? formatCurrency(selected.base_price) : null, selected.image_url)
        ) : options.failed ? (
            row(fallbackName ?? "Prodotto collegato", "Dettagli del prodotto non caricati.", null)
        ) : (
            row("Prodotto non disponibile", "Non è più nel catalogo: scegline un altro o toglilo.", null)
        );

    return (
        <>
            {content}

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
