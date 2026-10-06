import { ArrowRight, Settings, LogOut, CreditCard, Trash2, Pencil } from "lucide-react";
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
 * - `hero` (1 attività): copertina 220, logo 96, quattro numeri, «Entra →» primario;
 * - `pair` (2 attività): copertina 140, «Entra» secondario;
 * - `compact` (3 e più): niente copertina, griglia a 3 colonne.
 * L'abbonamento sta in fondo alla card; la pagina Abbonamento del Workspace
 * non c'è più.
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
    const initial = tenant.name.charAt(0).toUpperCase();
    const sector =
        (tenant.business_subtype && SUBTYPE_LABELS[tenant.business_subtype]) ??
        VERTICAL_LABELS[tenant.vertical_type] ??
        tenant.vertical_type;
    const isOwner = workspaceRoleIsOwner(tenant.user_role);
    const isScoped = workspaceRoleIsScoped(tenant.user_role);
    const isActivated = !!tenant.stripe_subscription_id;
    const meta = [sector, city, roleLabel(tenant.user_role)].filter(Boolean).join(" · ");

    const enter = () => (isActivated ? onSelect(tenant.id) : onActivate(tenant.id));

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
            hidden: isOwner || !isActivated
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

    const status = STATUS_LABEL[tenant.subscription_status ?? ""];
    const seats =
        tenant.paid_seats != null
            ? `${stats.locations} di ${plural(tenant.paid_seats, "sede", "sedi")}`
            : plural(stats.locations, "sede", "sedi");

    const numbers: Array<[number, string]> = [
        [stats.locations, stats.locations === 1 ? "sede" : "sedi"],
        [stats.catalogs, "menù"],
        [stats.products, stats.products === 1 ? "prodotto" : "prodotti"]
    ];

    const enterButton = (
        <Button
            variant={size === "hero" ? "primary" : "secondary"}
            size={size === "compact" ? "sm" : "md"}
            onClick={enter}
            rightIcon={isActivated ? <ArrowRight size={16} aria-hidden /> : undefined}
            className={styles.enter}
            aria-label={isActivated ? `Entra in ${tenant.name}` : `Attiva ${tenant.name}`}
        >
            {isActivated ? "Entra" : "Attiva"}
        </Button>
    );

    return (
        <article className={`${styles.card} ${styles[size]}`} aria-label={tenant.name}>
            {size !== "compact" && (
                <div className={styles.cover} aria-hidden="true">
                    {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <div className={styles.coverFallback} />}
                </div>
            )}

            {hasActions && (
                <div className={styles.menu}>
                    <TableRowActions actions={actions} />
                </div>
            )}

            <div className={styles.body}>
                <div className={styles.identity}>
                    {tenant.logo_url ? (
                        <img src={getTenantLogoPublicUrl(tenant.logo_url)} alt="" className={styles.logo} />
                    ) : (
                        <div className={`${styles.logo} ${styles.logoInitial}`} aria-hidden="true">
                            {initial}
                        </div>
                    )}
                    <div className={styles.titles}>
                        <Text as="h2" variant={size === "hero" ? "title-md" : "title-sm"} className={styles.name}>
                            {tenant.name}
                        </Text>
                        <Text as="p" variant="body-sm" colorVariant="muted" className={styles.meta}>
                            {meta}
                        </Text>
                    </div>
                    {size === "pair" && <div className={styles.enterInline}>{enterButton}</div>}
                </div>

                <dl className={styles.numbers}>
                    {numbers.map(([value, label]) => (
                        <div key={label} className={styles.number}>
                            <Text as="dt" variant="caption" colorVariant="muted">
                                {label}
                            </Text>
                            <Text as="dd" variant={size === "compact" ? "body" : "title-sm"} weight={600}>
                                {value}
                            </Text>
                        </div>
                    ))}
                </dl>

                <div className={styles.subscription}>
                    {isActivated ? (
                        <>
                            {status && <Badge variant={status.variant}>{status.label}</Badge>}
                            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.subscriptionText}>
                                {[tenant.plan ? `Piano ${PLAN_LABEL[tenant.plan] ?? tenant.plan}` : null, seats]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </Text>
                            {!isScoped && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<CreditCard size={14} aria-hidden />}
                                    onClick={() => onOpenSubscription(tenant.id)}
                                    className={styles.subscriptionLink}
                                >
                                    Abbonamento
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Badge variant="warning">Da attivare</Badge>
                            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.subscriptionText}>
                                Scegli il piano per aprire l&apos;attività.
                            </Text>
                        </>
                    )}
                </div>

                {size !== "pair" && <div className={styles.enterRow}>{enterButton}</div>}
            </div>
        </article>
    );
}
