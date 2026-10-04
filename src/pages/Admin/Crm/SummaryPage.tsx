import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarList } from "@/components/ui/BarList/BarList";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import Text from "@/components/ui/Text/Text";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCrmSummary } from "@/services/supabase/crmSummary";
import type { CrmLeadSource, CrmStage, CrmSummary } from "@/types/crm";
import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL } from "@/utils/crm/stages";
import {
    CRM_SUMMARY_PERIOD_LABEL,
    SUMMARY_FUNNEL,
    formatMinutes,
    stageCount,
    summaryDelta,
    summaryRange,
    type CrmSummaryPeriod
} from "@/utils/crm/summary";
import styles from "./Crm.module.scss";

const PERIODS: CrmSummaryPeriod[] = ["today", "7d", "30d", "month"];

/**
 * Riepilogo del giro (F1-9, prima parte): in testa i numeri del periodo col
 * confronto col periodo prima, poi le fasi raggiunte, da dove arrivano i lead
 * e la pipeline di adesso. Dati da `crm_summary`.
 */
export default function SummaryPage() {
    usePageTitle("Riepilogo");
    const [period, setPeriod] = useState<CrmSummaryPeriod>("7d");
    const [current, setCurrent] = useState<CrmSummary | null>(null);
    const [previous, setPrevious] = useState<CrmSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const range = useMemo(() => summaryRange(period), [period]);

    // Cambiando periodo in fretta, una risposta vecchia non copre la nuova.
    const requestId = useRef(0);
    const load = useCallback(async () => {
        const id = ++requestId.current;
        setIsLoading(true);
        try {
            const [now, before] = await Promise.all([
                getCrmSummary(range.from, range.to),
                getCrmSummary(range.previousFrom, range.previousTo)
            ]);
            if (id !== requestId.current) return;
            setCurrent(now);
            setPrevious(before);
            setError(null);
        } catch {
            if (id !== requestId.current) return;
            setCurrent(null);
            setPrevious(null);
            setError("Non riesco a leggere il riepilogo.");
        } finally {
            if (id === requestId.current) setIsLoading(false);
        }
    }, [range]);

    useEffect(() => {
        void load();
    }, [load]);

    usePageHeader({ title: "Riepilogo", subtitle: "Il giro dei lead: quanti entrano, quanti arrivano a ogni passo." });

    const delta = (cur: number, prev: number) => {
        const value = summaryDelta(cur, prev);
        return value === null ? undefined : { value, period: range.compareLabel };
    };

    const card = (label: string, cur: number, prev: number) => (
        <StatCard label={label} value={cur.toLocaleString("it-IT")} delta={delta(cur, prev)} loading={isLoading} />
    );

    const s = current;
    const p = previous;
    const lostStop = Number(s?.lost?.stop ?? 0);
    const lostObjection = Number(s?.lost?.obiezione ?? 0);

    const funnelItems = SUMMARY_FUNNEL.map(stage => ({ id: stage, label: CRM_STAGE_LABEL[stage], value: stageCount(s, stage) }));
    const sourceItems = (Object.entries(s?.leads_by_source ?? {}) as [CrmLeadSource, number][])
        .map(([source, n]) => ({ id: source, label: CRM_SOURCE_LABEL[source] ?? source, value: Number(n) }))
        .sort((a, b) => b.value - a.value);
    const pipelineItems = (Object.entries(s?.pipeline ?? {}) as [CrmStage, number][])
        .filter(([stage]) => stage !== "perso")
        .map(([stage, n]) => ({ id: stage, label: CRM_STAGE_LABEL[stage] ?? stage, value: Number(n) }))
        .sort((a, b) => b.value - a.value);

    return (
        <div className={styles.page}>
            <SegmentedControl
                value={period}
                onChange={setPeriod}
                options={PERIODS.map(value => ({ value, label: CRM_SUMMARY_PERIOD_LABEL[value] }))}
            />

            {error && (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                >
                    {error}
                </InlineBanner>
            )}

            {/* Con l'errore niente numeri: degli zeri sembrerebbero dati veri. */}
            {!error && (
                <>
                    <div className={styles.statGrid}>
                        {card("Lead entrati", Number(s?.leads_in ?? 0), Number(p?.leads_in ?? 0))}
                        {card("Contattati", Number(s?.contacted ?? 0), Number(p?.contacted ?? 0))}
                        {card("Telefonate fissate", stageCount(s, "telefonata_fissata"), stageCount(p, "telefonata_fissata"))}
                        {card("Telefonate fatte", stageCount(s, "telefonata_fatta"), stageCount(p, "telefonata_fatta"))}
                        {card("Demo fatte", stageCount(s, "demo_fatta"), stageCount(p, "demo_fatta"))}
                        {card("Clienti paganti", stageCount(s, "cliente_pagante"), stageCount(p, "cliente_pagante"))}
                    </div>

                    <Card title="Velocità e perdite">
                        <div className={styles.venueNameForm}>
                            <Text variant="body-sm">
                                Tempo dalla richiesta al primo contatto (mediana): {formatMinutes(s?.first_contact_minutes_median ?? null)}.
                            </Text>
                            <Text variant="body-sm">
                                Persi nel periodo: {lostObjection + lostStop} ({lostObjection} per obiezione, {lostStop} che non vogliono
                                essere contattati).
                            </Text>
                            <Text variant="body-sm">
                                Locali nuovi: {Number(s?.new_venues ?? 0)} · lead tornati: {Number(s?.returned ?? 0)}.
                            </Text>
                        </div>
                    </Card>

                    <Card title="Fasi raggiunte nel periodo" subtitle="Locali spostati in ogni fase nel periodo, una volta per locale. Chi salta una fase non la conta.">
                        <BarList items={funnelItems} loading={isLoading} aria-label="Fasi raggiunte nel periodo" />
                    </Card>

                    <Card title="Da dove arrivano">
                        <BarList
                            items={sourceItems}
                            loading={isLoading}
                            emptyTitle="Nessun lead nel periodo"
                            aria-label="Lead per fonte"
                        />
                    </Card>

                    <Card title="Pipeline adesso" subtitle="Non dipende dal periodo. Perso escluso.">
                        <BarList items={pipelineItems} loading={isLoading} aria-label="Locali per fase adesso" />
                    </Card>
                </>
            )}
        </div>
    );
}
