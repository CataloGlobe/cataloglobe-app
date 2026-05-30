import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, CreditCard, Settings, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import styles from "./WorkspaceSidebar.module.scss";
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "@/constants/layout";

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
}

interface NavGroup {
    items: NavItem[];
}

const GROUPS: NavGroup[] = [
    {
        items: [
            { to: "/workspace", label: "Attività", icon: <Building2 size={18} />, end: true }
        ]
    },
    {
        items: [
            { to: "/workspace/billing", label: "Abbonamento", icon: <CreditCard size={18} /> },
            { to: "/workspace/settings", label: "Impostazioni", icon: <Settings size={18} /> }
        ]
    }
];

interface WorkspaceSidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
}

export default function WorkspaceSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse
}: WorkspaceSidebarProps) {
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
                        {GROUPS.map((group, i) => (
                            <Fragment key={i}>
                                {i > 0 && <div className={styles.groupDivider} role="separator" />}
                                <ul className={styles.list}>
                                    {group.items.map(link => (
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
                                                        sideOffset={30}
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
                                    ))}
                                </ul>
                            </Fragment>
                        ))}
                    </nav>
                </div>

                {!isMobile && (
                    <div className={styles.collapseFooter}>
                        <button
                            type="button"
                            className={styles.collapseToggle}
                            onClick={onToggleCollapse}
                            aria-label={collapsed ? "Espandi menù laterale" : "Comprimi menù laterale"}
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
