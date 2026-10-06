import { useId } from "react";
import Text from "@/components/ui/Text/Text";
import type { FeaturedContentType } from "@/services/supabase/featuredContents";
import {
    CONTENT_TYPE_LABEL,
    CONTENT_TYPE_ORDER,
    CONTENT_TYPE_SENTENCE,
    productsLabel,
    typeHasProducts
} from "../featuredContentTypes";
import styles from "./FeaturedTypeCards.module.scss";

type FeaturedTypeCardsProps = {
    value: FeaturedContentType;
    onChange: (type: FeaturedContentType) => void;
    legend?: string;
    disabled?: boolean;
};

/**
 * «Che cosa vuoi mettere in evidenza?» (correzioni UI EV4): quattro schede
 * con un disegno schematico nei colori del gestionale, la frase vera e
 * «con / senza prodotti». Radio veri, così tastiera e lettori di schermo
 * li leggono come una scelta sola. Serve alla creazione e a «Cambia tipo».
 */
export function FeaturedTypeCards({
    value,
    onChange,
    legend = "Che cosa vuoi mettere in evidenza?",
    disabled = false
}: FeaturedTypeCardsProps) {
    const name = useId();
    return (
        <fieldset className={styles.fieldset} disabled={disabled}>
            <Text as="legend" variant="body" weight={600} className={styles.legend}>
                {legend}
            </Text>
            <div className={styles.grid}>
                {CONTENT_TYPE_ORDER.map(type => (
                    <label key={type} className={styles.card} data-checked={value === type || undefined}>
                        <input
                            type="radio"
                            name={name}
                            value={type}
                            checked={value === type}
                            onChange={() => onChange(type)}
                            className={styles.radio}
                        />
                        <TypeSketch type={type} />
                        <span className={styles.text}>
                            <Text as="span" variant="body-sm" weight={600}>
                                {CONTENT_TYPE_LABEL[type]}
                            </Text>
                            <Text as="span" variant="caption" colorVariant="muted">
                                {CONTENT_TYPE_SENTENCE[type]}
                            </Text>
                            <Text as="span" variant="caption" weight={600} className={styles.products}>
                                {productsLabel(type)}
                            </Text>
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

/** Il disegno: solo forme, nei token del gestionale. */
function TypeSketch({ type }: { type: FeaturedContentType }) {
    const withProducts = typeHasProducts(type);
    return (
        <span className={styles.sketch} aria-hidden>
            {type === "event" && <span className={styles.tag} />}
            <span className={styles.title} />
            {withProducts ? (
                <>
                    {[0, 1].map(i => (
                        <span key={i} className={styles.product}>
                            <span className={styles.thumb} />
                            <span className={styles.line} />
                            {type === "promo" && <span className={styles.price} />}
                        </span>
                    ))}
                    {type === "bundle" && (
                        <span className={styles.bundlePrice}>
                            <span className={styles.struck} />
                            <span className={styles.price} />
                        </span>
                    )}
                </>
            ) : (
                <>
                    <span className={styles.line} />
                    <span className={`${styles.line} ${styles.short}`} />
                    <span className={styles.image} />
                </>
            )}
        </span>
    );
}
