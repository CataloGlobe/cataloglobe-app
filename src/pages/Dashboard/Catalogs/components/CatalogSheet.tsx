import Text from "@/components/ui/Text/Text";
import styles from "./CatalogSheet.module.scss";

/** Le voci disegnate sotto ogni categoria: larghezze fisse, così il foglio non balla. */
const ITEM_WIDTHS = ["58%", "44%"];

type CatalogSheetProps = {
    /** Le categorie vere, al massimo 3. Vuoto: il foglio resta bianco. */
    categories: string[];
};

/**
 * Il motivo dei Menù sulla card (correzioni UI M2): un foglio disegnato con
 * il titolo in indigo, le prime categorie vere e due voci ciascuna con i
 * puntini fino al prezzo. Un menù senza categorie è un foglio vuoto. Solo
 * decorazione: nome e numeri li dice la card.
 */
export function CatalogSheet({ categories }: CatalogSheetProps) {
    return (
        <div className={styles.frame} aria-hidden>
            <div className={styles.sheet}>
                <span className={styles.title} />
                {categories.map(name => (
                    <div key={name} className={styles.category}>
                        <Text as="span" variant="caption" weight={600} className={styles.name}>
                            {name}
                        </Text>
                        {ITEM_WIDTHS.map(width => (
                            <span key={width} className={styles.item}>
                                <span className={styles.itemName} style={{ width }} />
                                <span className={styles.dots} />
                                <span className={styles.price} />
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
