import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, ChevronsUpDown, LogOut, Shield, User } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { useTenant } from "@/context/useTenant";
import { usePermissions } from "@/context/usePermissions";
import { useSedeScope } from "@/hooks/useSedeScope";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import { Menu } from "@/components/ui/Menu";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { ROLE_LABEL } from "@/constants/roles";
import type { AppSidebarNavItem } from "./AppSidebar";
import styles from "./SidebarAccount.module.scss";

/**
 * Il pulsante dell'account in fondo alla sidebar (Officina, come in Claude):
 * chi sei, l'azienda col suo piano, e un numero quando c'è qualcosa da vedere.
 * Il menù tiene le pagine dell'azienda che non sono lavoro di tutti i giorni
 * (Impostazioni, Team, Abbonamento, Lingue, Assistenza) e poi l'account.
 * Le voci arrivano già filtrate per permessi e coi segnali
 * (`ACCOUNT_ENTRIES` → `buildSidebarGroups`).
 */

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

interface SidebarAccountProps {
    items: AppSidebarNavItem[];
    collapsed: boolean;
    isMobile: boolean;
    onRequestClose: () => void;
}

/** Quante cose aspettano: il numero delle traduzioni, più uno per ogni pallino. */
function pendingCount(items: AppSidebarNavItem[]): number {
    return items.reduce((sum, item) => {
        if (typeof item.badge === "number") return sum + item.badge;
        return item.showDot ? sum + 1 : sum;
    }, 0);
}

export function SidebarAccount({ items, collapsed, isMobile, onRequestClose }: SidebarAccountProps) {
    const navigate = useNavigate();
    const { signOut } = useAuth();
    const { selectedTenant } = useTenant();
    const { permissions } = usePermissions();
    const { readableActivities } = useSedeScope();
    const { fullName, email, avatarUrl, showAdminEntry } = useCurrentUserProfile();

    const go = (to: string) => {
        if (isMobile) onRequestClose();
        navigate(to);
    };

    const name = fullName ?? email;
    const plan = selectedTenant?.plan ? `Piano ${PLAN_LABEL[selectedTenant.plan] ?? selectedTenant.plan}` : null;
    const sedi = readableActivities.length > 1 ? `${readableActivities.length} sedi` : null;
    const subtitle = [plan, sedi].filter(Boolean).join(" · ") || selectedTenant?.name || "";
    const role = permissions ? ROLE_LABEL[permissions.role] : null;
    const pending = pendingCount(items);
    const pendingLabel = pending > 0 ? `, ${pending} ${pending === 1 ? "cosa" : "cose"} da vedere` : "";

    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            data-collapsed={collapsed || undefined}
            aria-label={`Account: ${name}${pendingLabel}`}
        >
            <span className={styles.avatar}>
                <Avatar name={name} imageUrl={avatarUrl} size="md" rounded />
                {pending > 0 && (
                    <Text as="span" variant="caption-xs" weight={600} className={styles.count} aria-hidden="true">
                        {pending > 99 ? "99+" : pending}
                    </Text>
                )}
            </span>
            <span className={styles.who}>
                <Text as="span" variant="body-sm" weight={600} className={styles.name}>
                    {name}
                </Text>
                {subtitle && (
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.plan}>
                        {subtitle}
                    </Text>
                )}
            </span>
            <ChevronsUpDown size={16} className={styles.chevron} aria-hidden="true" />
        </button>
    );

    const menu = (
        <Menu
            trigger={trigger}
            side={collapsed ? "right" : "top"}
            align={collapsed ? "end" : "start"}
            contentClassName={styles.menu}
        >
            <Menu.Label>
                <Text as="span" variant="body-sm" weight={600}>
                    {name}
                </Text>
                <Text as="span" variant="caption" colorVariant="muted">
                    {[email !== name ? email : null, role].filter(Boolean).join(" · ")}
                </Text>
            </Menu.Label>
            <Menu.Separator />
            {items.map(item => (
                <Menu.Item
                    key={item.to}
                    leading={item.icon}
                    onSelect={() => go(item.to)}
                    trailing={
                        typeof item.badge === "number" ? (
                            <Badge variant="brand">{item.badge > 99 ? "99+" : item.badge}</Badge>
                        ) : item.showDot ? (
                            <span className={styles.dot} role="img" aria-label={item.dotLabel} />
                        ) : undefined
                    }
                >
                    {item.label}
                </Menu.Item>
            ))}
            <Menu.Separator />
            <Menu.Item icon={User} onSelect={() => go("/workspace/account")}>
                Il tuo account
            </Menu.Item>
            {showAdminEntry && (
                <Menu.Item icon={Shield} onSelect={() => go("/admin")}>
                    Area admin
                </Menu.Item>
            )}
            <Menu.Item icon={ArrowLeftRight} onSelect={() => go("/workspace")}>
                Cambia azienda
            </Menu.Item>
            <Menu.Item icon={LogOut} onSelect={() => void signOut()}>
                Esci
            </Menu.Item>
        </Menu>
    );

    // Chiusa, il nome passa al tooltip come per le voci (§51.15); il
    // contenitore fa da ancora, così il pulsante resta il trigger del menù.
    return collapsed ? (
        <Tooltip content={name} side="right" sideOffset={12}>
            <span className={styles.tipAnchor}>{menu}</span>
        </Tooltip>
    ) : (
        menu
    );
}
