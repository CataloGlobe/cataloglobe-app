import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
    LayoutDashboard,
    Store,
    Settings,
    LibraryBig,
    Star,
    ChartPie,
    ChevronLeft,
    X
} from "lucide-react";
import styles from "./Sidebar.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useProfile } from "@/utils/useProfile";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 76;

const links = [
    { to: "/dashboard", label: "Panoramica", icon: <LayoutDashboard size={18} /> },
    { to: "/dashboard/businesses", label: "Le tue Attività", icon: <Store size={18} /> },
    { to: "/dashboard/collections", label: "I tuoi Cataloghi", icon: <LibraryBig size={18} /> },
    { to: "/dashboard/reviews", label: "Recensioni", icon: <Star size={18} /> },
    { to: "/dashboard/analytics", label: "Analytics", icon: <ChartPie size={18} /> },
    { to: "/dashboard/settings", label: "Impostazioni", icon: <Settings size={18} /> }
];

interface SidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
}

export default function Sidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse
}: SidebarProps) {
    const { profile, loading } = useProfile();

    const displayName = profile?.name || "Utente";
    const avatarUrl = profile?.avatar_url || null;
    const avatarInitial = displayName.charAt(0).toUpperCase();

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
                {/* ===== Mobile header ===== */}
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

                {/* ===== Header utente + toggle ===== */}
                {!isMobile && (
                    <div className={styles.sidebarHeader}>
                        <div className={styles.userRow}>
                            <div className={styles.avatar}>
                                {loading ? (
                                    <div className={styles.avatarSkeleton} />
                                ) : avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={`Avatar di ${displayName}`}
                                        className={styles.avatarImage}
                                    />
                                ) : (
                                    <span className={styles.avatarInitial}>{avatarInitial}</span>
                                )}
                            </div>

                            <motion.div
                                className={styles.userName}
                                initial={false}
                                animate={{
                                    opacity: collapsed ? 0 : 1,
                                    x: collapsed ? -8 : 0
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            >
                                {displayName}
                            </motion.div>
                        </div>

                        <motion.button
                            className={styles.collapseToggle}
                            onClick={onToggleCollapse}
                            initial={false}
                            animate={{
                                rotate: collapsed ? 180 : 0,
                                y: "-50%"
                            }}
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 30
                            }}
                            aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
                        >
                            <ChevronLeft size={16} />
                        </motion.button>
                    </div>
                )}

                {!isMobile && <div className={styles.divider} />}

                {/* ===== Scroll area ===== */}
                <div className={styles.sidebarScroll}>
                    <nav className={styles.nav}>
                        <ul className={styles.list}>
                            {links.map(link => (
                                <li key={link.to}>
                                    <NavLink
                                        to={link.to}
                                        end={link.to === "/dashboard"}
                                        className={({ isActive }) =>
                                            [styles.link, isActive ? styles.active : ""].join(" ")
                                        }
                                        onClick={() => {
                                            if (isMobile) onRequestClose();
                                        }}
                                    >
                                        {!isMobile && collapsed ? (
                                            <Tooltip content={link.label}>
                                                <span className={styles.icon}>{link.icon}</span>
                                            </Tooltip>
                                        ) : (
                                            <span className={styles.icon}>{link.icon}</span>
                                        )}

                                        <motion.span
                                            className={styles.label}
                                            initial={false}
                                            animate={{
                                                opacity: collapsed ? 0 : 1,
                                                x: collapsed ? -8 : 0,
                                                width: collapsed ? 0 : "auto"
                                            }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 300,
                                                damping: 30
                                            }}
                                        >
                                            {link.label}
                                        </motion.span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            </motion.aside>
        </>
    );
}
