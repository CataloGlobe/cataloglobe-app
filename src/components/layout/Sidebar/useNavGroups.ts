import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import type { AppSidebarNavGroup, AppSidebarNavItem } from "@/components/layout/AppSidebar/AppSidebar";
import { NAV_MODELS, type NavContext } from "@/utils/navModel";
import { buildSidebarGroups, type SidebarSignals } from "./sidebarItems";
import { navSidebarGroups } from "./navSidebarGroups";
import { useTranslationWaitingSignal } from "./useTranslationWaitingSignal";

export interface UseNavGroupsOptions {
    context: NavContext;
    /** La sede in vista: quella del path (leggibile), o l'unica. */
    activityId: string | null;
    /** La sede delle parti di sede quando nessuna è in vista: l'ultima usata, o la prima. */
    defaultActivityId: string | null;
    /** La sede scelta in alto quando nessuna è nell'indirizzo (D152). */
    chosenActivityId?: string | null;
    /** Sedi non ancora arrivate: niente voci, invece di un contesto provvisorio. */
    loading?: boolean;
    signals: Omit<SidebarSignals, "translationLabel" | "translationWaitingCount" | "translationWaitingLabel">;
    /**
     * Traduzioni in attesa dei 10 minuti (fonte unica: MainLayout). Senza
     * lavoro in corso il badge mostra queste, col titolo «partono tra X min».
     */
    translationWaiting?: { count: number; nextRunAt: string | null };
}

export interface NavGroups {
    /** Le sei sezioni, filtrate per permessi e piano, coi segnali. */
    groups: AppSidebarNavGroup[];
    /** Il menù dell'account: le pagine dell'azienda che non sono lavoro di ogni giorno. */
    account: AppSidebarNavItem[];
}

/**
 * Le sezioni della navigazione (artifact v4, Alex 2026-10-09), una volta per
 * la sidebar e per le tab in testa alla pagina: una sidebar sola per azienda
 * e sede, le sedi le sceglie la pagina.
 */
export function useNavGroups({
    context,
    activityId,
    defaultActivityId,
    chosenActivityId = null,
    loading = false,
    signals,
    translationWaiting
}: UseNavGroupsOptions): NavGroups {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const waitingSignal = useTranslationWaitingSignal(translationWaiting);

    // Finché i permessi non arrivano niente voci: senza, lo staff vedrebbe
    // per un attimo Team e Abbonamento.
    if (loading || (permissionsLoading && !permissions)) return { groups: [], account: [] };

    const { groups, account } = navSidebarGroups(NAV_MODELS[context], {
        businessId,
        activityId,
        defaultActivityId,
        chosenActivityId,
        catalogLabel
    });
    const options = {
        permissions,
        hasFeature,
        signals: { ...signals, translationLabel: t("sidebar.translations_in_progress"), ...waitingSignal }
    };
    return {
        groups: buildSidebarGroups(groups, options),
        account: buildSidebarGroups(account, options).flatMap(g => g.items)
    };
}
