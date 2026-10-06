import { Image as ImageIcon } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import styles from "./ProductPhotoPlaceholder.module.scss";

type ProductPhotoPlaceholderProps = {
    /** Miniatura della tabella (36): solo l'icona, senza scritta. */
    small?: boolean;
    /** La scritta sotto l'icona: «Nessuna immagine» per i contenuti in evidenza. */
    label?: string;
};

/**
 * Il prodotto senza foto (correzioni UI PR1): icona `Image` grigia e «Nessuna
 * foto» su `hover-bg`. Mai iniziali colorate. Stessa regola nella card e
 * nella miniatura della tabella.
 */
export function ProductPhotoPlaceholder({ small = false, label = "Nessuna foto" }: ProductPhotoPlaceholderProps) {
    return (
        <span className={`${styles.placeholder}${small ? ` ${styles.small}` : ""}`} aria-hidden>
            <ImageIcon size={small ? 16 : 32} strokeWidth={1.5} />
            {!small && (
                <Text as="span" variant="caption" className={styles.label}>
                    {label}
                </Text>
            )}
        </span>
    );
}
