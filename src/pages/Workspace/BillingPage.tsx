import Text from "@/components/ui/Text/Text";
import styles from "./PlaceholderPage.module.scss";

export default function BillingPage() {
    return (
        <div className={styles.page}>
            <Text variant="title-lg" weight={700}>
                Abbonamento
            </Text>
            <Text variant="body" colorVariant="muted" style={{ marginTop: 8 }}>
                La gestione dell&apos;abbonamento sarà disponibile a breve.
            </Text>
        </div>
    );
}
