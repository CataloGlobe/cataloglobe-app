import type { V2Product } from "@/services/supabase/products";
import type { GroupWithValues } from "@/services/supabase/productOptions";
import styles from "./PrezziOpzioniTab.module.scss";

interface PrezziOpzioniTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    primaryPriceGroup: GroupWithValues | null;
    addonGroups: GroupWithValues[];
    optionsLoading: boolean;
    onRefreshOptions: () => Promise<void>;
    onProductUpdated: (product: V2Product) => void;
    onOpenVariantDrawer: () => void;
    onVariantUpdated: () => Promise<void> | void;
}

/**
 * Tab "Prezzi & Opzioni" — orchestrator delle 3 sub-card che assorbono
 * PricingTab + VariantsTab + ConfigTab. Task 2.1: shell con placeholder.
 * Logic migration: Task 2.2 (Prezzo), 2.3 (Varianti + MatrixConfigDrawer),
 * 2.4 (Opzioni extra).
 */
export default function PrezziOpzioniTab({ product }: PrezziOpzioniTabProps) {
    const isVariant = product.parent_product_id !== null;

    return (
        <div className={styles.grid}>
            {/* Card 1 — Prezzo */}
            <section className={styles.card} data-section="prezzo">
                <header className={styles.cardHeader}>
                    <span className={styles.cardLabel}>Prezzo</span>
                </header>
                <div className={styles.placeholder}>
                    Sub-sezione Prezzo — Task 2.2
                </div>
            </section>

            {/* Card 2 — Varianti — visibile solo su prodotti base */}
            {!isVariant && (
                <section className={styles.card} data-section="varianti">
                    <header className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Varianti</span>
                    </header>
                    <div className={styles.placeholder}>
                        Sub-sezione Varianti — Task 2.3
                    </div>
                </section>
            )}

            {/* Card 3 — Opzioni extra */}
            <section className={styles.card} data-section="opzioni">
                <header className={styles.cardHeader}>
                    <span className={styles.cardLabel}>Opzioni extra</span>
                </header>
                <div className={styles.placeholder}>
                    Sub-sezione Opzioni extra — Task 2.4
                </div>
            </section>
        </div>
    );
}
