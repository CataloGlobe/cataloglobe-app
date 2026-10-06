import { useEffect, useMemo, useState, type Ref } from "react";
import { ChevronDown } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import type { LayoutRule, LayoutRuleOption, RuleType } from "@/services/supabase/layoutScheduling";
import { formatInactiveReason } from "@/utils/activityStatus";
import { parseRomeDateTimeLocal, romeDateTimeLocalValue, romeInstantAt } from "@/utils/romeInstant";
import { buildScheduleMatrix } from "@/utils/scheduleMatrix";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { buildDailyTimeline } from "../simulatorTimeline";
import { LayerSteps } from "./LayerSteps";
import { HowItWorksButton } from "./RuleTypeHelpModal";
import { matrixLayers } from "./matrixLayers";
import { SeatMatrix } from "./SeatMatrix";
import styles from "./RuleSimulatorDrawer.module.scss";

const DAILY_TIMELINE_STEP_MINUTES = 30;
const INVALID_DATE = "Data e ora non valide.";

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

export interface RuleSimulatorDrawerProps {
    open: boolean;
    onClose: () => void;
    rules: LayoutRule[];
    activities: LayoutRuleOption[];
    /** Membri dei gruppi di sedi: l'andamento gioca la competizione in memoria. */
    activityIdsByGroupId: Record<string, string[]>;
    catalogById: Map<string, LayoutRuleOption>;
    /** Abbonamento non attivo: la pagina pubblica non mostra il catalogo. */
    subscriptionInactive: boolean;
    ruleHref: (rule: { id: string; rule_type: RuleType }) => string;
    seatHref: (activityId: string) => string;
    /** Le modifiche a mano per sede: l'ultimo passaggio. */
    manualCounts: Record<string, number> | null;
    /** La sede con cui si apre (quella della card «Adesso»); null = tutte. */
    initialActivityId: string | null;
    /** «Come funziona» della tab aperta (PG2: non più in fondo all'elenco). */
    helpRuleType: RuleType | "all";
    helpRef: Ref<HTMLButtonElement>;
    onHowItWorks: () => void;
}

/**
 * Il simulatore (correzioni UI PG4): sede, giorno e ora; per una sede i
 * passaggi numerati con esito e regola, come la card «Adesso»; con «Tutte le
 * sedi» la matrice. Il calcolo è `buildScheduleMatrix` sulle regole della
 * pagina, la stessa competizione della pagina pubblica (il test del contratto
 * 13 lo tiene allineato al resolver): nessuna richiesta, e mostra le
 * modifiche a mano.
 */
export function RuleSimulatorDrawer({
    open,
    onClose,
    rules,
    activities,
    activityIdsByGroupId,
    catalogById,
    subscriptionInactive,
    ruleHref,
    seatHref,
    manualCounts,
    initialActivityId,
    helpRuleType,
    helpRef,
    onHowItWorks
}: RuleSimulatorDrawerProps) {
    const { catalogLabel } = useVerticalConfig();

    const [simActivityId, setSimActivityId] = useState("");
    // Stato sede selezionata: mirror di resolve-public-catalog
    // (`activity.status !== "active"` → pagina pubblica senza catalogo).
    const simActivity = activities.find(a => a.id === simActivityId) ?? null;
    const simActivityInactive = simActivity !== null && simActivity.status !== "active";
    // Il momento si legge e si scrive all'ora di Roma, come lo gioca il
    // resolver: il fuso del browser non sposta né il campo né il calcolo.
    const [simDateTime, setSimDateTime] = useState(() => romeDateTimeLocalValue(new Date()));
    const [timelineOpen, setTimelineOpen] = useState(false);
    const [simDay, simTime] = simDateTime.split("T");

    // Si apre sulla sede della card «Adesso»; con una sede sola è già scelta.
    useEffect(() => {
        if (!open) return;
        setSimActivityId(activities.length === 1 ? activities[0].id : (initialActivityId ?? ""));
    }, [activities, initialActivityId, open]);

    const ruleById = useMemo(() => new Map(rules.map(r => [r.id, r])), [rules]);

    const selected = useMemo(() => parseRomeDateTimeLocal(simDateTime), [simDateTime]);
    const matrix = useMemo(
        () =>
            open && selected
                ? buildScheduleMatrix({
                      rules,
                      activities,
                      activityIdsByGroupId,
                      manualCounts,
                      filterActivityId: simActivityId || null,
                      instant: selected,
                      subscriptionInactive
                  })
                : null,
        [activities, activityIdsByGroupId, manualCounts, open, rules, selected, simActivityId, subscriptionInactive]
    );
    const catalogName = (catalogId: string) => catalogById.get(catalogId)?.name;
    const layers = matrixLayers({ atNow: false, catalogLabel, catalogName, ruleHref });

    // L'andamento: 48 mezz'ore della sede, con la competizione della pagina
    // pubblica giocata in memoria sulle regole della pagina (nessuna
    // richiesta; prima erano 48 risoluzioni, ~800 richieste).
    const { timelineBlocks, timelineError } = useMemo(() => {
        if (!open || !timelineOpen || !simActivityId || !simDateTime) {
            return { timelineBlocks: [], timelineError: null };
        }
        const selected = parseRomeDateTimeLocal(simDateTime);
        if (!selected) {
            return { timelineBlocks: [], timelineError: INVALID_DATE };
        }
        // La giornata di Roma del momento scelto, dalla sua mezzanotte.
        const day = { year: selected.year, month: selected.month, day: selected.day };
        const slots = [];
        for (let minutes = 0; minutes < 24 * 60; minutes += DAILY_TIMELINE_STEP_MINUTES) {
            slots.push({ minutesOffset: minutes, now: romeInstantAt(day, minutes) });
        }
        const seat = {
            activityId: simActivityId,
            groupIds: Object.entries(activityIdsByGroupId)
                .filter(([, memberIds]) => memberIds.includes(simActivityId))
                .map(([groupId]) => groupId)
        };
        return {
            timelineBlocks: buildDailyTimeline(rules, seat, slots, DAILY_TIMELINE_STEP_MINUTES),
            timelineError: null
        };
    }, [open, timelineOpen, simActivityId, simDateTime, rules, activityIdsByGroupId]);

    const hasAnyRuleActiveInDay = timelineBlocks.some(
        block =>
            block.layoutScheduleId !== null ||
            block.priceRuleId !== null ||
            block.visibilityScheduleId !== null ||
            block.featuredScheduleId !== null
    );

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
        simActivity && activitySlug && selected ? (
            <Button
                variant="primary"
                disabled={previewBlockedReason !== null}
                onClick={() => {
                    const url = `/${activitySlug}?simulate=${new Date(selected.epoch).toISOString()}`;
                    window.open(url, "_blank");
                }}
            >
                Apri l'anteprima
            </Button>
        ) : null;

    const renderResult = () => {
        if (!selected || !matrix) {
            return <InlineBanner variant="error">{INVALID_DATE}</InlineBanner>;
        }
        if (!simActivityId) {
            return (
                <SeatMatrix
                    rows={matrix.rows}
                    atNow={false}
                    catalogLabel={catalogLabel}
                    catalogName={catalogName}
                    ruleHref={ruleHref}
                    seatHref={seatHref}
                />
            );
        }
        const row = matrix.rows[0];
        if (!row) return null;

        return (
            <>
                <LayerSteps row={row} layers={layers} catalogLabel={catalogLabel} narrow />

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
                        (timelineError ? (
                            <div className={styles.cardPad}>
                                <InlineBanner variant="error">{timelineError}</InlineBanner>
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
        <SystemDrawer open={open} onClose={onClose} size="lg" aria-labelledby="simulate-rules-title">
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text as="h3" variant="title-sm" id="simulate-rules-title">
                            Simula un altro momento
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Scegli sede, giorno e ora: vedi cosa vede il cliente, passaggio per passaggio.
                        </Text>
                        <div>
                            <HowItWorksButton ref={helpRef} ruleType={helpRuleType} onClick={onHowItWorks} />
                        </div>
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
                    <div className={styles.fields}>
                        <Select label="Sede" value={simActivityId} onChange={event => setSimActivityId(event.target.value)}>
                            {activities.length > 1 && <option value="">Tutte le sedi</option>}
                            {activities.map(activity => (
                                <option key={activity.id} value={activity.id}>
                                    {activity.name}
                                </option>
                            ))}
                        </Select>

                        <TextInput
                            label="Giorno"
                            type="date"
                            value={simDay ?? ""}
                            onChange={event => setSimDateTime(`${event.target.value}T${simTime ?? ""}`)}
                            required
                        />
                        <TextInput
                            label="Ora"
                            type="time"
                            value={simTime ?? ""}
                            onChange={event => setSimDateTime(`${simDay ?? ""}T${event.target.value}`)}
                            required
                        />

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
                    </div>

                    {renderResult()}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
