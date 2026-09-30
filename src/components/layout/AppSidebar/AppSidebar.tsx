import { Fragment, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
 * che riceve tutto e non sa niente. I gruppi li costruiscono i costruttori
 * (TenantSidebar e SedeSidebar con i permessi, AdminSidebar,
 * WorkspaceSidebar): aggiungere una sezione = aggiungere una voce a `groups`.
 *
 * `headerSlot` è l'intestazione del contesto, sopra le voci e fuori dallo
 * scroll: dentro una sede porta «← Tutte le sedi», il nome del locale e il
 * suo stato. Resta vuoto nel contesto azienda.
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
    /** Altri percorsi che tengono la voce corrente, oltre a `to`: la «Scheda»
     *  della sede resta accesa su tutte e quattro le sue pagine. Confronto per
     *  prefisso, valutato in OR con il match di `NavLink`. */
    matchPrefixes?: string[];
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
    /** Intestazione del contesto, sopra le voci: dove sei e come si esce
     *  (la sede, con «← Tutte le sedi»). Chi lo passa rende anche la sua
     *  versione collassata — il `collapsed` lo riceve già. */
    headerSlot?: ReactNode;
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
    headerSlot,
    footerSlot
}: AppSidebarProps) {
    const collapsedDesktop = !isMobile && collapsed;
    const { pathname } = useLocation();
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

                {/* Landmark a sé: il rimando che porta fuori dal contesto è
                    navigazione, ma non è una voce del menu. */}
                {headerSlot && (
                    <nav className={styles.headerSlot} aria-label="Contesto">
                        {headerSlot}
                    </nav>
                )}

                <div className={styles.sidebarScroll}>
                    <nav className={styles.nav} aria-label="Menu principale">
                        {groups.map((group, i) => (
                            <Fragment key={i}>
                                {/* Il titolo è il separatore: il divisore resta solo per i gruppi senza titolo. */}
                                {i > 0 && !group.title && <div className={styles.groupDivider} role="separator" />}
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
                                                            [
                                                                styles.link,
                                                                isActive || link.matchPrefixes?.some(p => pathname.startsWith(p))
                                                                    ? styles.active
                                                                    : ""
                                                            ].join(" ")
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
