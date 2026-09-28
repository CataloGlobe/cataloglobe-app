import { useCallback, useEffect, useMemo, useState } from "react";
import { listAppearanceSources, type AppearanceSources } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { buildAppearance, type AppearanceIndex } from "@/utils/ruleAppearance";

export type RuleAppearanceState = {
    /** null finché le regole non ci sono (in caricamento o fallite). */
    index: AppearanceIndex | null;
    activities: AppearanceSources["activities"];
    loading: boolean;
    failed: boolean;
    reload: () => Promise<void>;
};

/**
 * Le regole dell'azienda lette una volta per pagina, e la competizione giocata
 * adesso (§50.13): Menù, Stili, In evidenza. Istantanea al caricamento, niente
 * ticking: il cursore del tempo è di Programmazione. Un errore non è un toast:
 * la pagina resta com'era, senza le righe «dove appare».
 */
export function useRuleAppearance(tenantId: string | null | undefined, enabled = true): RuleAppearanceState {
    const { canEdit } = useSubscriptionGuard();
    const [sources, setSources] = useState<AppearanceSources | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const reload = useCallback(async () => {
        if (!tenantId || !enabled) return;
        setLoading(true);
        setFailed(false);
        try {
            setSources(await listAppearanceSources(tenantId));
        } catch (error) {
            console.warn("[useRuleAppearance] regole non caricate:", error);
            setSources(null);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [tenantId, enabled]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const index = useMemo(
        () =>
            sources
                ? buildAppearance({
                      rules: sources.rules,
                      activities: sources.activities,
                      activityIdsByGroupId: sources.activityIdsByGroupId,
                      instant: toRomeDateTime(new Date()),
                      subscriptionInactive: !canEdit
                  })
                : null,
        [sources, canEdit]
    );

    return { index, activities: sources?.activities ?? [], loading, failed, reload };
}
