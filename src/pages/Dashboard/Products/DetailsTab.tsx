import Text from "@/components/ui/Text/Text";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { V2Product } from "@/services/supabase/products";
import styles from "./DetailsTab.module.scss";

interface DetailsTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    onProductUpdated: (updated: V2Product) => void;
}

/**
 * Tab "Dettagli" — orchestrator delle sub-sezioni che assorbono
 * GeneralTab + CharacteristicsAndNotesTab. Task 1.1: scaffold con 5
 * placeholder. Contenuto reale in Task 1.2 (Identità + Gruppi) e Task 1.3
 * (Specifiche food + Caratteristiche + Note).
 */
export function DetailsTab({ product }: DetailsTabProps) {
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;

    const showSpecs =
        verticalConfig.productSections.allergens ||
        verticalConfig.productSections.ingredients;
    const showCharacteristics =
        verticalConfig.productSections.characteristics && isBaseProduct;

    return (
        <div className={styles.tab}>
            <section className={styles.section} data-section="identity">
                <Text variant="title-sm" weight={600}>
                    Identità
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                    Nome, descrizione, immagine — Task 1.2
                </Text>
            </section>

            <section className={styles.section} data-section="groups">
                <Text variant="title-sm" weight={600}>
                    Gruppi prodotto
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                    Lista gruppi assegnati — Task 1.2
                </Text>
            </section>

            {showSpecs && (
                <section className={styles.section} data-section="specs">
                    <Text variant="title-sm" weight={600}>
                        Specifiche food
                    </Text>
                    <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                        Allergeni e ingredienti — Task 1.3
                    </Text>
                </section>
            )}

            {showCharacteristics && (
                <section className={styles.section} data-section="characteristics">
                    <Text variant="title-sm" weight={600}>
                        Caratteristiche
                    </Text>
                    <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                        Categorie chip — Task 1.3
                    </Text>
                </section>
            )}

            <section className={styles.section} data-section="notes">
                <Text variant="title-sm" weight={600}>
                    Note prodotto
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                    Note key-value — Task 1.3
                </Text>
            </section>
        </div>
    );
}

export default DetailsTab;
