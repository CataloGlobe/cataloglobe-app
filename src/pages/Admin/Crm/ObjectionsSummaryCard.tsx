import { BarList } from "@/components/ui/BarList/BarList";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { CRM_OBJECTION_LABEL, type ObjectionSummaryRow } from "@/utils/crm/objections";
import { TileState } from "./components/TileState";
import styles from "./Crm.module.scss";

/**
 * Riepilogo: le obiezioni sentite nel periodo, per categoria (libreria delle
 * obiezioni, F2-5), con le note più recenti della prima. Da qui si aprono le
 * risposte che funzionano e il report per Ferdinando.
 */
export function ObjectionsSummaryCard({
    rows,
    loading,
    error,
    onRetry,
    onAnswers,
    onReport
}: {
    rows: ObjectionSummaryRow[];
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onAnswers: () => void;
    onReport: () => void;
}) {
    const total = rows.reduce((n, r) => n + r.count, 0);
    const top = rows[0];
    return (
        <Card
            title="Obiezioni"
            subtitle={total === 0 ? "Nessuna obiezione segnata in questo periodo." : `${total} sentite in questo periodo.`}
            actions={
                <>
                    <Button variant="secondary" size="sm" onClick={onAnswers}>
                        Risposte
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onReport}>
                        Report per Ferdinando
                    </Button>
                </>
            }
        >
            <TileState loading={loading} error={error} onRetry={onRetry} empty={total === 0} emptyText="Si segnano spostando un lead in Perso per obiezione, o dalla sua scheda.">
                <BarList
                    aria-label="Obiezioni per categoria"
                    items={rows.map(r => ({ id: r.category, label: CRM_OBJECTION_LABEL[r.category], value: r.count }))}
                />
                {top && top.notes.length > 0 && (
                    <div className={styles.flatBody}>
                        <Text variant="caption" colorVariant="muted">
                            Come la dicono ({CRM_OBJECTION_LABEL[top.category].toLowerCase()})
                        </Text>
                        {top.notes.map((note, i) => (
                            <Text key={i} as="p" variant="body-sm">
                                «{note}»
                            </Text>
                        ))}
                    </div>
                )}
            </TileState>
        </Card>
    );
}
