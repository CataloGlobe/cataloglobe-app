import { Fragment, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "@/constants/layout";
import styles from "./AppSidebar.module.scss";

/**
 * Guscio sidebar data-driven, condiviso dai layout dell'app.
 *
 * Estratto da `WorkspaceSidebar` (move puro: stesso markup, stessi nomi di
 * classe, stesso modulo SCSS). La differenza fra una sidebar e l'altra sono i
 * dati: aggiungere una sezione = aggiungere una voce a `groups`.
 *
 * Lo SCSS dello stato collassato usa selettori discendenti
 * (`.sidebar[data-collapsed="true"] .link/.label/.icon`): markup e stile
 * DEVONO restare nello stesso modulo CSS, altrimenti gli hash divergono e i
 * selettori smettono di matchare.
 */

export interface AppSidebarNavItem {
    to: string;
    label: string;
    icon: ReactNode;
    end?: boolean;
    /** Voce annunciata ma non ancora navigabile: resa attenuata e non cliccabile,
     *  con tooltip esplicativo. Non richiede una route. */
    disabled?: boolean;
    /** Testo del tooltip quando `disabled`. Default: "In arrivo". */
    disabledHint?: string;
}

export interface AppSidebarNavGroup {
    items: AppSidebarNavItem[];
}

export interface AppSidebarProps {
    groups: AppSidebarNavGroup[];
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /** Contenuto opzionale reso in fondo alla nav, sopra il footer di collapse. */
    footerSlot?: ReactNode;
}

export function AppSidebar({
    groups,
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    footerSlot
}: AppSidebarProps) {
    return (
        <>
            {isMobile && mobileOpen && (
                <button
                    className={styles.backdrop}
                    aria-label="Chiudi menu"
                    onClick={onRequestClose}
                />
            )}

            <motion.aside
                className={[styles.sidebar, isMobile ? styles.mobile : styles.desktop].join(" ")}
                data-collapsed={collapsed}
                style={{ "--sidebar-collapsed": `${SIDEBAR_COLLAPSED}px` } as React.CSSProperties}
                initial={false}
                animate={{
                    width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
                    x: isMobile && !mobileOpen ? -SIDEBAR_EXPANDED : 0
                }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                    restDelta: 0.5
                }}
                aria-hidden={isMobile && !mobileOpen}
            >
                {isMobile && (
                    <div className={styles.mobileHeader}>
                        <IconButton
                            variant="ghost"
                            icon={<X size={22} />}
                            aria-label="Chiudi menu"
                            onClick={onRequestClose}
                        />
                    </div>
                )}

                <div className={styles.sidebarScroll}>
                    <nav className={styles.nav}>
                        {groups.map((group, i) => (
                            <Fragment key={i}>
                                {i > 0 && <div className={styles.groupDivider} role="separator" />}
                                <ul className={styles.list}>
                                    {group.items.map(link =>
                                        link.disabled ? (
                                            <li key={link.to}>
                                                <Tooltip
                                                    content={link.disabledHint ?? "In arrivo"}
                                                    side="right"
                                                    sideOffset={!isMobile && collapsed ? 28 : 12}
                                                >
                                                    <span
                                                        className={`${styles.link} ${styles.disabled}`}
                                                        aria-disabled="true"
                                                    >
                                                        <span className={styles.icon}>
                                                            {link.icon}
                                                        </span>
                                                        <span className={styles.label}>
                                                            {link.label}
                                                        </span>
                                                    </span>
                                                </Tooltip>
                                            </li>
                                        ) : (
                                        <li key={link.to}>
                                            <NavLink
                                                to={link.to}
                                                end={link.end}
                                                className={({ isActive }) =>
                                                    [
                                                        styles.link,
                                                        isActive ? styles.active : ""
                                                    ].join(" ")
                                                }
                                                onClick={() => {
                                                    if (isMobile) onRequestClose();
                                                }}
                                            >
                                                {!isMobile && collapsed ? (
                                                    <Tooltip
                                                        content={link.label}
                                                        side="right"
                                                        sideOffset={28}
                                                    >
                                                        <span className={styles.icon}>
                                                            {link.icon}
                                                        </span>
                                                    </Tooltip>
                                                ) : (
                                                    <span className={styles.icon}>{link.icon}</span>
                                                )}

                                                <span className={styles.label}>{link.label}</span>
                                            </NavLink>
                                        </li>
                                        )
                                    )}
                                </ul>
                            </Fragment>
                        ))}
                        {footerSlot}
                    </nav>
                </div>

                {!isMobile && (
                    <div className={styles.collapseFooter}>
                        <button
                            type="button"
                            className={styles.collapseToggle}
                            onClick={onToggleCollapse}
                            aria-label={
                                collapsed ? "Espandi menù laterale" : "Comprimi menù laterale"
                            }
                            title={collapsed ? "Espandi" : "Comprimi"}
                        >
                            <span
                                className={`${styles.toggleIcon} ${styles.toggleIconExpanded}`}
                                aria-hidden="true"
                            >
                                <PanelLeftClose size={18} />
                            </span>
                            <span
                                className={`${styles.toggleIcon} ${styles.toggleIconCollapsed}`}
                                aria-hidden="true"
                            >
                                <PanelLeftOpen size={18} />
                            </span>
                        </button>
                    </div>
                )}
            </motion.aside>
        </>
    );
}
