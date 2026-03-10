import Text from "@/components/ui/Text/Text";
import styles from "./PlaceholderPage.module.scss";

export default function TeamPage() {
    return (
        <div className={styles.page}>
            <Text variant="title-lg" weight={700}>
                Team
            </Text>
            <Text variant="body" colorVariant="muted" style={{ marginTop: 8 }}>
                La gestione del team sarà disponibile a breve.
            </Text>
        </div>
    );
}
