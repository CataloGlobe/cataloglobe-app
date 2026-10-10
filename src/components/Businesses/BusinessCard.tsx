import { ArrowRight, ChevronRight, Settings, LogOut, Trash2, Pencil } from "lucide-react";
import { workspaceRoleIsOwner, workspaceRoleIsScoped } from "@/utils/workspaceRole";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import type { TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Badge, type BadgeVariant } from "@/components/ui/Badge/Badge";
import type { V2Tenant } from "@/types/tenant";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { SUBTYPE_LABELS, VERTICAL_LABELS } from "@/constants/verticalTypes";
import { ROLE_LABEL } from "@/constants/roles";
import styles from "./BusinessCard.module.scss";

/**
 * La card di un'attività nel Workspace (T17 WS1-WS2). Tre misure, scelte
 * dalla pagina in base a quante attività ci sono:
 * - `hero` (1 attività): copertina 220, logo 96, numeri in riquadri, «Entra →»
 *   primario accanto al nome, abbonamento e link in fondo;
 * - `pair` (2 attività): copertina 140, numeri in una riga di testo, «Entra»
 *   chiaro in fondo accanto all'abbonamento;
 * - `compact` (3 e più): una riga cliccabile (iniziale, nome, sedi · stato, ›).
 */
export type BusinessCardSize = "hero" | "pair" | "compact";

export interface BusinessCardStats {
    locations: number;
    catalogs: number;
    products: number;
}

const STATUS_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: "Attivo", variant: "success" },
    trialing: { label: "In prova", variant: "brand" },
    past_due: { label: "Pagamento in ritardo", variant: "warning" },
    canceled: { label: "Disdetto", variant: "neutral" },
    suspended: { label: "Sospeso", variant: "danger" }
};

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

/** «Proprietario», «Amministratore»; i ruoli limitati hanno `user_role` nullo nella vista. */
function roleLabel(role: string | null | undefined): string {
    if (role && role in ROLE_LABEL) return ROLE_LABEL[role as keyof typeof ROLE_LABEL];
    return "Accesso limitato";
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** Una tinta per attività, stabile sul nome: copertina senza foto e iniziale. */
function hueOf(name: string): number {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}

function trialDaysLeft(trialUntil: string | null): number | null {
    if (!trialUntil) return null;
    const ms = new Date(trialUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

interface BusinessCardProps {
    tenant: V2Tenant;
    size: BusinessCardSize;
    stats: BusinessCardStats;
    /** Copertina della prima sede che ne ha una (`activities.cover_image`). */
    coverUrl?: string | null;
    /** Città della prima sede. */
    city?: string | null;
    onSelect: (id: string) => void;
    onEdit: (id: string) => void;
    onOpenSettings: (id: string) => void;
    onOpenSubscription: (id: string) => void;
    onLeave: (id: string) => void;
    onActivate: (id: string) => void;
    onDelete: (id: string) => void;
}

export default function BusinessCard({
    tenant,
    size,
    stats,
    coverUrl,
    city,
    onSelect,
    onEdit,
    onOpenSettings,
    onOpenSubscription,
    onLeave,
    onActivate,
    onDelete
}: BusinessCardProps) {
    const initials = tenant.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, size === "compact" ? 1 : 2)
        .map(w => w.charAt(0).toUpperCase())
        .join("");
    const sector =
        (tenant.business_subtype && SUBTYPE_LABELS[tenant.business_subtype]) ??
        VERTICAL_LABELS[tenant.vertical_type] ??
        tenant.vertical_type;
    const isOwner = workspaceRoleIsOwner(tenant.user_role);
    const isScoped = workspaceRoleIsScoped(tenant.user_role);
    const isActivated = !!tenant.stripe_subscription_id;
    const hue = hueOf(tenant.name);

    const enter = () => (isActivated ? onSelect(tenant.id) : onActivate(tenant.id));

    const status = STATUS_LABEL[tenant.subscription_status ?? ""];
    const plan = tenant.plan ? PLAN_LABEL[tenant.plan] ?? tenant.plan : null;
    const isTrial = tenant.subscription_status === "trialing";
    const daysLeft = isTrial ? trialDaysLeft(tenant.trial_until) : null;

    // «Pro · Attivo» in un badge solo; in prova il badge dice «In prova».
    const statusBadge = !isActivated ? (
        <Badge variant="warning">Da attivare</Badge>
    ) : status ? (
        <Badge variant={status.variant}>{plan && !isTrial ? `${plan} · ${status.label}` : status.label}</Badge>
    ) : null;
    const seatsText =
        tenant.paid_seats != null
            ? `${stats.locations} di ${plural(tenant.paid_seats, "sede", "sedi")}${size === "hero" ? " incluse" : ""}`
            : plural(stats.locations, "sede", "sedi");
    const subscriptionText = !isActivated
        ? "Scegli il piano per aprire l'attività."
        : isTrial && daysLeft !== null
          ? `${plural(daysLeft, "giorno rimasto", "giorni rimasti")}`
          : seatsText;

    const actions: TableRowAction[] = [
        { label: "Modifica attività", icon: Pencil, onClick: () => onEdit(tenant.id), hidden: !isOwner || !isActivated },
        {
            label: "Impostazioni attività",
            icon: Settings,
            onClick: () => onOpenSettings(tenant.id),
            hidden: isScoped || !isActivated
        },
        {
            label: "Lascia attività",
            icon: LogOut,
            onClick: () => onLeave(tenant.id),
            variant: "destructive",
            separator: true,
            // Uscire non dipende dall'abbonamento: chi è stato invitato in un'attività
            // non ancora attivata deve poterla lasciare (non può eliminarla).
            hidden: isOwner
        },
        {
            label: "Elimina attività",
            icon: Trash2,
            onClick: () => onDelete(tenant.id),
            variant: "destructive",
            separator: true,
            hidden: !isOwner
        }
    ];
    const hasActions = actions.some(a => !a.hidden);

    const logo = tenant.logo_url ? (
        <img src={getTenantLogoPublicUrl(tenant.logo_url)} alt="" className={styles.logo} />
    ) : (
        <div
            className={`${styles.logo} ${size === "compact" ? styles.logoTinted : styles.logoInitial}`}
            style={size === "compact" ? { ["--tenant-hue" as string]: hue } : undefined}
            aria-hidden="true"
        >
            {initials}
        </div>
    );

    // ── Da 3 in su: una riga, tutta cliccabile ────────────────────────────
    if (size === "compact") {
        const compactMeta = [
            plural(stats.locations, "sede", "sedi"),
            !isActivated ? "Da attivare" : isTrial ? "In prova" : [plan, status?.label.toLowerCase()].filter(Boolean).join(" ")
        ]
            .filter(Boolean)
            .join(" · ");
        return (
            <button
                type="button"
                className={`${styles.card} ${styles.compact}`}
                onClick={enter}
                aria-label={isActivated ? `Entra in ${tenant.name}` : `Attiva ${tenant.name}`}
            >
                {logo}
                <span className={styles.titles}>
                    <Text as="span" variant="body" weight={600} className={styles.name}>
                        {tenant.name}
                    </Text>
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.meta}>
                        {compactMeta}
                    </Text>
                </span>
                <ChevronRight size={16} aria-hidden className={styles.chevron} />
            </button>
        );
    }

    const meta =
        size === "hero"
            ? [sector, city, `sei ${roleLabel(tenant.user_role)}`].filter(Boolean).join(" · ")
            : [sector, roleLabel(tenant.user_role)].join(" · ");

    const enterButton = (
        <Button
            variant={size === "hero" ? "primary" : "secondary"}
            onClick={enter}
            rightIcon={isActivated ? <ArrowRight size={16} aria-hidden /> : undefined}
            className={`${styles.enter} ${size === "pair" ? styles.enterSoft : ""}`}
            aria-label={isActivated ? `Entra in ${tenant.name}` : `Attiva ${tenant.name}`}
        >
            {isActivated ? "Entra" : "Attiva"}
        </Button>
    );

    const numbers: Array<[number, string]> = [
        [stats.locations, stats.locations === 1 ? "sede" : "sedi"],
        [stats.catalogs, "menù"],
        [stats.products, stats.products === 1 ? "prodotto" : "prodotti"]
    ];

    return (
        <article
            className={`${styles.card} ${styles[size]}`}
            aria-label={tenant.name}
            style={{ ["--tenant-hue" as string]: hue }}
        >
            <div className={styles.cover} aria-hidden="true">
                {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <div className={styles.coverFallback} />}
            </div>

            {hasActions && (
                <div className={styles.menu}>
                    <TableRowActions actions={actions} />
                </div>
            )}

            <div className={styles.body}>
                <div className={styles.logoWrap}>{logo}</div>

                <div className={styles.identity}>
                    <div className={styles.titles}>
                        <Text as="h2" variant={size === "hero" ? "title-lg" : "title-sm"} className={styles.name}>
                            {tenant.name}
                        </Text>
                        <Text as="p" variant="body-sm" colorVariant="muted" className={styles.meta}>
                            {meta}
                        </Text>
                        {size === "pair" && (
                            <Text as="p" variant="body-sm" className={styles.inlineNumbers}>
                                {numbers.map(([v, l]) => `${v} ${l}`).join(" · ")}
                            </Text>
                        )}
                    </div>
                    {size === "hero" && <div className={styles.enterHero}>{enterButton}</div>}
                </div>

                {size === "hero" && (
                    <dl className={styles.numbers}>
                        {numbers.map(([value, label]) => (
                            <div key={label} className={styles.number}>
                                <Text as="dt" variant="caption" colorVariant="muted">
                                    {label}
                                </Text>
                                <Text as="dd" variant="title-md" weight={700}>
                                    {value}
                                </Text>
                            </div>
                        ))}
                    </dl>
                )}
            </div>

            <div className={styles.footer}>
                {statusBadge}
                <Text as="span" variant="body-sm" colorVariant="muted" className={styles.subscriptionText}>
                    {subscriptionText}
                </Text>
                {size === "hero" && isActivated && !isScoped && (
                    <Text as="span" variant="body-sm" className={styles.links}>
                        <button type="button" className={styles.link} onClick={() => onOpenSubscription(tenant.id)}>
                            Abbonamento
                        </button>
                        <span aria-hidden="true">·</span>
                        <button type="button" className={styles.link} onClick={() => onOpenSettings(tenant.id)}>
                            Impostazioni
                        </button>
                    </Text>
                )}
                {size === "pair" && <div className={styles.enterPair}>{enterButton}</div>}
            </div>
        </article>
    );
}
