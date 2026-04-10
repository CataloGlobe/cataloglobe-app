import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, CreditCard, Settings, ChevronLeft, X, UserCircle } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { useAuth } from "@/context/useAuth";
import { getProfile } from "@/services/supabase/profile";
import { supabase } from "@/services/supabase/client";
import type { Profile } from "@/types/database";
import logoPng from "@/assets/logo-V2.png";
import { NotificationBell } from "@/components/Notifications/NotificationBell";
import { NotificationsDrawer } from "@/components/Notifications/NotificationsDrawer";
import styles from "./WorkspaceSidebar.module.scss";

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

const GROUPS: NavGroup[] = [
    {
        title: null,
        items: [
            { to: "/workspace", label: "Attività", icon: <Building2 size={18} />, end: true }
        ]
    },
    {
        title: "Account",
        icon: <UserCircle size={12} />,
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

function UserBar({ collapsed }: { collapsed: boolean }) {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [avatarError, setAvatarError] = useState(false);

    const fetchProfile = useCallback(() => {
        if (!user?.id) return;
        getProfile(user.id)
            .then(data => {
                console.log("[UserBar] profile loaded, avatar_url:", data?.avatar_url);
                setProfile(data);
                setAvatarError(false);
            })
            .catch(err => {
                console.error("[UserBar] getProfile failed:", err);
            });
    }, [user?.id]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        window.addEventListener("profile:updated", fetchProfile);
        return () => window.removeEventListener("profile:updated", fetchProfile);
    }, [fetchProfile]);

    // Mirror settings page displayName logic exactly
    const name = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(" ");
        const metaParts = [
            user?.user_metadata?.first_name,
            user?.user_metadata?.last_name
        ].filter(Boolean);
        if (metaParts.length > 0) return metaParts.join(" ");
        return user?.email || "Utente";
    }, [profile?.first_name, profile?.last_name, user?.user_metadata, user?.email]);

    const initials = useMemo(() => {
        const f = profile?.first_name?.[0] ?? "";
        const l = profile?.last_name?.[0] ?? "";
        if (f || l) return (f + l).toUpperCase();
        return user?.email?.[0]?.toUpperCase() ?? "?";
    }, [profile?.first_name, profile?.last_name, user?.email]);

    // Mirror settings page avatarUrl useMemo exactly (con cache buster su updated_at)
    const avatarUrl = useMemo(() => {
        if (profile?.avatar_url) {
            const baseUrl = supabase.storage
                .from("avatars")
                .getPublicUrl(profile.avatar_url).data.publicUrl;
            const cacheBuster = profile.updated_at
                ? `?t=${encodeURIComponent(profile.updated_at)}`
                : "";
            const url = `${baseUrl}${cacheBuster}`;
            console.log("[UserBar] avatarUrl resolved:", url);
            return url;
        }
        return null;
    }, [profile?.avatar_url, profile?.updated_at]);

    const showInitials = !avatarUrl || avatarError;

    const avatar = (
        <span className={[styles.userAvatar, !showInitials ? styles.userAvatarHasImage : ""].join(" ")}>
            {!showInitials ? (
                <img
                    src={avatarUrl!}
                    alt=""
                    className={styles.userAvatarImg}
                    onError={() => {
                        console.error("[UserBar] img failed to load:", avatarUrl);
                        setAvatarError(true);
                    }}
                />
            ) : (
                <span className={styles.userInitial}>{initials}</span>
            )}
        </span>
    );

    const trigger = (
        <div className={[styles.userTrigger, collapsed ? styles.userTriggerCollapsed : ""].join(" ")}>
            {avatar}
            {!collapsed && <span className={styles.userName}>{name}</span>}
        </div>
    );

    return (
        <div className={styles.userBar}>
            {collapsed ? <Tooltip content={name} side="right">{trigger}</Tooltip> : trigger}
        </div>
    );
}

export default function WorkspaceSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse
}: WorkspaceSidebarProps) {
    const [notifOpen, setNotifOpen] = useState(false);

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
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: collapsed ? "center" : "flex-start"
                        }}
                    >
                        {collapsed ? (
                            <img
                                src={logoPng}
                                alt="Logo"
                                style={{ width: "32px", height: "32px", objectFit: "contain" }}
                            />
                        ) : (
                            <Text
                                variant="title-md"
                                as="a"
                                href="/"
                                colorVariant="primary"
                                style={{ textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                                CataloGlobe
                            </Text>
                        )}
                    </div>
                )}

                {/* ===== Scroll area ===== */}
                <div className={styles.sidebarScroll}>
                    <nav className={styles.nav}>
                        {GROUPS.map((group, i) => (
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

                {/* ===== Notification bell ===== */}
                <div className={styles.bellSection}>
                    <NotificationBell
                        collapsed={collapsed}
                        onClick={() => setNotifOpen(true)}
                    />
                </div>

                {/* ===== User bar + collapse toggle ===== */}
                <div className={styles.sidebarFooter}>
                    <UserBar collapsed={collapsed} />
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

            <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
        </>
    );
}
