import { ReactNode } from "react";
import styles from "./DrawerLayout.module.scss";

export interface DrawerLayoutProps {
    header?: ReactNode;
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
    footer,
    children,
    bodyLayout = "block",
    headerFlush = false
}: DrawerLayoutProps) => {
    return (
        <div className={styles.container}>
            {header && (
                <div className={styles.header} data-header-flush={headerFlush || undefined}>
                    {header}
                </div>
            )}
            <div className={styles.body} data-body-layout={bodyLayout}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
};
