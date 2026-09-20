import { Fragment, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "@/constants/layout";
import styles from "./AppSidebar.module.scss";

/**
 * AppSidebar — l'unica navigazione (scheda «AppSidebar»): una sidebar sola,
 * che riceve tutto e non sa niente. I gruppi li costruiscono i tre
 * costruttori (TenantSidebar con i permessi, AdminSidebar, WorkspaceSidebar):
 * aggiungere una sezione = aggiungere una voce a `groups`.
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
    /**
     * Pallino senza numero sulla voce. Il valore arriva già calcolato dal
     * layout che costruisce i gruppi: questo guscio è renderizzato su ogni
     * pagina e non interroga il DB per conto proprio.
     */
    showDot?: boolean;
    /** Testo accessibile del pallino. Obbligatorio di fatto quando `showDot`. */
    dotLabel?: string;
    /** Contatore a destra (`Badge neutral`; `badgeTone="brand"` se sono cose da fare). */
    badge?: number | string;
    badgeTone?: "neutral" | "brand";
    /** Un lavoro in corso su questa voce: spinner 14 ambra, visibile anche collassata. */
    loading?: boolean;
    /** Testo accessibile dello spinner. */
    loadingLabel?: string;
    /** Funzione del piano Pro: lucchetto con tooltip «Pro». La voce resta navigabile. */
    locked?: boolean;
}

export interface AppSidebarNavGroup {
    /** Titolo del gruppo (`caption-xs` 600 uppercase muto). Sparisce collassata. */
    title?: string;
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

function NavItemBody({ link, collapsedDesktop }: { link: AppSidebarNavItem; collapsedDesktop: boolean }) {
    const tooltipLabel = link.locked ? `${link.label} · Pro` : link.label;
    return (
        <>
            {collapsedDesktop ? (
                <Tooltip content={tooltipLabel} side="right" sideOffset={28}>
                    <span className={styles.icon}>{link.icon}</span>
                </Tooltip>
            ) : (
                <span className={styles.icon}>{link.icon}</span>
            )}

            <span className={styles.label}>{link.label}</span>

            {link.locked && (
                <Tooltip content="Pro" side="right" sideOffset={8}>
                    <span className={styles.lock} aria-label="Funzione del piano Pro">
                        <Lock size={14} strokeWidth={1.5} />
                    </span>
                </Tooltip>
            )}

            {(link.loading || link.badge !== undefined || link.showDot) && (
                <span className={styles.trailing}>
                    {link.loading && (
                        <span
                            className={styles.spinner}
                            role="status"
                            title={link.loadingLabel}
                            aria-label={link.loadingLabel ?? "In corso"}
                        />
                    )}
                    {link.badge !== undefined && (
                        <Badge variant={link.badgeTone ?? "neutral"} className={styles.badge}>
                            {typeof link.badge === "number" && link.badge > 99 ? "99+" : link.badge}
                        </Badge>
                    )}
                    {link.showDot && (
                        <span className={styles.navDot} title={link.dotLabel} aria-label={link.dotLabel} />
                    )}
                </span>
            )}
        </>
    );
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
    const collapsedDesktop = !isMobile && collapsed;
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
                                <div className={styles.group} role="group" aria-label={group.title}>
                                    {group.title && (
                                        <Text as="span" variant="caption-xs" weight={600} className={styles.groupTitle}>
                                            {group.title}
                                        </Text>
                                    )}
                                    <ul className={styles.list}>
                                        {group.items.map(link =>
                                            link.disabled ? (
                                                <li key={link.to}>
                                                    <Tooltip
                                                        content={link.disabledHint ?? "In arrivo"}
                                                        side="right"
                                                        sideOffset={collapsedDesktop ? 28 : 12}
                                                    >
                                                        <span
                                                            className={`${styles.link} ${styles.disabled}`}
                                                            aria-disabled="true"
                                                        >
                                                            <span className={styles.icon}>{link.icon}</span>
                                                            <span className={styles.label}>{link.label}</span>
                                                        </span>
                                                    </Tooltip>
                                                </li>
                                            ) : (
                                                <li key={link.to}>
                                                    <NavLink
                                                        to={link.to}
                                                        end={link.end}
                                                        className={({ isActive }) =>
                                                            [styles.link, isActive ? styles.active : ""].join(" ")
                                                        }
                                                        onClick={() => {
                                                            if (isMobile) onRequestClose();
                                                        }}
                                                    >
                                                        <NavItemBody link={link} collapsedDesktop={collapsedDesktop} />
                                                    </NavLink>
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </div>
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
