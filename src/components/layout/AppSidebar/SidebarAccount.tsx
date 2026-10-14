import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    Building2,
    Check,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    LayoutGrid,
    LifeBuoy,
    LogOut,
    Plus,
    Search,
    Shield,
    User
} from "lucide-react";
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
import { LOOK_D } from "@styles/lookD";
import type { AppSidebarNavItem } from "./AppSidebar";
import styles from "./SidebarAccount.module.scss";

/**
 * Il pulsante dell'account in fondo alla sidebar (Officina, come in Claude):
 * chi sei, l'azienda col suo piano, e un pallino quando c'è qualcosa da vedere
 * (il numero sta sulle voci del menù). Evidenziato quando la pagina aperta è
 * una delle sue voci.
 * Il menù tiene le pagine dell'azienda che non sono lavoro di tutti i giorni
 * (Impostazioni, Team, Abbonamento, Lingue, Assistenza) e poi l'account.
 * Con più aziende il menù le elenca e si cambia azienda da qui (Alex
 * 2026-10-09: niente più selettore in cima alla sidebar); con tante, le
 * prime e «Tutte le aziende».
 * Le voci arrivano già filtrate per permessi e coi segnali
 * (`ACCOUNT_ENTRIES` → `buildSidebarGroups`). Il profilo arriva da
 * `MainLayout`: il pulsante si rimonta passando fra la sidebar della sede e
 * quella dell'azienda, e chiedendolo qui si ricaricherebbe a ogni cambio.
 */

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

/** Oltre queste, il resto delle aziende sta nella pagina delle aziende. */
const TENANTS_IN_MENU = 5;

/** Direzione D: con più aziende di queste, in «Cambia azienda» c'è la ricerca. */
const TENANTS_BEFORE_SEARCH = 5;

/** Direzione D: nel menù «Impostazioni» si chiama «Azienda» (decisione di Alex, 2026-10-14). */
const D_LABEL: Record<string, string> = { settings: "Azienda" };

/** Le iniziali di un nome per il quadratino dell'azienda («San Pietro» → «SP»). */
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

/** Lo spazio dell'icona, per allineare le aziende non scelte a quella col segno. */
function NoIcon() {
    return null;
}

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
    const { tenants, selectedTenant, selectedTenantId, selectTenant } = useTenant();
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
    // Con più aziende la seconda riga dice in quale sei: la cima della sidebar non lo dice più.
    const subtitle =
        tenants.length > 1 && selectedTenant
            ? [selectedTenant.name, plan].filter(Boolean).join(" · ")
            : [plan, sedi].filter(Boolean).join(" · ") || selectedTenant?.name || "";
    // Direzione D: sotto il nome, l'azienda e il ruolo (artifact v28).
    const dSubtitle = [selectedTenant?.name, role].filter(Boolean).join(" · ");
    // L'azienda aperta sempre nell'elenco, anche oltre le prime.
    const shownTenants = tenants.slice(0, TENANTS_IN_MENU);
    if (selectedTenant && !shownTenants.some(t => t.id === selectedTenantId)) {
        shownTenants[shownTenants.length - 1] = selectedTenant;
    }

    const chooseTenant = (id: string) => {
        if (id === selectedTenantId) return;
        selectTenant(id);
        // Si entra dall'indice dell'azienda (D1): sede o Panoramica.
        go(`/business/${id}`);
    };
    // Direzione D: il menù ha due viste, l'account e «Cambia azienda».
    const [view, setView] = useState<"main" | "tenants">("main");
    const [query, setQuery] = useState("");
    const pending = pendingCount(items);
    const pendingLabel = pending > 0 ? `, ${pending} ${pending === 1 ? "cosa" : "cose"} da vedere` : "";

    // Nella D al telefono l'account è solo l'avatar, in alto a destra.
    const dPhone = LOOK_D && isMobile;
    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            data-collapsed={collapsed || undefined}
            data-phone={dPhone || undefined}
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
                {(LOOK_D ? dSubtitle : subtitle) && (
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.plan}>
                        {LOOK_D ? dSubtitle : subtitle}
                    </Text>
                )}
            </span>
            <ChevronsUpDown size={16} className={styles.chevron} aria-hidden="true" />
        </button>
    );

    // ===== Direzione D (artifact v28, `#amenu`) =====
    // Sotto il nome: l'azienda e il ruolo. Nel menù: chi sei col ruolo, la
    // card dell'azienda con «Cambia», le pagine dell'azienda filtrate per
    // permessi, poi «Tu» (account, Assistenza), poi Esci.
    const companyItems = items.filter(item => item.id !== "support");
    const support = items.find(item => item.id === "support");
    const tenantPlan = (plan?: string | null) => (plan ? (PLAN_LABEL[plan] ?? plan) : null);
    const companyLine = [sedi ?? (readableActivities.length === 1 ? "1 sede" : null), tenantPlan(selectedTenant?.plan)]
        .filter(Boolean)
        .join(" · ");
    // Cambiando vista il fuoco va al campo di ricerca o alla prima voce, non si perde.
    const focusFirstItem = (from: Element | null, skipField = false) => {
        const menu = from?.closest('[role="menu"]');
        const field = skipField ? null : menu?.querySelector<HTMLElement>("input");
        (field ?? menu?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])'))?.focus();
    };
    const stayOpen = (next: "main" | "tenants") => (event: Event) => {
        event.preventDefault();
        setQuery("");
        setView(next);
        requestAnimationFrame(() => focusFirstItem(document.querySelector(`.${styles.menuD}`)));
    };
    const signal = (item: AppSidebarNavItem) =>
        typeof item.badge === "number" ? (
            <span className={styles.count}>{item.badge > 99 ? "99+" : item.badge}</span>
        ) : item.showDot ? (
            <span className={styles.dot} role="img" aria-label={item.dotLabel} />
        ) : undefined;
    const dItem = (item: AppSidebarNavItem) => (
        <Menu.Item
            key={item.to}
            leading={item.icon}
            onSelect={() => go(item.to)}
            trailing={signal(item)}
            className={`${styles.row} ${isHere([item], pathname) ? styles.rowHere : ""}`}
        >
            {D_LABEL[item.id ?? ""] ?? item.label}
        </Menu.Item>
    );

    const dMain = (
        <div className={styles.view} data-view="main">
            <Menu.Label className={styles.dWho}>
                <span className={styles.dAvatar} aria-hidden="true">
                    <Avatar name={name} imageUrl={avatarUrl} size="md" rounded />
                </span>
                <span className={styles.dWhoText}>
                    <b title={name}>{name}</b>
                    {fullName && <small title={email}>{email}</small>}
                </span>
                {role && <span className={styles.dRole}>{role}</span>}
            </Menu.Label>
            {selectedTenant && (
                <Menu.Item
                    onSelect={stayOpen("tenants")}
                    className={styles.dCompany}
                    leading={
                        <span className={styles.dSquare} aria-hidden="true">
                            {initials(selectedTenant.name)}
                        </span>
                    }
                    description={companyLine || undefined}
                    trailing={
                        <span className={styles.dGo}>
                            Cambia
                            <ChevronRight size={14} aria-hidden="true" />
                        </span>
                    }
                >
                    {selectedTenant.name}
                </Menu.Item>
            )}
            {companyItems.map(dItem)}
            <Menu.Separator />
            <Menu.Label className={styles.dSection}>Tu</Menu.Label>
            <Menu.Item icon={User} onSelect={() => go("/workspace/account")} className={styles.row}>
                Il tuo account
            </Menu.Item>
            {support && (
                <Menu.Item
                    leading={support.icon ?? <LifeBuoy />}
                    onSelect={() => go(support.to)}
                    trailing={signal(support)}
                    className={`${styles.row} ${isHere([support], pathname) ? styles.rowHere : ""}`}
                >
                    {support.label}
                </Menu.Item>
            )}
            {showAdminEntry && (
                <Menu.Item
                    icon={Shield}
                    onSelect={() => go("/admin")}
                    trailing={<span className={styles.dOnly}>Solo CataloGlobe</span>}
                    className={styles.row}
                >
                    Area admin
                </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item icon={LogOut} onSelect={() => void signOut()} className={`${styles.row} ${styles.dExit}`}>
                Esci
            </Menu.Item>
        </div>
    );

    const q = query.trim().toLowerCase();
    const foundTenants = tenants.filter(t => t.name.toLowerCase().includes(q));
    const dTenants = (
        <div className={styles.view} data-view="tenants">
            <Menu.Item
                onSelect={stayOpen("main")}
                className={styles.dBack}
                leading={<ChevronLeft size={16} aria-hidden="true" />}
            >
                Cambia azienda
            </Menu.Item>
            {tenants.length > TENANTS_BEFORE_SEARCH && (
                <label className={styles.dSearch}>
                    <Search size={15} aria-hidden="true" />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        // Le lettere vanno al campo, non alla ricerca per iniziale del menù.
                        // Frecce e Tab restano al menù: dal campo si scende alle aziende.
                        onKeyDown={event => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                focusFirstItem(event.currentTarget, true);
                                return;
                            }
                            if (!["Escape", "ArrowUp", "Tab"].includes(event.key)) event.stopPropagation();
                        }}
                        placeholder="Cerca un'azienda…"
                        aria-label="Cerca un'azienda"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </label>
            )}
            {foundTenants.map(t => (
                <Menu.Item
                    key={t.id}
                    onSelect={() => chooseTenant(t.id)}
                    className={`${styles.row} ${t.id === selectedTenantId ? styles.rowHere : ""}`}
                    leading={
                        <span className={`${styles.dSquare} ${styles.dSquareXs}`} aria-hidden="true">
                            {initials(t.name)}
                        </span>
                    }
                    trailing={tenantPlan(t.plan) ? <small className={styles.dSmall}>{tenantPlan(t.plan)}</small> : undefined}
                >
                    {t.name}
                </Menu.Item>
            ))}
            <p className={styles.dNone} role="status">
                {foundTenants.length === 0 ? "Nessuna azienda con questo nome" : ""}
            </p>
            <Menu.Separator />
            <Menu.Item icon={LayoutGrid} onSelect={() => go("/workspace")} className={styles.row}>
                Le tue aziende
            </Menu.Item>
            {/* Si crea dalla pagina delle aziende, come oggi. */}
            <Menu.Item icon={Plus} onSelect={() => go("/workspace")} className={styles.row}>
                Crea azienda
            </Menu.Item>
        </div>
    );

    const menu = LOOK_D ? (
        <Menu
            trigger={trigger}
            side={dPhone ? "bottom" : collapsed ? "right" : "top"}
            align={dPhone || collapsed ? "end" : "start"}
            contentClassName={`${styles.menu} ${styles.menuD}`}
            phoneSheet={false}
            onOpenChange={open => {
                if (!open) return;
                setView("main");
                setQuery("");
            }}
        >
            {view === "main" ? dMain : dTenants}
        </Menu>
    ) : (
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
            {tenants.length > 1 && (
                <>
                    <Menu.Separator />
                    <Menu.Label>
                        <Text as="span" variant="caption-xs" weight={600} colorVariant="muted">
                            Cambia azienda
                        </Text>
                    </Menu.Label>
                    {shownTenants.map(t => (
                        <Menu.Item
                            key={t.id}
                            icon={t.id === selectedTenantId ? Check : NoIcon}
                            onSelect={() => chooseTenant(t.id)}
                        >
                            {t.name}
                        </Menu.Item>
                    ))}
                    {tenants.length > TENANTS_IN_MENU && (
                        <Menu.Item icon={Building2} onSelect={() => go("/workspace")}>
                            Tutte le aziende
                        </Menu.Item>
                    )}
                    <Menu.Separator />
                </>
            )}
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
