import { useCallback } from "react";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { PageGate } from "@/components/PageGate/PageGate";
import { usePermissions } from "@/context/usePermissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity, canExplainActivityCatalog } from "@/lib/permissions";
import { useCatalogExplanation } from "@/hooks/useCatalogExplanation";
import { describeCounts, describeOutcome } from "@/utils/catalogExplanation";
import { ActivityVisibilityContent } from "../components/ActivityVisibility/ActivityVisibilityContent";
import { CatalogOutcomeBand } from "../components/ActivityVisibility/CatalogOutcomeBand";
import { useActivityDetail } from "../ActivityDetailContext";
import styles from "./ActivityDisponibilitaRoute.module.scss";

/**
 * Disponibilità: cosa trova chi inquadra il QR di questa sede, adesso.
 * Rotta senza tab, raggiunta da «Gestisci» in Sedi; il drawer da 900 non
 * esiste più (§19.5). In cima la banda dell'esito con il menù che vince
 * (§19.2, riga 1 della catena), solo per chi può leggere tutte le regole.
 */
export default function ActivityDisponibilitaRoute() {
    const { activity, tenantId } = useActivityDetail();
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    // Legge chi legge la sede; scrive chi ha `activity.manage` (le RLS di
    // `activity_product_overrides`) con l'abbonamento attivo (D2).
    const canRead = permissions != null && canDoOnActivity(permissions, "activity.read", activity.id);
    const hasWritePermission = permissions != null && canDoOnActivity(permissions, "activity.manage", activity.id);
    const canWrite = hasWritePermission && canEdit;
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
    const reloadExplanation = explanation.reload;
    const handleChanged = useCallback(() => void reloadExplanation(true), [reloadExplanation]);

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
                    counts={outcome.kind === "showing" && explanation.data.explanation ? describeCounts(explanation.data.explanation.counts) : null}
                    menu={
                        explanation.data.catalogName
                            ? {
                                  catalogName: explanation.data.catalogName,
                                  rule: explanation.data.layoutRule,
                                  ruleHref: explanation.data.layoutRule
                                      ? `/business/${tenantId}/scheduling/${explanation.data.layoutRule.id}`
                                      : null
                              }
                            : null
                    }
                    fixes={{
                        seat: { label: "Vai a Pubblicazione", href: `/business/${tenantId}/locations/${activity.id}/pubblicazione` },
                        subscription: { label: "Vai ad Abbonamento", href: `/business/${tenantId}/subscription` },
                        rule: { label: "Vai a Programmazione", href: `/business/${tenantId}/scheduling` }
                    }}
                />
            )}
            {canExplain && explanation.error && (
                <InlineBanner variant="error">Non è stato possibile caricare cosa vedono i clienti.</InlineBanner>
            )}
            {permissions != null && !canExplain && (
                <InlineBanner variant="info">Per vedere perché, serve l'accesso a Programmazione.</InlineBanner>
            )}
            {canRead && (
                <ActivityVisibilityContent
                    activityId={activity.id}
                    onChanged={handleChanged}
                    readOnly={!canWrite}
                />
            )}
        </div>
    );
}
