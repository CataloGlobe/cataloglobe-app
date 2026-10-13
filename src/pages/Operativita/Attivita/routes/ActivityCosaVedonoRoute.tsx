import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Store } from "lucide-react";
import { Button } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { PageGate } from "@/components/PageGate/PageGate";
import { getActivityById } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { usePermissions } from "@/context/usePermissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity, canExplainActivityCatalog } from "@/lib/permissions";
import { useCatalogExplanation } from "@/hooks/useCatalogExplanation";
import { describeOutcome } from "@/utils/catalogExplanation";
import { buildPublicUrl } from "@/utils/publicUrl";
import { useSedeScope } from "@/hooks/useSedeScope";
import { schedulingPath, schedulingRulePath } from "@/pages/Dashboard/Programming/schedulingPaths";
import { ActivityVisibilityContent } from "../components/ActivityVisibility/ActivityVisibilityContent";
import { CatalogOutcomeBand } from "../components/ActivityVisibility/CatalogOutcomeBand";
import styles from "./ActivityCosaVedonoRoute.module.scss";

/**
 * «Cosa vedono i clienti» (§19, milestone 7): cosa trova chi inquadra il QR
 * di questa sede, adesso. Una voce della sede a sé (§19.5), montata fuori
 * dalla Scheda come Comande e Prenotazioni: niente tab della Scheda in
 * testata, niente sua bozza. La vecchia `disponibilita` rimanda qui; ci si
 * arriva anche da «Gestisci» in Sedi. In cima la banda dell'esito con il menù
 * che vince (§19.2, riga 1 della catena), solo per chi può leggere tutte le
 * regole.
 */
export default function ActivityCosaVedonoRoute() {
    const { activityId = "", businessId = "" } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [loading, setLoading] = useState(true);

    // `getActivityById` non lancia: una lettura fallita è `null`, e la
    // pagina lo dice con lo stato «Sede non trovata».
    const load = useCallback(async () => {
        setLoading(true);
        setActivity(await getActivityById(activityId, businessId));
        setLoading(false);
    }, [activityId, businessId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading && !activity) {
        return (
            <div className={styles.loading} aria-busy="true" aria-label="Caricamento sede">
                <Skeleton height="120px" />
                <Skeleton height="320px" />
            </div>
        );
    }

    if (!activity) {
        return (
            <EmptyState
                variant="page"
                icon={<Store />}
                title="Sede non trovata"
                description="La sede che stai cercando non esiste o è stata eliminata."
                action={<Button onClick={() => navigate(`/business/${businessId}/locations`)}>Torna alle sedi</Button>}
            />
        );
    }

    return <CosaVedonoContent activity={activity} tenantId={businessId} />;
}

/** Il corpo della pagina, con la sede già letta. */
export function CosaVedonoContent({ activity, tenantId }: { activity: V2Activity; tenantId: string }) {
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    // Legge chi legge la sede; scrive chi ha `activity.manage` (le RLS di
    // `activity_product_overrides`) con l'abbonamento attivo (D2).
    const canRead = permissions != null && canDoOnActivity(permissions, "activity.read", activity.id);
    const hasWritePermission = permissions != null && canDoOnActivity(permissions, "activity.manage", activity.id);
    const canWrite = hasWritePermission && canEdit;
    // Programmazione della sede con più sedi, d'azienda con una sola (T9b).
    const { isForcedSingleSite } = useSedeScope();
    // Il solo gate della spiegazione (banda, provenienza, prezzo dalla
    // regola, menù attivo): vedi `canExplainActivityCatalog`.
    const canExplain = permissions != null && canExplainActivityCatalog(permissions, activity.id);
    const explanation = useCatalogExplanation(activity.id, tenantId, canRead && canExplain);
    const outcome = explanation.data
        ? describeOutcome({
              seatName: activity.name,
              seatPublished: activity.status === "active",
              // Lo stesso insieme di `useSubscriptionGuard().canEdit` e di
              // `VALID_SUBSCRIPTION_STATUSES` dell'Edge: active, trialing, past_due.
              subscriptionServing: canEdit,
              hasCatalogRule: explanation.data.hasCatalogRule,
              catalogName: explanation.data.catalogName,
              renderable: explanation.data.renderable
          })
        : null;

    if (permissions != null && !canRead) {
        return <PageGate readPermission="activity.read" activityId={activity.id}>{() => null}</PageGate>;
    }

    return (
        <div className={styles.layout}>
            {!canWrite && permissions != null && (
                <InlineBanner variant="info">
                    {hasWritePermission
                        ? "Sola lettura: l'abbonamento non è attivo."
                        : "Sola lettura: per cambiare la disponibilità serve un ruolo da manager della sede in su."}
                </InlineBanner>
            )}
            {canExplain && explanation.data && outcome && (
                <CatalogOutcomeBand
                    at={explanation.data.at}
                    outcome={outcome}
                    menu={
                        explanation.data.catalogName
                            ? {
                                  catalogName: explanation.data.catalogName,
                                  rule: explanation.data.layoutRule,
                                  ruleHref: explanation.data.layoutRule
                                      ? schedulingRulePath(tenantId, activity.id, isForcedSingleSite, {
                                            id: explanation.data.layoutRule.id,
                                            rule_type: "layout"
                                        })
                                      : null
                              }
                            : null
                    }
                    publicUrl={buildPublicUrl(activity.slug)}
                    fixes={{
                        seat: { label: "Vai alla pagina e al QR", href: `/business/${tenantId}/locations/${activity.id}/anagrafica?parte=link` },
                        subscription: { label: "Vai ad Abbonamento", href: `/business/${tenantId}/settings/abbonamento` },
                        // Programmazione della sede (T9b, PG6; prima `?sede=`, D2 §1).
                        rule: { label: "Vai alle regole", href: schedulingPath(tenantId, activity.id, isForcedSingleSite) }
                    }}
                />
            )}
            {permissions != null && !canExplain && (
                <InlineBanner variant="info">Per vedere perché, serve l'accesso alle regole del Calendario.</InlineBanner>
            )}
            {canRead && (
                <ActivityVisibilityContent
                    activityId={activity.id}
                    explanation={canExplain ? explanation : undefined}
                    readOnly={!canWrite}
                />
            )}
        </div>
    );
}
