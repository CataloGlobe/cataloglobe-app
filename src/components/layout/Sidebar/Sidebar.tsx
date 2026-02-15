import { NavLink } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { motion } from "framer-motion";
import {
    LayoutDashboard,
    Store,
    Settings,
    ChevronLeft,
    X,
    Globe,
    Calendar,
    BookOpen,
    Layers,
    Palette,
    BarChart3,
    MessageSquare,
    Briefcase,
    FolderOpen,
    TrendingUp,
    Cpu,
    Archive
} from "lucide-react";
import logoPng from "@/assets/logo.png";
import styles from "./Sidebar.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useProfile } from "@/utils/useProfile";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 90;

const groups = [
    {
        title: null,
        items: [{ to: "/dashboard", label: "Panoramica", icon: <LayoutDashboard size={18} /> }]
    },
    {
        title: "Operatività",
        icon: <Briefcase size={12} />,
        items: [
            { to: "/dashboard/attivita", label: "Attività", icon: <Store size={18} /> },
            {
                to: "/dashboard/programmazione",
                label: "Programmazione",
                icon: <Calendar size={18} />
            }
        ]
    },
    {
        title: "Contenuti",
        icon: <FolderOpen size={12} />,
        items: [
            { to: "/dashboard/cataloghi", label: "Cataloghi", icon: <BookOpen size={18} /> },
            { to: "/dashboard/prodotti", label: "Prodotti", icon: <Archive size={18} /> },
            {
                to: "/dashboard/contenuti-in-evidenza",
                label: "Contenuti in evidenza",
                icon: <Layers size={18} />
            },
            { to: "/dashboard/stili", label: "Stili & design", icon: <Palette size={18} /> }
        ]
    },
    {
        title: "Insight",
        icon: <TrendingUp size={12} />,
        items: [
            { to: "/dashboard/analitiche", label: "Analitiche", icon: <BarChart3 size={18} /> },
            { to: "/dashboard/recensioni", label: "Recensioni", icon: <MessageSquare size={18} /> }
        ]
    },
    {
        title: "Sistema",
        icon: <Cpu size={12} />,
        items: [
            { to: "/dashboard/impostazioni", label: "Impostazioni", icon: <Settings size={18} /> }
        ]
    }
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
                data-collapsed={collapsed}
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

                {/* ===== Logo ===== */}
                {!isMobile && (
                    <div
                        style={{
                            padding: collapsed ? "20px 0" : "24px 22px 12px",
                            display: "flex",
                            justifyContent: collapsed ? "center" : "flex-start",
                            alignItems: "center"
                        }}
                    >
                        {collapsed ? (
                            <img
                                src={logoPng}
                                alt="Logo"
                                style={{
                                    width: "32px",
                                    height: "32px",
                                    objectFit: "contain"
                                }}
                            />
                        ) : (
                            <Text
                                variant="title-md"
                                as="a"
                                href={"/"}
                                colorVariant="primary"
                                style={{
                                    textDecoration: "none",
                                    whiteSpace: "nowrap"
                                }}
                            >
                                Cataloglobe
                            </Text>
                        )}
                    </div>
                )}

                {/* ===== Scroll area ===== */}
                <div className={styles.sidebarScroll}>
                    <nav className={styles.nav}>
                        {groups.map((group, i) => (
                            <div key={i} className={styles.groupCard}>
                                {group.title && (
                                    <div className={styles.groupTitle}>
                                        {collapsed && group.icon ? group.icon : group.title}
                                    </div>
                                )}
                                <ul className={styles.list}>
                                    {group.items.map(link => (
                                        <li key={link.to}>
                                            <NavLink
                                                to={link.to}
                                                end={link.to === "/dashboard"}
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
                                                    <Tooltip content={link.label}>
                                                        <span className={styles.icon}>
                                                            {link.icon}
                                                        </span>
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
                            </div>
                        ))}
                    </nav>
                </div>

                <div className={styles.divider} />

                {/* ===== Header utente + toggle ===== */}
                {/* ===== Header utente + toggle ===== */}
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

                    {!isMobile && (
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
                    )}
                </div>
            </motion.aside>
        </>
    );
}
