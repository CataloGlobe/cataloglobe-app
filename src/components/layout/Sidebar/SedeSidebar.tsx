import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, ClipboardList, Eye, LayoutGrid, Store } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useActivitiesCount, useActivitySummary } from "@/hooks/useActivitySummary";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { buildSidebarGroups, type SidebarNavGroup } from "./sidebarItems";
import styles from "./SedeSidebar.module.scss";

/**
 * SedeSidebar — il costruttore delle voci del contesto **sede** (§46.1).
 * Entrando in un locale la sidebar diventa la sua: cinque voci, e sopra
 * l'intestazione che dice dove sei e come si esce.
 *
 * I permessi si chiedono **su questa sede** (`canDoOnActivity`): dentro il
 * contesto la domanda è «posso qui», non «posso da qualche parte».
 *
 * P0 (§46.1 j): Comande e Prenotazioni sono annunciate e non navigabili
 * finché le pagine non prendono la sede dal path — farle puntare alle pagine
 * d'azienda porterebbe l'utente su un'altra sede.
 */

const NOT_YET = "Arriva con le rotte di sede";

function buildGroups(businessId: string, activityId: string): SidebarNavGroup[] {
    const s = `/business/${businessId}/locations/${activityId}`;
    return [
        {
            title: "Servizio",
            items: [
                {
                    to: `${s}/comande`,
                    label: "Comande",
                    icon: <ClipboardList size={18} />,
                    disabled: true,
                    disabledHint: NOT_YET,
                    permission: perms => canDoOnActivity(perms, "orders.read", activityId),
                    requiresFeature: "table_ordering"
                },
                {
                    to: `${s}/prenotazioni`,
                    label: "Prenotazioni",
                    icon: <CalendarCheck size={18} />,
                    disabled: true,
                    disabledHint: NOT_YET,
                    permission: perms => canDoOnActivity(perms, "reservations.read", activityId),
                    requiresFeature: "table_reservation"
                },
                {
                    to: `${s}/sala`,
                    label: "Sala",
                    icon: <LayoutGrid size={18} />,
                    permission: perms => canDoOnActivity(perms, "tables.read", activityId)
                }
            ]
        },
        {
            title: "Clienti",
            items: [
                {
                    // Diventerà «Cosa vedono i clienti» con la §19: il nome
                    // nuovo prometterebbe una pagina che non c'è ancora.
                    to: `${s}/disponibilita`,
                    label: "Disponibilità",
                    icon: <Eye size={18} />,
                    permission: perms => canDoOnActivity(perms, "product_availability.write", activityId)
                }
            ]
        },
        {
            title: "Il locale",
            items: [
                {
                    to: `${s}/anagrafica`,
                    label: "Scheda",
                    icon: <Store size={18} />,
                    // Una voce, quattro pagine: resta accesa anche su Orari,
                    // Ordini e prenotazioni, Pubblicazione.
                    matchPrefixes: [`${s}/orari`, `${s}/ordini-prenotazioni`, `${s}/pubblicazione`],
                    permission: perms => canDoOnActivity(perms, "activity.read", activityId)
                }
            ]
        }
    ];
}

export interface SedeSidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
}

export default function SedeSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse
}: SedeSidebarProps) {
    const { businessId = "", activityId = "" } = useParams<{ businessId: string; activityId: string }>();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const summary = useActivitySummary(activityId);
    const activitiesCount = useActivitiesCount();

    const groups = buildSidebarGroups(buildGroups(businessId, activityId), { permissions, hasFeature });

    // Con una sede sola non esiste un «tutte»: si torna all'azienda.
    const single = activitiesCount === 1;
    const backLabel = single ? "Azienda" : "Tutte le sedi";
    const backTo = single ? `/business/${businessId}/overview` : `/business/${businessId}/locations`;
    const collapsedDesktop = !isMobile && collapsed;

    const back = (
        <Link to={backTo} className={styles.back} onClick={() => isMobile && onRequestClose()}>
            <ArrowLeft size={16} aria-hidden="true" />
            <Text as="span" variant="caption">
                {backLabel}
            </Text>
        </Link>
    );

    const header = collapsedDesktop ? (
        <div className={styles.headerCollapsed}>
            <Tooltip content={summary ? `${backLabel} · ${summary.name}` : backLabel} side="right" sideOffset={28}>
                <Link to={backTo} className={styles.back} aria-label={backLabel}>
                    <ArrowLeft size={16} aria-hidden="true" />
                </Link>
            </Tooltip>
        </div>
    ) : (
        <div className={styles.header}>
            {back}
            {summary && (
                <>
                    <Text as="span" variant="body-sm" weight={600} className={styles.name}>
                        {summary.name}
                    </Text>
                    <StatusBadge
                        variant={summary.status === "inactive" ? "neutral" : "success"}
                        label={summary.status === "inactive" ? "Sospesa" : "Pubblicata"}
                    />
                </>
            )}
        </div>
    );

    return (
        <AppSidebar
            groups={groups}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
            headerSlot={header}
        />
    );
}
