import { Link } from "react-router-dom";
import { BarList } from "@/components/ui/BarList/BarList";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import type { CrmStage } from "@/types/crm";
import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL } from "@/utils/crm/stages";
import { formatDuration, LEAD_VIEWS, PIPELINE_STAGES, trackIndex, type LeadSummary, type LeadView } from "@/utils/crm/leadViews";
import styles from "../Leads.module.scss";

/**
 * La colonna delle viste (V4): Riepilogo in cima, le viste di lavoro con il
 * conteggio, poi «Altro» con quelle chiuse. Ogni voce è un link (`?vista=`).
 */
export function LeadViewsNav({
    view,
    counts,
    hrefOf
}: {
    view: LeadView;
    counts: Record<LeadView, number> | null;
    hrefOf: (view: LeadView) => string;
}) {
    const item = (v: LeadView, label: string, count?: number) => (
        <Link key={v} to={hrefOf(v)} className={styles.viewItem} aria-current={view === v ? "page" : undefined}>
            <Text as="span" variant="body-sm" color="inherit" weight={view === v ? 600 : undefined}>
                {label}
            </Text>
            {count !== undefined && (
                <Text as="span" variant="caption" className={styles.viewCount}>
                    {count}
                </Text>
            )}
        </Link>
    );
    return (
        <nav className={styles.views} aria-label="Viste dei lead">
            <Text as="h1" variant="title-sm" weight={700} className={styles.viewsTitle}>
                Lead
            </Text>
            {item("riepilogo", "Riepilogo")}
            <div className={styles.viewsDivider} aria-hidden="true" />
            {LEAD_VIEWS.filter(m => m.group === "lavoro").map(m => item(m.view, m.label, counts?.[m.view]))}
            <Text as="h2" variant="caption-xs" weight={600} className={styles.viewsGroup}>
                Altro
            </Text>
            {LEAD_VIEWS.filter(m => m.group === "altro").map(m => item(m.view, m.label, counts?.[m.view]))}
        </nav>
    );
}

/** Il binario (R4b): nove tacche da Nuovo a Pagante, la tacca alta è dove sta adesso. */
export function LeadTrack({ stage }: { stage: CrmStage }) {
    const here = trackIndex(stage);
    return (
        <span className={styles.track} role="img" aria-label={here === null ? "Perso" : `Fase ${here + 1} di ${PIPELINE_STAGES.length}`}>
            {PIPELINE_STAGES.map((s, i) => (
                <span
                    key={s}
                    className={styles.tick}
                    data-state={here === null ? undefined : i < here ? "done" : i === here ? "here" : undefined}
                />
            ))}
        </span>
    );
}

/**
 * Il Riepilogo dentro Lead (V4): quattro numeri, in quale fase si fermano (una
 * fase si apre: chi è fermo lì), da dove arrivano e quanto siamo veloci.
 */
export function LeadSummaryView({ summary, onStage }: { summary: LeadSummary; onStage: (stage: CrmStage) => void }) {
    const max = Math.max(1, ...summary.funnel.map(r => r.reached));
    return (
        <>
            <dl className={styles.figures}>
                <div>
                    <Text as="dt" variant="caption" colorVariant="muted">
                        Arrivati
                    </Text>
                    <Text as="dd" variant="title-lg" weight={700}>
                        {summary.arrived}
                    </Text>
                </div>
                <div>
                    <Text as="dt" variant="caption" colorVariant="muted">
                        Hanno risposto
                    </Text>
                    <Text as="dd" variant="title-lg" weight={700}>
                        {summary.repliedPct === null ? "—" : `${summary.repliedPct}%`}
                    </Text>
                </div>
                <div>
                    <Text as="dt" variant="caption" colorVariant="muted">
                        Diventati clienti
                    </Text>
                    <Text as="dd" variant="title-lg" weight={700}>
                        {summary.clients}
                    </Text>
                </div>
                <div>
                    <Text as="dt" variant="caption" colorVariant="muted">
                        Giorni fino al pagamento
                    </Text>
                    <Text as="dd" variant="title-lg" weight={700}>
                        {summary.daysToPay === null ? "—" : Math.round(summary.daysToPay)}
                    </Text>
                </div>
            </dl>

            <div className={styles.summaryGrid}>
                <Card
                    title="In quale fase si fermano"
                    subtitle={
                        summary.arrived === 0
                            ? "Nessun lead arrivato in questo periodo."
                            : `Dei ${summary.arrived} lead arrivati, quanti sono arrivati a ogni fase. Clicca una fase per vedere chi si è fermato lì.`
                    }
                >
                    <ul className={styles.funnel}>
                        {summary.funnel.map(row => (
                            <li key={row.stage}>
                                <button
                                    type="button"
                                    className={styles.funnelRow}
                                    data-worst={row.worst || undefined}
                                    onClick={() => onStage(row.stage)}
                                    aria-label={`${CRM_STAGE_LABEL[row.stage]}: ${row.reached}${row.note ? `, ${row.note}` : ""}. Vedi chi è fermo qui`}
                                >
                                    <Text as="span" variant="body-sm" color="inherit">
                                        {CRM_STAGE_LABEL[row.stage]}
                                    </Text>
                                    <svg
                                        className={styles.funnelBar}
                                        data-stage={row.stage}
                                        viewBox="0 0 100 18"
                                        preserveAspectRatio="none"
                                        aria-hidden="true"
                                    >
                                        <rect x="0" y="0" height="18" rx="1.5" ry="4" width={Math.max(row.reached > 0 ? 4 : 0, (row.reached / max) * 100)} />
                                    </svg>
                                    <Text as="span" variant="body-sm" weight={700} className={styles.funnelCount}>
                                        {row.reached}
                                    </Text>
                                    <Text as="span" variant="caption" className={styles.funnelNote}>
                                        {row.note ?? ""}
                                    </Text>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>

                <div className={styles.summarySide}>
                    <Card title="Da dove arrivano">
                        <BarList
                            labelColumn="fit"
                            aria-label="Da dove arrivano"
                            emptyTitle="Nessun lead in questo periodo"
                            items={summary.sources.map(s => ({ id: s.source, label: CRM_SOURCE_LABEL[s.source], value: s.count }))}
                        />
                    </Card>
                    <Card title="Velocità">
                        <dl className={styles.speed}>
                            <div>
                                <Text as="dt" variant="body-sm" colorVariant="muted">
                                    Prima risposta nostra
                                </Text>
                                <Text as="dd" variant="body-sm" weight={700}>
                                    {summary.firstReplyMinutes === null ? "—" : formatDuration(summary.firstReplyMinutes)}
                                </Text>
                            </div>
                            <div>
                                <Text as="dt" variant="body-sm" colorVariant="muted">
                                    Da nuovo a telefonata
                                </Text>
                                <Text as="dd" variant="body-sm" weight={700}>
                                    {summary.daysToCall === null ? "—" : formatDuration(summary.daysToCall * 24 * 60)}
                                </Text>
                            </div>
                        </dl>
                    </Card>
                </div>
            </div>
        </>
    );
}
