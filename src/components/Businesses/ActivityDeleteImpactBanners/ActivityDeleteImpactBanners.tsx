import { Link } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { ActivityDeleteImpact } from "@/services/supabase/activities";
import styles from "./ActivityDeleteImpactBanners.module.scss";
/**
 * Le regole di Programmazione toccate dall'eliminazione, in due avvisi: quelle
 * che passano in bozza (la sede era il loro unico bersaglio) e quelle che
 * smettono di raggiungere sedi (era l'ultima del gruppo). Massimo cinque link
 * per avviso.
 */
export function ActivityDeleteImpactBanners({
  impact,
  businessId,
  onNavigate,
}: {
  impact: ActivityDeleteImpact;
  businessId: string;
  onNavigate: () => void;
}) {
  const directTarget = impact.schedulesGoingDraft.filter((s) => s.cause === "direct_target");
  const groupEmptied = impact.schedulesGoingDraft.filter((s) => s.cause === "group_emptied");
  if (directTarget.length === 0 && groupEmptied.length === 0) return null;

  const renderList = (schedules: ActivityDeleteImpact["schedulesGoingDraft"]) => (
    <>
      <ul className={styles.impactList}>
        {schedules.slice(0, 5).map((schedule) => (
          <li key={schedule.id}>
            <Link
              to={`/business/${businessId}/scheduling/${
                schedule.rule_type === "featured" ? "featured/" : ""
              }${schedule.id}`}
              onClick={onNavigate}
            >
              {schedule.name ?? "Regola senza nome"}
            </Link>
          </li>
        ))}
      </ul>
      {schedules.length > 5 && (
        <Text as="span" variant="caption" colorVariant="muted">
          +{schedules.length - 5} altre
        </Text>
      )}
    </>
  );

  return (
    <>
      {directTarget.length > 0 && (
        <InlineBanner variant="warning">
          <Text as="span" variant="body-sm" weight={600}>
            {directTarget.length === 1
              ? "1 regola passerà in bozza"
              : `${directTarget.length} regole passeranno in bozza`}
          </Text>{" "}
          {directTarget.length === 1
            ? "perché questa era la sua unica sede. Se vuoi tenerla attiva, aprila e puntala su un'altra sede prima di eliminare."
            : "perché questa era la loro unica sede. Se vuoi tenerle attive, aprile e puntale su un'altra sede prima di eliminare."}
          {renderList(directTarget)}
        </InlineBanner>
      )}
      {groupEmptied.length > 0 && (
        <InlineBanner variant="warning">
          <Text as="span" variant="body-sm" weight={600}>
            {groupEmptied.length === 1
              ? "1 regola smetterà di raggiungere sedi"
              : `${groupEmptied.length} regole smetteranno di raggiungere sedi`}
          </Text>{" "}
          {groupEmptied.length === 1
            ? "perché questa era l'ultima sede del gruppo a cui è collegata. Resta attiva — se aggiungi un'altra sede al gruppo torna operativa da sola."
            : "perché questa era l'ultima sede dei rispettivi gruppi. Restano attive — se aggiungi un'altra sede al gruppo tornano operative da sole."}
          {renderList(groupEmptied)}
        </InlineBanner>
      )}
    </>
  );
}
