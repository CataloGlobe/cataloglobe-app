import type { ReactNode } from "react";
import { NavbarBreadcrumb } from "@components/layout/AppHeader/NavbarBreadcrumb";
import styles from "./PageTitleBar.module.scss";

interface PageTitleBarProps {
    /** A destra: consumo AI e notifiche (solo desktop). */
    actions?: ReactNode;
}

/**
 * Barra bianca in cima a ogni pagina (Officina, Alex): il percorso della
 * pagina («Prodotti / Margherita»), quello che prima chiudeva la testata a
 * cartelle. Azienda e sede stanno nella sidebar; le notifiche in alto a destra
 * (Lorenzo). Tab, ricerca e azioni della pagina restano nella banda sotto
 * (`PageHeaderSlot`).
 */
export function PageTitleBar({ actions }: PageTitleBarProps) {
    return (
        <div className={styles.bar}>
            <div className={styles.path}>
                <NavbarBreadcrumb inBar />
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
        </div>
    );
}
