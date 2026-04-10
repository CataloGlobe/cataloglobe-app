import { MapPin, Archive, BookOpen, LayoutDashboard, Settings, LogOut } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import type { V2Tenant } from "@/types/tenant";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { SUBTYPE_LABELS, VERTICAL_LABELS } from "@/constants/verticalTypes";
import styles from "./BusinessCard.module.scss";

// 6-color palette cycling by first char code — gives each business a distinct tint
const AVATAR_PALETTE = [
    { bg: "#ede9fe", text: "#7c3aed" }, // indigo
    { bg: "#dbeafe", text: "#1d4ed8" }, // blue
    { bg: "#d1fae5", text: "#065f46" }, // emerald
    { bg: "#fef3c7", text: "#b45309" }, // amber
    { bg: "#fce7f3", text: "#be185d" }, // pink
    { bg: "#e0f2fe", text: "#0369a1" }, // sky
];

function avatarColors(name: string) {
    return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

function roleLabel(role: string | null | undefined): string {
    if (role === "owner") return "Owner";
    if (role === "admin") return "Admin";
    if (role === "member") return "Member";
    return role ?? "Unknown";
}

interface BusinessCardProps {
    tenant: V2Tenant;
    locationCount: number;
    productCount: number;
    catalogCount: number;
    onSelect: (id: string) => void;
    onOpenSettings: (id: string) => void;
    onLeave: (id: string) => void;
}

export default function BusinessCard({ tenant, locationCount, productCount, catalogCount, onSelect, onOpenSettings, onLeave }: BusinessCardProps) {
    const initial = tenant.name.charAt(0).toUpperCase();
    const verticalLabel = (tenant.business_subtype && SUBTYPE_LABELS[tenant.business_subtype])
        ?? VERTICAL_LABELS[tenant.vertical_type]
        ?? tenant.vertical_type;
    const { bg, text } = avatarColors(tenant.name);
    const isOwner = tenant.user_role === "owner";

    return (
        <div
            className={styles.card}
            onClick={() => onSelect(tenant.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(tenant.id); }}
        >
            <div className={styles.header}>
                {tenant.logo_url ? (
                    <img
                        src={getTenantLogoPublicUrl(tenant.logo_url)}
                        alt={`Logo ${tenant.name}`}
                        className={styles.avatarImg}
                    />
                ) : (
                    <div className={styles.avatar} style={{ background: bg, color: text }}>
                        {initial}
                    </div>
                )}
                <div className={styles.meta}>
                    <div className={styles.nameRow}>
                        <span className={styles.name}>{tenant.name}</span>
                        <div className={styles.actions} onClick={e => e.stopPropagation()}>
                            <TableRowActions
                                actions={[
                                    {
                                        label: "Apri dashboard",
                                        icon: LayoutDashboard,
                                        onClick: () => onSelect(tenant.id),
                                    },
                                    {
                                        label: "Impostazioni attività",
                                        icon: Settings,
                                        onClick: () => onOpenSettings(tenant.id),
                                    },
                                    {
                                        label: "Lascia attività",
                                        icon: LogOut,
                                        onClick: () => onLeave(tenant.id),
                                        variant: "destructive",
                                        separator: true,
                                        hidden: isOwner,
                                    },
                                ]}
                            />
                        </div>
                    </div>
                    <div className={styles.tagsRow}>
                        <span className={styles.typePill}>{verticalLabel}</span>
                        <span className={styles.roleText}>{roleLabel(tenant.user_role)}</span>
                    </div>
                </div>
            </div>

            <div className={styles.footer}>
                <span className={styles.stat}>
                    <span className={styles.statNum}>{locationCount}</span>
                    <span className={styles.statLabel}>{locationCount === 1 ? "sede" : "sedi"}</span>
                </span>
                <span className={styles.stat}>
                    <span className={styles.statNum}>{productCount}</span>
                    <span className={styles.statLabel}>prodotti</span>
                </span>
                <span className={styles.stat}>
                    <span className={styles.statNum}>{catalogCount}</span>
                    <span className={styles.statLabel}>cataloghi</span>
                </span>
            </div>
        </div>
    );
}
