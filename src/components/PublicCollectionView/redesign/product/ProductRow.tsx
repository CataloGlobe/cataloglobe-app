import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./ProductRow.module.scss";

type Props = {
    image: string | null | undefined;
    name: string;
    /** Riga piccola sopra il nome («Si abbina a» nel lettore della storia). */
    label?: string;
    /** Riga smorzata sotto il nome (la nota dell'abbinamento). */
    note?: string | null;
    price?: string | null;
    /** Senza: la riga non si tocca (il piatto non è nel menu di adesso). */
    onClick?: () => void;
    ariaLabel?: string;
};

/**
 * Un piatto da toccare (mockup v38 .pd-prow): miniatura, nome su due righe,
 * prezzo, ›. «Perfetto con» nella scheda e «Si abbina a» nel lettore della storia.
 */
export default function ProductRow({ image, name, label, note, price, onClick, ariaLabel }: Props) {
    const content: ReactNode = (
        <>
            {image ? (
                <img className={styles.thumb} src={image} alt="" width={44} height={44} loading="lazy" decoding="async" />
            ) : (
                <span className={styles.thumb} aria-hidden="true" />
            )}
            <span className={styles.text}>
                {label ? <span className={styles.label}>{label}</span> : null}
                <span className={styles.name}>{name}</span>
                {note ? <span className={styles.muted}>{note}</span> : null}
            </span>
            {price ? <span className={styles.price}>{price}</span> : null}
        </>
    );
    return onClick ? (
        <button type="button" className={styles.row} onClick={onClick} aria-label={ariaLabel}>
            {content}
            <ChevronRight size={16} aria-hidden="true" className={styles.muted} />
        </button>
    ) : (
        <div className={styles.row}>{content}</div>
    );
}
