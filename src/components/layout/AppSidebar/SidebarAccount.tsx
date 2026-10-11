import { useLocation, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LogOut, Shield, User } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { useTenant } from "@/context/useTenant";
import { useSedeScope } from "@/hooks/useSedeScope";
import type { CurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import { usePermissions } from "@/context/usePermissions";
import { ROLE_LABEL } from "@/constants/roles";
import { Menu } from "@/components/ui/Menu";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import type { AppSidebarNavItem } from "./AppSidebar";
import styles from "./SidebarAccount.module.scss";

/**
 * Il pulsante dell'account in fondo alla sidebar (Officina, come in Claude):
 * chi sei, l'azienda col suo piano, e un pallino quando c'è qualcosa da vedere
 * (il numero sta sulle voci del menù). Evidenziato quando la pagina aperta è
 * una delle sue voci.
 * Il menù tiene le pagine dell'azienda che non sono lavoro di tutti i giorni
 * (Impostazioni, Team, Abbonamento, Lingue, Assistenza) e poi l'account.
 * Le voci arrivano già filtrate per permessi e coi segnali
 * (`ACCOUNT_ENTRIES` → `buildSidebarGroups`). Il profilo arriva da
 * `MainLayout`: il pulsante si rimonta passando fra la sidebar della sede e
 * quella dell'azienda, e chiedendolo qui si ricaricherebbe a ogni cambio.
 */

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

interface SidebarAccountProps {
    items: AppSidebarNavItem[];
    profile: CurrentUserProfile;
    collapsed: boolean;
    isMobile: boolean;
    onRequestClose: () => void;
}

/** Quante cose aspettano: il numero delle traduzioni, più uno per ogni pallino (per chi legge lo schermo). */
function pendingCount(items: AppSidebarNavItem[]): number {
    return items.reduce((sum, item) => {
        if (typeof item.badge === "number") return sum + item.badge;
        return item.showDot ? sum + 1 : sum;
    }, 0);
}

/** La pagina aperta è una delle voci del menù (anche una sua sottopagina, come Impostazioni › Team). */
function isHere(items: AppSidebarNavItem[], pathname: string): boolean {
    return items.some(
        item =>
            pathname === item.to ||
            pathname.startsWith(`${item.to}/`) ||
            !!item.matchPrefixes?.some(p => pathname.startsWith(p))
    );
}

export function SidebarAccount({ items, profile, collapsed, isMobile, onRequestClose }: SidebarAccountProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { signOut } = useAuth();
    const { selectedTenant } = useTenant();
    const { readableActivities } = useSedeScope();
    const { fullName, email, avatarUrl, showAdminEntry } = profile;
    const { permissions } = usePermissions();

    const go = (to: string) => {
        if (isMobile) onRequestClose();
        navigate(to);
    };

    const name = fullName ?? email;
    const role = permissions ? ROLE_LABEL[permissions.role] : null;
    const who = [fullName, role].filter(Boolean).join(" · ");
    const plan = selectedTenant?.plan ? `Piano ${PLAN_LABEL[selectedTenant.plan] ?? selectedTenant.plan}` : null;
    const sedi = readableActivities.length > 1 ? `${readableActivities.length} sedi` : null;
    const subtitle = [plan, sedi].filter(Boolean).join(" · ") || selectedTenant?.name || "";
    const pending = pendingCount(items);
    const pendingLabel = pending > 0 ? `, ${pending} ${pending === 1 ? "cosa" : "cose"} da vedere` : "";

    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            data-collapsed={collapsed || undefined}
            aria-label={`Account: ${name}${pendingLabel}`}
            aria-current={isHere(items, pathname) ? "page" : undefined}
        >
            <span className={styles.avatar}>
                <Avatar name={name} imageUrl={avatarUrl} size="md" rounded />
                {pending > 0 && <span className={styles.pending} aria-hidden="true" />}
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
            density="compact"
        >
            {/* Testa piccola, come in Claude: chi sei e con che ruolo, poi l'email.
                Una riga troppo lunga si accorcia e si legge intera al passaggio. */}
            <Menu.Label>
                {who && (
                    <Text as="span" variant="caption-xs" weight={500} className={styles.headLine} title={who}>
                        {who}
                    </Text>
                )}
                <Text as="span" variant="caption-xs" colorVariant="muted" className={styles.headLine} title={email}>
                    {email}
                </Text>
            </Menu.Label>
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
            <Menu.Separator />
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
