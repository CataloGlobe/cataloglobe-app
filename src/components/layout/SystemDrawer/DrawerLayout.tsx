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
}

export const DrawerLayout = ({ header, footer, children, bodyLayout = "block" }: DrawerLayoutProps) => {
    return (
        <div className={styles.container}>
            {header && <div className={styles.header}>{header}</div>}
            <div className={styles.body} data-body-layout={bodyLayout}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
};
