import Text from "@/components/ui/Text/Text";
import styles from "./PlaceholderPage.module.scss";

export default function WorkspaceSettingsPage() {
    return (
        <div className={styles.page}>
            <Text variant="title-lg" weight={700}>Impostazioni</Text>
            <Text variant="body-md" colorVariant="muted" style={{ marginTop: 8 }}>
                Le impostazioni del workspace saranno disponibili a breve.
            </Text>
        </div>
    );
}
