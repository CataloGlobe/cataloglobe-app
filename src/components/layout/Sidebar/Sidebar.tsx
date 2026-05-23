import { Fragment } from "react";
import { NavLink, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    LayoutDashboard,
    Store,
    Settings,
    X,
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
    CreditCard,
    Languages,
    PanelLeftClose,
    PanelLeftOpen
} from "lucide-react";
import styles from "./Sidebar.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { useTenant } from "@/context/useTenant";

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
                { to: `${b}/styles`, label: "Stili", icon: <Palette size={18} /> },
                { to: `${b}/languages`, label: "Lingue", icon: <Languages size={18} /> }
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
                { to: `${b}/team`, label: "Team", icon: <Users size={18} /> },
                { to: `${b}/subscription`, label: "Abbonamento", icon: <CreditCard size={18} /> },
                { to: `${b}/settings`, label: "Impostazioni", icon: <Settings size={18} />, end: true }
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
    const { userRole } = useTenant();
    const allGroups = buildGroups(businessId, catalogLabel);
    const groups = allGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            if (item.to.endsWith("/subscription") && userRole === "member") return false;
            return true;
        })
    }));

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
                                <div
                                    className={styles.group}
                                    role="group"
                                    aria-label={group.title ?? undefined}
                                >
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

                                                    <span className={styles.label}>{link.label}</span>
                                                </NavLink>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
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
                            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>
                    </div>
                )}
            </motion.aside>
        </>
    );
}
