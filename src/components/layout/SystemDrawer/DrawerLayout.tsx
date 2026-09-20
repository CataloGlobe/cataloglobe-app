import { ReactNode } from "react";
import { X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import styles from "./DrawerLayout.module.scss";

export interface DrawerLayoutProps {
    /**
     * Header libero (markup del consumer). In alternativa `title` (+ `onClose`)
     * rende l'header canonico: titolo `title-sm` e chiudi `IconButton ghost`.
     */
    header?: ReactNode;
    /** Titolo dell'header canonico. Ignorato se `header` è passato. */
    title?: string;
    /** Con `title`: rende il bottone «Chiudi» a destra. */
    onClose?: () => void;
    /** Id del titolo canonico, da passare ad `aria-labelledby` del drawer. */
    titleId?: string;
    footer?: ReactNode;
    children: ReactNode;
    /**
     * Layout del body. Default `"block"` (comportamento storico: il body è un
     * flex-item scrollabile ma NON un flex-container). Passare `"flex"` quando
     * il contenuto deve propagare l'altezza bounded del body ai figli (es. un
     * DataTable con auto-size): il body diventa `display:flex; flex-direction:
     * column`. Opt-in per non alterare gli altri drawer.
     */
    bodyLayout?: "block" | "flex";
    /**
     * Opt-in: azzera il `padding-bottom` dell'header così che dei `<Tabs>` come
     * ultimo elemento dell'header appoggino l'indicatore esattamente sul divider
     * (border-bottom dell'header), senza gap. Default `false` → header invariato,
     * nessuna regressione sugli altri drawer. Usare SOLO quando l'header termina
     * con un gruppo Tabs.
     */
    headerFlush?: boolean;
}

export const DrawerLayout = ({
    header,
    title,
    onClose,
    titleId,
    footer,
    children,
    bodyLayout = "block",
    headerFlush = false
}: DrawerLayoutProps) => {
    const headerContent =
        header ??
        (title ? (
            <div className={styles.headerRow}>
                <Text as="h2" id={titleId} variant="title-sm" weight={600} className={styles.title}>
                    {title}
                </Text>
                {onClose && (
                    <IconButton icon={<X size={18} />} aria-label="Chiudi" variant="ghost" size="sm" onClick={onClose} />
                )}
            </div>
        ) : null);

    return (
        <div className={styles.container}>
            {headerContent && (
                <div className={styles.header} data-header-flush={headerFlush || undefined}>
                    {headerContent}
                </div>
            )}
            <div className={styles.body} data-body-layout={bodyLayout}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
};
