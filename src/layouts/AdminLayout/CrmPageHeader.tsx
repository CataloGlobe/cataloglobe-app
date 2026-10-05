import Text from "@/components/ui/Text/Text";
import { useReadPageHeader } from "@/context/useReadPageHeader";
import styles from "./CrmShell.module.scss";

/**
 * La testata delle pagine di /admin come nel canvas (versione finale del
 * 2026-10-05): sul fondo della pagina, titolo grande e sottotitolo a
 * sinistra, azioni a destra; al telefono le azioni scendono sotto. Niente
 * banda e niente barra compatta: in /admin le azioni sono poche.
 * Legge la stessa configurazione di `usePageHeader` delle altre aree.
 */
export function CrmPageHeader() {
    const config = useReadPageHeader();
    if (!config || (!config.title && !config.subtitle && !config.actions && !config.leading)) return null;
    return (
        <header className={styles.pageHeader}>
            {config.leading && <div className={styles.pageLeading}>{config.leading}</div>}
            <div className={styles.pageHeading}>
                {config.title && (
                    <Text as="h1" variant="title-md" weight={700} className={styles.pageTitle}>
                        {config.title}
                    </Text>
                )}
                {config.subtitle && (
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.pageSubtitle}>
                        {config.subtitle}
                    </Text>
                )}
            </div>
            {config.actions && <div className={styles.pageActions}>{config.actions}</div>}
        </header>
    );
}
