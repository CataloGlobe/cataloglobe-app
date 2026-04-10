import { NavLink, useParams } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { motion } from "framer-motion";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
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
    Users,
    Briefcase,
    FolderOpen,
    TrendingUp,
    Cpu,
    Archive,
    Tags
} from "lucide-react";
import logoPng from "@/assets/logo-V2.png";
import styles from "./Sidebar.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import BusinessSwitcher from "@/components/Businesses/BusinessSwitcher/BusinessSwitcher";

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 90;

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
}

interface NavGroup {
    title: string | null;
    icon?: React.ReactNode;
    items: NavItem[];
}

function buildGroups(businessId: string, catalogLabel: string): NavGroup[] {
    const b = `/business/${businessId}`;
    return [
        {
            title: null,
            items: [
                {
                    to: `${b}/overview`,
                    label: "Panoramica",
                    icon: <LayoutDashboard size={18} />,
                    end: true
                }
            ]
        },
        {
            title: "Operatività",
            icon: <Briefcase size={12} />,
            items: [
                { to: `${b}/locations`, label: "Sedi", icon: <Store size={18} /> },
                { to: `${b}/scheduling`, label: "Programmazione", icon: <Calendar size={18} /> }
            ]
        },
        {
            title: "Contenuti",
            icon: <FolderOpen size={12} />,
            items: [
                { to: `${b}/catalogs`, label: catalogLabel, icon: <BookOpen size={18} /> },
                { to: `${b}/products`, label: "Prodotti", icon: <Archive size={18} /> },
                {
                    to: `${b}/featured`,
                    label: "Contenuti in evidenza",
                    icon: <Layers size={18} />
                },
                { to: `${b}/styles`, label: "Stili", icon: <Palette size={18} /> }
            ]
        },
        {
            title: "Insight",
            icon: <TrendingUp size={12} />,
            items: [
                { to: `${b}/analytics`, label: "Analitiche", icon: <BarChart3 size={18} /> },
                { to: `${b}/reviews`, label: "Recensioni", icon: <MessageSquare size={18} /> }
            ]
        },
        {
            title: "Sistema",
            icon: <Cpu size={12} />,
            items: [
                // { to: `${b}/attributes`, label: "Attributi prodotto", icon: <Tags size={18} /> },
                { to: `${b}/team`, label: "Team", icon: <Users size={18} /> },
                { to: `${b}/settings`, label: "Impostazioni", icon: <Settings size={18} /> }
            ]
        }
    ];
}

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
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { catalogLabel } = useVerticalConfig();
    const groups = buildGroups(businessId, catalogLabel);
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
                                CataloGlobe
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
                                                    <Tooltip content={link.label} side="right">
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

                {/* ===== Business switcher + collapse toggle ===== */}
                <div className={styles.sidebarHeader}>
                    <BusinessSwitcher collapsed={collapsed} />

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
