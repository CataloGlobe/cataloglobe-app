import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, ClipboardList, Eye, History, LayoutGrid, Store } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useActivitySummary } from "@/hooks/useActivitySummary";
import { useSedeScope } from "@/hooks/useSedeScope";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { SEDE_NAV_ENTRIES, canSeeSedeEntry } from "@/utils/navLanding";
import { buildSidebarGroups, type SidebarNavGroup } from "./sidebarItems";
import styles from "./SedeSidebar.module.scss";

/**
 * SedeSidebar — il costruttore delle voci del contesto **sede** (§46.1).
 * Entrando in un locale la sidebar diventa la sua: le sue voci, e sopra
 * l'intestazione che dice dove sei e come si esce.
 *
 * I permessi si chiedono **su questa sede** (`canDoOnActivity`): dentro il
 * contesto la domanda è «posso qui», non «posso da qualche parte».
 *
 * Comande e Prenotazioni sono le pagine d'azienda montate sulle rotte della
 * sede: prendono la sede dal path (`useActivityScope`), quindi la voce porta
 * sempre su questa sede e non su quella che il selettore ricordava.
 */

const ICONS: Record<string, ReactNode> = {
    servizio: <LayoutGrid size={18} />,
    comande: <ClipboardList size={18} />,
    storico: <History size={18} />,
    prenotazioni: <CalendarCheck size={18} />,
    "cosa-vedono": <Eye size={18} />,
    anagrafica: <Store size={18} />
};

/**
 * Le voci e il loro ordine stanno in `SEDE_NAV_ENTRIES` (`utils/navLanding`):
 * lo stesso elenco decide dove si atterra entrando nella sede (§46.1 f).
 * Qui si aggiungono icone e indirizzi, e si raggruppa.
 */
function buildGroups(businessId: string, activityId: string): SidebarNavGroup[] {
    const s = `/business/${businessId}/locations/${activityId}`;
    const groups: SidebarNavGroup[] = [];
    for (const entry of SEDE_NAV_ENTRIES) {
        let group = groups.find(g => g.title === entry.group);
        if (!group) {
            group = { title: entry.group, items: [] };
            groups.push(group);
        }
        group.items.push({
            to: `${s}/${entry.segment}`,
            label: entry.label,
            icon: ICONS[entry.segment],
            permission: perms => canSeeSedeEntry(perms, entry, activityId),
            requiresFeature: entry.requiresFeature,
            matchPrefixes: entry.matchSegments?.map(segment => `${s}/${segment}`)
        });
    }
    return groups;
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
    // Le sedi che chi guarda può leggere: la stessa misura dell'ingresso
    // nell'azienda (`businessHomePath`). Un manager di una sede sola esce
    // verso l'azienda, non verso un elenco di una riga (§46.1 i).
    const { readableActivities, isLoaded } = useSedeScope();

    const groups = buildSidebarGroups(buildGroups(businessId, activityId), { permissions, hasFeature });

    // Con una sede sola non esiste un «tutte»: si torna all'azienda.
    const single = isLoaded && readableActivities.length === 1;
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
