import { useEffect, useMemo, useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, History } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { TextInput } from "@/components/ui/Input/TextInput";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import type { LayoutRule, LayoutRuleOption, RuleType } from "@/services/supabase/layoutScheduling";
import { formatInactiveReason } from "@/utils/activityStatus";
import { parseRomeDateTimeLocal, romeDateTimeLocalValue, romeInstantAt } from "@/utils/romeInstant";
import { buildScheduleMatrix } from "@/utils/scheduleMatrix";
import { seatsToWatchFirst } from "@/utils/seatsToWatch";
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
    /** «Vai alla programmazione di <sede>»: la Programmazione della sede. */
    seatProgrammingHref: (activityId: string) => string;
    /** Le modifiche a mano per sede: l'ultimo passaggio. */
    manualCounts: Record<string, number> | null;
    /** La sede con cui si apre (quella della card «Adesso»); null = tutte. */
    initialActivityId: string | null;
    /** Si apre già su «Simula un altro momento» (dalla card di una sede). */
    initialSimulating: boolean;
    /** «Come funziona» della tab aperta (PG2: non più in fondo all'elenco). */
    helpRuleType: RuleType | "all";
    helpRef: Ref<HTMLButtonElement>;
    onHowItWorks: () => void;
}

/**
 * Il pannello «Cosa vedono i clienti» (correzioni UI PG4, PG5): fermo su
 * adesso, una riga per sede con i passaggi (prima quelle da guardare) e la
 * ricerca; toccando una sede i suoi passaggi, con l'andamento della giornata.
 * «Simula un altro momento» mette Giorno e Ora in testa, senza un secondo
 * pannello. Il calcolo è `buildScheduleMatrix` sulle regole della
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
    seatProgrammingHref,
    manualCounts,
    initialActivityId,
    initialSimulating,
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
    // Fermo su adesso finché non si chiede un altro momento.
    const [simulating, setSimulating] = useState(false);
    const [seatQuery, setSeatQuery] = useState("");
    const backToNow = () => {
        setSimulating(false);
        setSimDateTime(romeDateTimeLocalValue(new Date()));
    };

    // Si apre sulla sede della card «Adesso»; con una sede sola è già scelta.
    // Ogni apertura riparte da adesso.
    useEffect(() => {
        if (!open) return;
        setSimActivityId(activities.length === 1 ? activities[0].id : (initialActivityId ?? ""));
        setSimulating(initialSimulating);
        setSimDateTime(romeDateTimeLocalValue(new Date()));
        setSeatQuery("");
    }, [activities, initialActivityId, initialSimulating, open]);

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
            const query = seatQuery.trim().toLowerCase();
            const rows = seatsToWatchFirst(matrix.rows).filter(row => !query || row.name.toLowerCase().includes(query));
            return (
                <>
                    <TextInput
                        label="Cerca una sede"
                        type="search"
                        value={seatQuery}
                        onChange={event => setSeatQuery(event.target.value)}
                    />
                    {rows.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna sede con questo nome.
                        </Text>
                    ) : (
                        <SeatMatrix
                            rows={rows}
                            atNow={!simulating}
                            catalogLabel={catalogLabel}
                            catalogName={catalogName}
                            ruleHref={ruleHref}
                            onSeatSelect={setSimActivityId}
                        />
                    )}
                </>
            );
        }
        const row = matrix.rows[0];
        if (!row) return null;

        return (
            <>
                <div className={styles.seatNav}>
                    {activities.length > 1 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<ArrowLeft size={16} aria-hidden />}
                            onClick={() => setSimActivityId("")}
                        >
                            Tutte le sedi
                        </Button>
                    )}
                    <Link to={seatProgrammingHref(row.activityId)} className={styles.seatProgramming}>
                        Vai alla programmazione di {row.name}
                        <ArrowRight size={16} aria-hidden />
                    </Link>
                </div>
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
                            Cosa vedono i clienti
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {simulating
                                ? "Nel giorno e all'ora che scegli, passaggio per passaggio."
                                : `Adesso, ${simTime ?? ""}, passaggio per passaggio.`}
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
                        {simulating ? (
                            <>
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
                                <div>
                                    <Button variant="secondary" size="sm" onClick={backToNow}>
                                        Torna ad adesso
                                    </Button>
                                </div>
                                <Text variant="caption" colorVariant="muted">
                                    Sospensioni e abbonamento sono quelli di oggi.
                                </Text>
                            </>
                        ) : (
                            <div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<History size={16} aria-hidden />}
                                    onClick={() => setSimulating(true)}
                                >
                                    Simula un altro momento
                                </Button>
                            </div>
                        )}

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
