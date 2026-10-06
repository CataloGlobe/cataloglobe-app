import { formatPrice } from "@/utils/formatCurrency";
import Text from "@/components/ui/Text/Text";
import { useMemo, useState } from "react";
import { Package, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
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

    // SD2: il prodotto è un chip con × per scollegare, «Cambia» accanto; la
    // riga sotto dice il prezzo, o perché non lo si trova.
    const row = (name: string, caption: string | null, imageUrl: string | null) => (
        <div className={styles.selected}>
            <div className={styles.line}>
                <span className={styles.chip} role="status" aria-label="Prodotto collegato">
                    {imageUrl ? (
                        <img src={imageUrl} alt="" className={styles.thumb} />
                    ) : (
                        <span className={styles.thumbPlaceholder}>
                            <Package size={14} strokeWidth={2} aria-hidden="true" />
                        </span>
                    )}
                    <Text as="span" variant="body-sm" weight={600} className={styles.name}>
                        {name}
                    </Text>
                    {!disabled && (
                        <IconButton
                            icon={<X size={14} />}
                            aria-label={`Scollega ${name}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => onChange(null)}
                        />
                    )}
                </span>
                {!disabled && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
                        Cambia
                    </Button>
                )}
            </div>
            {caption && (
                <Text as="span" variant="caption" colorVariant="muted">
                    {caption}
                </Text>
            )}
        </div>
    );

    const content =
        value === null ? (
            <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={15} strokeWidth={2} />}
                onClick={() => setDrawerOpen(true)}
                disabled={disabled}
            >
                Collega un prodotto
            </Button>
        ) : loading ? (
            <Skeleton width="100%" height={40} radius="var(--radius-inner)" />
        ) : selected ? (
            row(selected.name, selected.base_price != null ? formatPrice(selected.base_price) : null, selected.image_url)
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
