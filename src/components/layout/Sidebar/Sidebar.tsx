import { Fragment } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    LayoutDashboard,
    Store,
    ClipboardList,
    CalendarCheck,
    Settings,
    Calendar,
    BookOpen,
    BookOpenText,
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
    Lock,
    PanelLeftClose,
    PanelLeftOpen
} from "lucide-react";
import styles from "./Sidebar.module.scss";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { usePermissions } from "@/context/PermissionsContext";
import {
    canDoOnTenant,
    canDoOnAnyActivity,
    type UserPermissions
} from "@/lib/permissions";
import { usePlanFeatures, type PlanFeature } from "@/lib/planFeatures";
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "@/constants/layout";

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
    /** Permission check. Se undefined → sempre visibile. */
    permission?: (perms: UserPermissions) => boolean;
    /**
     * Feature gate (plan-based). When set and the current plan does NOT
     * include the feature, the item remains VISIBLE and CLICKABLE with a
     * "Pro" badge — the destination page itself shows the locked state.
     * Different from `permission`, which HIDES the item.
     */
    requiresFeature?: PlanFeature;
    /**
     * Mostra il badge ambra "traduzioni in corso" con il conteggio pending
     * tenant-wide (alimentato dalla prop `translationPendingCount`). Visibile
     * solo quando il conteggio è > 0.
     */
    showTranslationBadge?: boolean;
    /**
     * Mostra il badge loader-only "import AI in corso" (stesso spinner ambra delle
     * Lingue, senza numero). Alimentato dalla prop `importInProgress`.
     */
    showImportBadge?: boolean;
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
                { to: `${b}/locations`, label: "Sedi", icon: <Store size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "activity.read") },
                { to: `${b}/orders`, label: "Ordini", icon: <ClipboardList size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "orders.read"),
                  requiresFeature: "table_ordering" },
                { to: `${b}/reservations`, label: "Prenotazioni", icon: <CalendarCheck size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "reservations.read"),
                  requiresFeature: "table_reservation" },
                { to: `${b}/scheduling`, label: "Programmazione", icon: <Calendar size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "scheduling.read") }
            ]
        },
        {
            title: "Contenuti",
            icon: <FolderOpen size={12} />,
            items: [
                { to: `${b}/catalogs`, label: catalogLabel, icon: <BookOpen size={18} />,
                  permission: perms => canDoOnTenant(perms, "catalogs.read"),
                  showImportBadge: true },
                { to: `${b}/products`, label: "Prodotti", icon: <Archive size={18} />,
                  permission: perms => canDoOnTenant(perms, "products.read") },
                {
                    to: `${b}/featured`,
                    label: "Contenuti in evidenza",
                    icon: <Layers size={18} />,
                    permission: perms => canDoOnAnyActivity(perms, "featured.read")
                },
                {
                    to: `${b}/stories`,
                    label: "Storie",
                    icon: <BookOpenText size={18} />,
                    permission: perms => canDoOnAnyActivity(perms, "stories.read")
                },
                { to: `${b}/styles`, label: "Stili", icon: <Palette size={18} />,
                  permission: perms => canDoOnTenant(perms, "styles.read") },
                { to: `${b}/languages`, label: "Lingue", icon: <Languages size={18} />,
                  permission: perms => canDoOnTenant(perms, "catalogs.read"),
                  showTranslationBadge: true }
            ]
        },
        {
            title: "Insight",
            icon: <TrendingUp size={12} />,
            items: [
                { to: `${b}/analytics`, label: "Analitiche", icon: <BarChart3 size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "analytics.read") },
                { to: `${b}/reviews`, label: "Recensioni", icon: <MessageSquare size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "reviews.read") }
            ]
        },
        {
            title: "Sistema",
            icon: <Cpu size={12} />,
            items: [
                { to: `${b}/team`, label: "Team", icon: <Users size={18} />,
                  permission: perms => canDoOnTenant(perms, "team.read") },
                { to: `${b}/subscription`, label: "Abbonamento", icon: <CreditCard size={18} />,
                  permission: perms => canDoOnTenant(perms, "billing.read") },
                {
                    to: `${b}/settings`,
                    label: "Impostazioni",
                    icon: <Settings size={18} />,
                    end: true
                }
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
    /** Pending traduzioni tenant-wide (fonte unica: MainLayout). 0 = nessun badge. */
    translationPendingCount?: number;
    /** Import AI in volo (analyzing|creating). Accende la pillola loader su Cataloghi. */
    importInProgress?: boolean;
}

export default function Sidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    translationPendingCount = 0,
    importInProgress = false
}: SidebarProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const allGroups = buildGroups(businessId, catalogLabel);
    // Filtra voci per permission: se permissions non ancora caricate, mostra
    // tutte (default ottimistico). Una volta caricate, applica gating.
    const groups = allGroups
        .map(group => ({
            ...group,
            items: group.items.filter(item => {
                if (!item.permission) return true; // sempre visibile
                if (!permissions) return true;     // loading: ottimistico
                return item.permission(permissions);
            })
        }))
        .filter(group => group.items.length > 0);

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
                                        {group.items.map(link => {
                                            const isLocked = !!link.requiresFeature && !hasFeature(link.requiresFeature);
                                            const showTranslationBadge =
                                                !!link.showTranslationBadge && translationPendingCount > 0;
                                            const showImportBadge =
                                                !!link.showImportBadge && importInProgress;
                                            return (
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
                                                            content={isLocked ? `${link.label} · Pro` : link.label}
                                                            side="right"
                                                            sideOffset={28}
                                                        >
                                                            <span className={styles.icon}>
                                                                {link.icon}
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <span className={styles.icon}>
                                                            {link.icon}
                                                        </span>
                                                    )}

                                                    <span className={styles.label}>
                                                        {link.label}
                                                    </span>

                                                    {isLocked && (
                                                        <span
                                                            className={styles.lockIndicator}
                                                            aria-label="Funzione del piano Pro"
                                                        >
                                                            <Lock size={14} strokeWidth={1.5} />
                                                        </span>
                                                    )}

                                                    {showTranslationBadge && (
                                                        <span
                                                            className={styles.translationBadge}
                                                            title={t("sidebar.translations_in_progress")}
                                                            aria-label={t("sidebar.translations_in_progress")}
                                                        >
                                                            <span
                                                                className={styles.translationBadgeSpinner}
                                                                aria-hidden="true"
                                                            />
                                                            {translationPendingCount > 99
                                                                ? "99+"
                                                                : translationPendingCount}
                                                        </span>
                                                    )}

                                                    {showImportBadge && (
                                                        <span
                                                            className={`${styles.translationBadge} ${styles.importBadgeLoaderOnly}`}
                                                            title="Importazione menù con AI in corso"
                                                            aria-label="Importazione menù con AI in corso"
                                                        >
                                                            <span
                                                                className={styles.translationBadgeSpinner}
                                                                aria-hidden="true"
                                                            />
                                                        </span>
                                                    )}
                                                </NavLink>
                                            </li>
                                            );
                                        })}
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
