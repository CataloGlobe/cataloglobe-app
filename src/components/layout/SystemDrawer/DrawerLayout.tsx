import { ReactNode } from "react";
import styles from "./DrawerLayout.module.scss";

export interface DrawerLayoutProps {
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}

export const DrawerLayout = ({ header, footer, children }: DrawerLayoutProps) => {
    return (
        <div className={styles.container}>
            {header && <div className={styles.header}>{header}</div>}
            <div className={styles.body}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
};
