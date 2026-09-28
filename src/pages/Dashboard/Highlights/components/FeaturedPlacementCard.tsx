import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { SCHEDULE_STATUS_META } from "@/utils/scheduleStatus";
import { describePlacement, type Appearance } from "@/utils/ruleAppearance";
import styles from "../FeaturedContentDetailPage.module.scss";

type FeaturedPlacementCardProps = {
    appearance: Appearance;
    activityName: (id: string) => string | undefined;
    businessId: string;
};

/**
 * «Dove e quando compare — lo decide la regola» (§28.1, #528). Il contenuto
 * non sa dove compare: lo sanno le regole che lo nominano. Una riga per
 * regola, col posto, le sedi, la finestra e lo stato; la riga apre la regola.
 */
export function FeaturedPlacementCard({ appearance, activityName, businessId }: FeaturedPlacementCardProps) {
    const hasRules = appearance.rules.length > 0;
    return (
        <Card title="Dove e quando compare" subtitle="Lo decide la regola." flush>
            {hasRules ? (
                <div role="list" aria-label="Regole che lo mostrano">
                    {appearance.rules.map(entry => {
                        const meta = SCHEDULE_STATUS_META[entry.status];
                        return (
                            <div role="listitem" key={entry.rule.id}>
                                <ListRow
                                    to={`/business/${businessId}/scheduling/${entry.rule.id}`}
                                    title={entry.rule.name?.trim() || "Regola senza nome"}
                                    subtitle={describePlacement(entry, activityName)}
                                    meta={<StatusBadge variant={meta.tone} label={meta.label} />}
                                    muted={!entry.isLive}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <>
                    <Text variant="body-sm" colorVariant="muted" className={styles.placementEmpty}>
                        Nessuna regola lo mostra: esiste e nessun cliente lo vede.
                    </Text>
                    <ListRow
                        to={`/business/${businessId}/scheduling`}
                        title="Vai a Programmazione"
                        subtitle="Una regola «In evidenza» decide dove e quando compare."
                    />
                </>
            )}
        </Card>
    );
}
