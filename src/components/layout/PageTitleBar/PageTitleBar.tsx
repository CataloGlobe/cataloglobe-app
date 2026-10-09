import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { NavbarBreadcrumb } from "@components/layout/AppHeader/NavbarBreadcrumb";
import Text from "@/components/ui/Text/Text";
import type { AppSidebarNavGroup } from "@/components/layout/AppSidebar/AppSidebar";
import { currentItem, isItemRoot } from "@/components/layout/AppSidebar/isItemActive";
import { useReadPageHeader } from "@/context/useReadPageHeader";
import { SediInAlto } from "./SediInAlto";
import styles from "./PageTitleBar.module.scss";

interface PageTitleBarProps {
    /** A destra: consumo AI e notifiche (solo desktop). */
    actions?: ReactNode;
    /** Le sezioni della sidebar: sulla pagina di una parte, le sorelle come tab. */
    groups?: AppSidebarNavGroup[];
}

/**
 * Barra bianca in cima a ogni pagina (Officina, Alex): sulla pagina di una
 * parte il nome della sezione e le sue parti come tab (artifact v4, Alex
 * 2026-10-09: «tab nella pagina e parti nella sidebar»); dentro un dettaglio
 * il percorso («Prodotti / Margherita»). Le notifiche in alto a destra
 * (Lorenzo). Ricerca e azioni della pagina restano nella banda sotto
 * (`PageHeaderSlot`); accanto al titolo solo un commutatore di vista della
 * pagina, se lo dichiara (`titleSide`).
 */
export function PageTitleBar({ actions, groups = [] }: PageTitleBarProps) {
    const { pathname, search } = useLocation();
    const side = useReadPageHeader()?.titleSide;

    // La parte aperta, anche dentro un suo dettaglio: le sedi in alto la seguono.
    let open: { groupKey?: string; entryKey?: string } = {};
    for (const group of groups) {
        const current = currentItem(group.items, pathname, search);
        if (current) {
            open = { groupKey: group.key, entryKey: current.id };
            break;
        }
    }

    let section: { group: AppSidebarNavGroup; current: AppSidebarNavGroup["items"][number] } | null = null;
    for (const group of groups) {
        if (group.items.length < 2) continue;
        const current = currentItem(group.items, pathname, search);
        if (current && isItemRoot(current, pathname)) {
            section = { group, current };
            break;
        }
    }

    return (
        <div className={styles.bar}>
            <div className={styles.path}>
                {section ? (
                    <div className={styles.section}>
                        <Text as="span" variant="body" weight={600} className={styles.sectionTitle}>
                            {section.group.title}
                        </Text>
                        <nav className={styles.tabs} aria-label={`Parti di ${section.group.title}`}>
                            {section.group.items.map(item => {
                                const selected = item === section.current;
                                const signal = item.stateTone === "attention" || item.showDot || item.loading || item.badge !== undefined;
                                return item.disabled ? null : (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`${styles.tab} ${selected ? styles.tabSelected : ""}`}
                                        aria-current={selected ? "page" : undefined}
                                    >
                                        {signal && <span className={styles.tabDot} aria-hidden="true" />}
                                        {item.label}
                                        {item.state && <span className={styles.tabState}>{item.state}</span>}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                ) : (
                    <NavbarBreadcrumb inBar />
                )}
                {side && <div className={styles.side}>{side}</div>}
            </div>
            {/* Al telefono le notifiche stanno nella testata: qui restano le sedi. */}
            <div className={styles.actions}>
                <SediInAlto {...open} />
                {actions}
            </div>
        </div>
    );
}
