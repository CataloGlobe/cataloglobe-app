import type { CSSProperties } from "react";
import { ImageIcon } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import type { StylePalette } from "@/components/ui/StyleSwatch/StyleSwatch";
import styles from "./ProductPhonePreview.module.scss";

export type PreviewPart = "piatto" | "allergeni" | "scelte" | "abbinamenti";

export interface ProductPhonePreviewProps {
    name: string;
    description: string;
    priceLabel: string;
    imageUrl: string | null;
    allergens: string[];
    /** Le scelte del cliente con almeno un'opzione, nell'ordine della pagina. */
    choices: { name: string; rule: string; options: string[] }[];
    pairings: string[];
    /** I colori dello stile del menù che mostra il prodotto. */
    palette: StylePalette;
    onGoto: (part: PreviewPart) => void;
}

/**
 * «Come lo vede il cliente» (Officina 3, D117 A): un telefono semplice,
 * disegnato a parte, che segue la bozza mentre scrivi. Non è la pagina
 * pubblica: ne mostra i pezzi, e ogni pezzo porta dove si modifica.
 */
export function ProductPhonePreview({
    name,
    description,
    priceLabel,
    imageUrl,
    allergens,
    choices,
    pairings,
    palette,
    onGoto
}: ProductPhonePreviewProps) {
    return (
        <aside className={styles.aside} aria-label="Come lo vede il cliente">
            <Text as="span" variant="caption" colorVariant="muted">
                Come lo vede il cliente
            </Text>
            <div className={styles.phone}>
                <div
                    className={styles.screen}
                    style={
                        {
                            "--ph-bg": palette.background,
                            "--ph-primary": palette.primary,
                            "--ph-accent": palette.accent,
                            "--ph-text": palette.muted
                        } as CSSProperties
                    }
                >
                    <button type="button" className={`${styles.part} ${styles.cover}`} onClick={() => onGoto("piatto")} aria-label="Foto">
                        {imageUrl ? <img src={imageUrl} alt="" /> : <ImageIcon size={22} aria-hidden />}
                    </button>
                    <div className={styles.body}>
                        <button type="button" className={styles.part} onClick={() => onGoto("piatto")}>
                            <span className={styles.titleRow}>
                                <b>{name || "Senza nome"}</b>
                                <b>{priceLabel}</b>
                            </span>
                            {description && <span className={styles.clamp}>{description}</span>}
                        </button>
                        {allergens.length > 0 && (
                            <button type="button" className={styles.part} onClick={() => onGoto("allergeni")}>
                                <span className={styles.chips}>
                                    {allergens.map(a => (
                                        <i key={a}>{a}</i>
                                    ))}
                                </span>
                            </button>
                        )}
                        {choices.slice(0, 2).map(c => (
                            <button key={c.name} type="button" className={styles.part} onClick={() => onGoto("scelte")}>
                                <span className={styles.choice}>
                                    <b>{c.name}</b> <span className={styles.muted}>{c.rule}</span>
                                </span>
                                {c.options.slice(0, 2).map(o => (
                                    <span key={o} className={styles.option}>
                                        ○ {o}
                                    </span>
                                ))}
                            </button>
                        ))}
                        {choices.length > 2 && <span className={styles.muted}>+ altre {choices.length - 2} scelte</span>}
                        {pairings.length > 0 && (
                            <button type="button" className={styles.part} onClick={() => onGoto("abbinamenti")}>
                                <span>
                                    <b>Perfetto con</b> {pairings.join(", ")}
                                </span>
                            </button>
                        )}
                    </div>
                    <span className={styles.add}>Aggiungi · {priceLabel}</span>
                </div>
            </div>
        </aside>
    );
}
