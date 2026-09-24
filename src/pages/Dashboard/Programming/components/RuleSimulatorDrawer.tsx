import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { FormGrid } from "@/components/ui/FormGrid/FormGrid";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { supabase } from "@/services/supabase/client";
import { resolveRulesForActivity, type ResolveRulesForActivityResult } from "@/services/supabase/scheduleResolver";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import type { LayoutRule, LayoutRuleOption, RuleType } from "@/services/supabase/layoutScheduling";
import { formatInactiveReason } from "@/utils/activityStatus";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "../ruleTypeLabel";
import styles from "./RuleSimulatorDrawer.module.scss";

type DailyTimelineBlock = {
    startMinutes: number;
    endMinutes: number;
    layoutCatalogId: string | null;
    layoutScheduleId: string | null;
    priceRuleId: string | null;
    visibilityScheduleId: string | null;
    visibilityMode: "hide" | "disable" | null;
    featuredScheduleId: string | null;
    layoutSpecificity: number | null;
    priceSpecificity: number | null;
    visibilitySpecificity: number | null;
};

const DAILY_TIMELINE_STEP_MINUTES = 30;
const SIM_ERROR = "Non riusciamo a simulare questo momento.";
const TIMELINE_ERROR = "Non riusciamo a calcolare l'andamento della giornata.";
const INVALID_DATE = "Data e ora non valide.";

function toDateTimeLocalValue(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function getSpecificityLabel(value: number | null) {
    if (value === 2) return "Sede";
    if (value === 1) return "Gruppo di sedi";
    if (value === 0) return "Tutte le sedi";
    return null;
}

function formatMinutesToHourLabel(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

function blockKey(block: Omit<DailyTimelineBlock, "startMinutes" | "endMinutes">): string {
    return [
        block.layoutCatalogId ?? "",
        block.layoutScheduleId ?? "",
        block.priceRuleId ?? "",
        block.visibilityScheduleId ?? "",
        block.visibilityMode ?? "",
        block.featuredScheduleId ?? "",
        String(block.layoutSpecificity ?? ""),
        String(block.priceSpecificity ?? ""),
        String(block.visibilitySpecificity ?? "")
    ].join("|");
}

export interface RuleSimulatorDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    rules: LayoutRule[];
    activities: LayoutRuleOption[];
    catalogById: Map<string, LayoutRuleOption>;
    /** Abbonamento non attivo: la pagina pubblica non mostra il catalogo. */
    subscriptionInactive: boolean;
    ruleHref: (rule: { id: string; rule_type: RuleType }) => string;
}

/**
 * «Simula regole» (§20.3, passo 2 P6): una sede e un momento, e per ogni tipo
 * la regola che vince. Il calcolo è quello della pagina pubblica
 * (`resolveRulesForActivity`), invariato; qui cambiano taglia e pelle. Gli
 * errori sono uno stato del drawer, non un toast.
 */
export function RuleSimulatorDrawer({
    open,
    onClose,
    tenantId,
    rules,
    activities,
    catalogById,
    subscriptionInactive,
    ruleHref
}: RuleSimulatorDrawerProps) {
    const { catalogLabel } = useVerticalConfig();

    const [simActivityId, setSimActivityId] = useState("");
    // Stato sede selezionata: mirror di resolve-public-catalog
    // (`activity.status !== "active"` → pagina pubblica senza catalogo).
    const simActivity = activities.find(a => a.id === simActivityId) ?? null;
    const simActivityInactive = simActivity !== null && simActivity.status !== "active";
    const [simDateTime, setSimDateTime] = useState(() => toDateTimeLocalValue(new Date()));
    const [simResult, setSimResult] = useState<ResolveRulesForActivityResult | null>(null);
    const [isSimLoading, setIsSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);
    const [timelineOpen, setTimelineOpen] = useState(false);
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [timelineError, setTimelineError] = useState<string | null>(null);
    const [timelineBlocks, setTimelineBlocks] = useState<DailyTimelineBlock[]>([]);

    // Una sede sola: è già scelta.
    useEffect(() => {
        if (activities.length === 1 && !simActivityId) setSimActivityId(activities[0].id);
    }, [activities, simActivityId]);

    const ruleById = useMemo(() => new Map(rules.map(r => [r.id, r])), [rules]);

    const runSimulation = useCallback(async () => {
        if (!simActivityId || !simDateTime) {
            setSimResult(null);
            setSimError(null);
            return;
        }
        const selectedDate = new Date(simDateTime);
        if (Number.isNaN(selectedDate.getTime())) {
            setSimResult(null);
            setSimError(INVALID_DATE);
            return;
        }
        try {
            setIsSimLoading(true);
            setSimError(null);
            const result = await resolveRulesForActivity({
                supabase,
                activityId: simActivityId,
                tenantId,
                now: toRomeDateTime(selectedDate),
                includeLayoutStyle: true
            });
            setSimResult(result);
        } catch (error) {
            console.error("Errore simulazione regole:", error);
            setSimResult(null);
            setSimError(SIM_ERROR);
        } finally {
            setIsSimLoading(false);
        }
    }, [simActivityId, simDateTime, tenantId]);

    const runDailyTimeline = useCallback(async () => {
        if (!simActivityId || !simDateTime) {
            setTimelineBlocks([]);
            setTimelineError(null);
            return;
        }
        const selectedDate = new Date(simDateTime);
        if (Number.isNaN(selectedDate.getTime())) {
            setTimelineBlocks([]);
            setTimelineError(INVALID_DATE);
            return;
        }
        const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
        const slotOffsets: number[] = [];
        for (let minutes = 0; minutes < 24 * 60; minutes += DAILY_TIMELINE_STEP_MINUTES) {
            slotOffsets.push(minutes);
        }

        setIsTimelineLoading(true);
        setTimelineError(null);

        const settled = await Promise.allSettled(
            slotOffsets.map(async minutesOffset => {
                const slotTime = new Date(dayStart);
                slotTime.setMinutes(minutesOffset);
                const result = await resolveRulesForActivity({
                    supabase,
                    activityId: simActivityId,
                    tenantId,
                    now: toRomeDateTime(slotTime),
                    includeLayoutStyle: false
                });
                return {
                    minutesOffset,
                    layoutCatalogId: result.layout.catalogId,
                    layoutScheduleId: result.layout.scheduleId,
                    priceRuleId: result.priceRuleId,
                    visibilityScheduleId: result.visibilityRule?.scheduleId ?? null,
                    visibilityMode: result.visibilityRule?.mode ?? null,
                    featuredScheduleId: result.featuredRule?.scheduleId ?? null,
                    layoutSpecificity: result.debug?.selectedLayoutRuleSpecificity ?? null,
                    priceSpecificity: result.debug?.selectedPriceRuleSpecificity ?? null,
                    visibilitySpecificity: result.debug?.selectedVisibilityRuleSpecificity ?? null
                };
            })
        );

        const slotResults = settled
            .filter((r): r is PromiseFulfilledResult<typeof settled extends PromiseSettledResult<infer T>[] ? T : never> => r.status === "fulfilled")
            .map(r => r.value);

        const failedCount = settled.length - slotResults.length;
        if (failedCount > 0) {
            console.warn(`Timeline: ${failedCount}/${settled.length} slot falliti`);
        }
        if (slotResults.length === 0) {
            setTimelineBlocks([]);
            setTimelineError(TIMELINE_ERROR);
            setIsTimelineLoading(false);
            return;
        }

        const merged: DailyTimelineBlock[] = [];
        for (const slot of slotResults) {
            const last = merged[merged.length - 1];
            if (last && blockKey(last) === blockKey(slot) && last.endMinutes === slot.minutesOffset) {
                last.endMinutes += DAILY_TIMELINE_STEP_MINUTES;
                continue;
            }
            const { minutesOffset, ...rest } = slot;
            merged.push({ ...rest, startMinutes: minutesOffset, endMinutes: minutesOffset + DAILY_TIMELINE_STEP_MINUTES });
        }

        setTimelineBlocks(merged);
        setIsTimelineLoading(false);
    }, [simActivityId, simDateTime, tenantId]);

    const hasAnyRuleActiveInDay = timelineBlocks.some(
        block =>
            block.layoutScheduleId !== null ||
            block.priceRuleId !== null ||
            block.visibilityScheduleId !== null ||
            block.featuredScheduleId !== null
    );

    useEffect(() => {
        if (!open) return;
        if (!simActivityId || !simDateTime) return;
        void runSimulation();
    }, [open, simActivityId, simDateTime, runSimulation]);

    // L'andamento sono 48 simulazioni (una ogni mezz'ora, ~800 richieste):
    // si calcola quando la card è aperta, non a ogni scelta di sede.
    useEffect(() => {
        if (!open || !timelineOpen) return;
        if (!simActivityId || !simDateTime) return;
        void runDailyTimeline();
    }, [open, timelineOpen, simActivityId, simDateTime, runDailyTimeline]);

    const retry = () => {
        void runSimulation();
        if (timelineOpen) void runDailyTimeline();
    };

    // L'anteprima apre la pagina pubblica: negli stessi casi in cui
    // resolve-public-catalog non serve il catalogo il link sarebbe
    // fuorviante. La simulazione resta calcolata.
    const previewBlockedReason = subscriptionInactive
        ? "Anteprima non disponibile: l'abbonamento non è attivo, la pagina pubblica non mostra il catalogo."
        : simActivityInactive
          ? "Anteprima non disponibile: la sede è sospesa, la pagina pubblica non mostra il catalogo."
          : null;
    const activitySlug = simActivity?.slug;
    const previewButton =
        simResult && activitySlug && simDateTime ? (
            <Button
                variant="primary"
                disabled={previewBlockedReason !== null}
                onClick={() => {
                    const url = `/${activitySlug}?simulate=${new Date(simDateTime).toISOString()}`;
                    window.open(url, "_blank");
                }}
            >
                Apri l'anteprima
            </Button>
        ) : null;

    /** Una riga per tipo: la regola che vince (o nessuna), apribile. */
    const layerRow = (type: RuleType, ruleId: string | null | undefined, meta: string | null) => {
        const rule = ruleId ? ruleById.get(ruleId) : undefined;
        const title = type === "featured" ? "In evidenza" : ruleTypeLabel(type, catalogLabel);
        const common = {
            title,
            subtitle: rule?.name ?? ruleId ?? "Nessuna regola",
            meta: meta ? <Text as="span" variant="caption" colorVariant="muted">{meta}</Text> : undefined,
            muted: !ruleId
        };
        return rule ? (
            <ListRow key={type} {...common} to={ruleHref(rule)} trailing={<ChevronRight size={16} aria-hidden="true" />} />
        ) : (
            <ListRow key={type} {...common} />
        );
    };

    const renderResult = () => {
        if (!simActivityId || !simDateTime) {
            return (
                <Text variant="body-sm" colorVariant="muted">
                    Scegli sede e momento.
                </Text>
            );
        }
        if (simError) {
            return (
                <InlineBanner
                    variant="error"
                    action={
                        simError === SIM_ERROR ? (
                            <Button variant="secondary" size="sm" onClick={retry}>
                                Riprova
                            </Button>
                        ) : undefined
                    }
                >
                    {simError}
                </InlineBanner>
            );
        }
        if (isSimLoading || !simResult) {
            return (
                <Card flush>
                    {[0, 1, 2, 3].map(i => (
                        <ListRow key={i} loading />
                    ))}
                </Card>
            );
        }

        const featuredRule = simResult.featuredRule?.scheduleId ? ruleById.get(simResult.featuredRule.scheduleId) : undefined;
        const priceRule = simResult.priceRuleId ? ruleById.get(simResult.priceRuleId) : undefined;
        const visRule = simResult.visibilityRule?.scheduleId ? ruleById.get(simResult.visibilityRule.scheduleId) : undefined;
        const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
        const catalogName = simResult.layout.catalogId
            ? (catalogById.get(simResult.layout.catalogId)?.name ?? simResult.layout.catalogId)
            : null;

        return (
            <>
                <Card flush>
                    {layerRow("layout", simResult.layout.scheduleId, catalogName ? `${catalogLabel}: ${catalogName}` : null)}
                    {layerRow(
                        "featured",
                        simResult.featuredRule?.scheduleId,
                        featuredRule ? count(featuredRule.featured_contents.length, "contenuto", "contenuti") : null
                    )}
                    {layerRow("price", simResult.priceRuleId, priceRule ? count(priceRule.price_overrides.length, "prodotto", "prodotti") : null)}
                    {layerRow(
                        "visibility",
                        simResult.visibilityRule?.scheduleId,
                        visRule ? count(visRule.visibility_overrides.length, "prodotto", "prodotti") : null
                    )}
                </Card>

                <Card
                    flush
                    title="Andamento della giornata"
                    actions={
                        <IconButton
                            icon={<ChevronDown size={16} className={timelineOpen ? styles.chevronOpen : styles.chevronClosed} />}
                            variant="ghost"
                            size="sm"
                            aria-expanded={timelineOpen}
                            aria-label={`${timelineOpen ? "Nascondi" : "Mostra"} Andamento della giornata`}
                            onClick={() => setTimelineOpen(prev => !prev)}
                        />
                    }
                >
                    {timelineOpen &&
                        (isTimelineLoading ? (
                            [0, 1, 2].map(i => <ListRow key={i} loading dense />)
                        ) : timelineError ? (
                            <div className={styles.cardPad}>
                                <InlineBanner
                                    variant="error"
                                    action={
                                        timelineError === TIMELINE_ERROR ? (
                                            <Button variant="secondary" size="sm" onClick={() => void runDailyTimeline()}>
                                                Riprova
                                            </Button>
                                        ) : undefined
                                    }
                                >
                                    {timelineError}
                                </InlineBanner>
                            </div>
                        ) : timelineBlocks.length === 0 || !hasAnyRuleActiveInDay ? (
                            <div className={styles.cardPad}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessuna regola attiva durante la giornata.
                                </Text>
                            </div>
                        ) : (
                            timelineBlocks.map(block => {
                                const where = getSpecificityLabel(block.layoutSpecificity);
                                const featuredName = block.featuredScheduleId
                                    ? (ruleById.get(block.featuredScheduleId)?.name ?? "attiva")
                                    : null;
                                return (
                                    <ListRow
                                        key={`${block.startMinutes}-${block.endMinutes}`}
                                        dense
                                        title={`${formatMinutesToHourLabel(block.startMinutes)}–${formatMinutesToHourLabel(block.endMinutes)}`}
                                        subtitle={
                                            block.layoutCatalogId
                                                ? (catalogById.get(block.layoutCatalogId)?.name ?? block.layoutCatalogId)
                                                : `Nessun ${catalogLabel.toLowerCase()}`
                                        }
                                        meta={
                                            <span className={styles.badges}>
                                                {where && <Badge variant="neutral">{where}</Badge>}
                                                {block.visibilityMode === "hide" && <Badge variant="neutral">Nascosti</Badge>}
                                                {block.visibilityMode === "disable" && <Badge variant="warning">Non disponibili</Badge>}
                                                {block.priceRuleId && <Badge variant="neutral">Prezzi</Badge>}
                                                {featuredName && <Badge variant="neutral">In evidenza: {featuredName}</Badge>}
                                            </span>
                                        }
                                    />
                                );
                            })
                        ))}
                </Card>
            </>
        );
    };

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby="simulate-rules-title">
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text as="h3" variant="title-sm" id="simulate-rules-title">
                            Simula regole
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Scegli una sede e un momento: vedi cosa decide ogni regola.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                        {previewButton &&
                            (previewBlockedReason ? (
                                // Un <button disabled> non emette eventi pointer: il
                                // wrapper focusabile fa da trigger al tooltip.
                                <Tooltip content={previewBlockedReason}>
                                    <span className={styles.tooltipWrap} tabIndex={0}>
                                        {previewButton}
                                    </span>
                                </Tooltip>
                            ) : (
                                previewButton
                            ))}
                    </>
                }
            >
                <div className={styles.body}>
                    <FormGrid>
                        <Select label="Sede" value={simActivityId} onChange={event => setSimActivityId(event.target.value)} required>
                            <option value="" disabled>
                                Seleziona una sede
                            </option>
                            {activities.map(activity => (
                                <option key={activity.id} value={activity.id}>
                                    {activity.name}
                                </option>
                            ))}
                        </Select>

                        {simActivity && (
                            <div className={styles.statusRow}>
                                <Text variant="caption" colorVariant="muted">
                                    Stato sede
                                </Text>
                                {simActivityInactive ? (
                                    <StatusBadge variant="neutral" label={formatInactiveReason(simActivity.inactive_reason ?? null)} />
                                ) : (
                                    <StatusBadge variant="success" label="Pubblicata" />
                                )}
                            </div>
                        )}

                        {simActivity && subscriptionInactive && (
                            <InlineBanner variant="warning">
                                Abbonamento non attivo: la pagina pubblica di questa sede non mostra il catalogo finché
                                l'abbonamento non viene riattivato. La simulazione e l'anteprima restano disponibili.
                            </InlineBanner>
                        )}

                        {simActivity && simActivityInactive && !subscriptionInactive && (
                            <InlineBanner variant="warning">
                                Sede sospesa: la pagina pubblica mostra solo le informazioni della sede, senza catalogo.
                                La simulazione e l'anteprima restano disponibili.
                            </InlineBanner>
                        )}

                        <TextInput
                            label="Data e ora"
                            type="datetime-local"
                            value={simDateTime}
                            onChange={event => setSimDateTime(event.target.value)}
                            required
                        />
                    </FormGrid>

                    {renderResult()}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
