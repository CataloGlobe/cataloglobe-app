// Il passo «Dove e quando» della sezione Aggiungi / Modifica completa, e il
// Quando da solo (una sede): li usano la sezione del Calendario e i tunnel di creazione.
import { useId, useMemo, useState, type ReactNode } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DB_LATER, NEW_MODEL, invalid, isoDay, listIt, normRanges, sediOf, syncPer, whenKey, type Draft, type DraftLookups } from "./calendarDraft";
import { FSLOT, dayNum, durLabel, hhmm, type Axis, type CalWhen, type CalWhere } from "./calendarModel";
import { SediBottone } from "@/components/ui/SediPannello/SediPannello";
import { Band, TimeSel } from "./CalendarioOrario";
import s from "./CalendarioView.module.scss";

export type PassoSede = { id: string; name: string };
export type PassoGruppo = { id: string; name: string; activityIds: string[] };
type Upd = (fn: (d: Draft) => void) => void;

export type QuandoPassoProps = {
    draft: Draft;
    upd: Upd;
    /** Le durate che ci sono già, da riusare con un tocco (prima quelle dello stesso tipo). */
    durs: readonly CalWhen[];
    /** Le ore della barra delle fasce. */
    axis: Axis;
    /** Quello che non va (da `invalid`): qui si mostra la parte che tocca il Quando. */
    bad: string;
};

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/* ---------- Quando ---------- */
export function QuandoPasso({ draft: d, upd, durs, axis, bad }: QuandoPassoProps) {
    const w = d.when, cur = whenKey(w), days = w.days ?? [0, 1, 2, 3, 4, 5, 6];
    const dk = !w.days ? "all" : w.days.join("") === "01234" ? "w5" : w.days.join("") === "56" ? "we" : "";
    const today = todayNum();
    const setDays = (ds: number[] | undefined) =>
        upd(dd => {
            if (!ds || ds.length === 7) delete dd.when.days;
            else dd.when.days = ds;
        });
    return (
        <>
            {durs.length > 0 && (
                <div className={s.ifl}>
                    <h4>Usa una durata che c'è già</h4>
                    <div className={s.chips}>
                        {durs.map(ww => (
                            <button key={whenKey(ww)} type="button" className={s.chip} aria-pressed={whenKey(ww) === cur} onClick={() => upd(dd => void (dd.when = structuredClone(ww)))}>
                                {durLabel(ww)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className={s.ifl}>
                <h4>Periodo</h4>
                <SegmentedControl
                    size="sm"
                    value={w.period ? "periodo" : "sempre"}
                    onChange={v =>
                        upd(dd => {
                            if (v === "periodo") dd.when.period ??= { from: today, to: today + 30 };
                            else delete dd.when.period;
                        })
                    }
                    options={[
                        { value: "sempre", label: "Sempre" },
                        { value: "periodo", label: "Dal… al…" }
                    ]}
                />
                {w.period ? (
                    <div className={s.hrowf}>
                        <label className={s.hfld}>
                            Dal{" "}
                            <input type="date" className={s.hin} value={isoDay(w.period.from)} onChange={ev => setDate("from", ev.target.value)} />
                        </label>
                        <label className={s.hfld}>
                            al <input type="date" className={s.hin} value={isoDay(w.period.to)} onChange={ev => setDate("to", ev.target.value)} />
                        </label>
                    </div>
                ) : (
                    <p className={s.muted}>Senza una data di fine.</p>
                )}
                {bad && bad.startsWith("La fine") && <Warn>{bad}.</Warn>}
            </div>
            <div className={s.ifl}>
                <h4>Giorni</h4>
                <div className={s.chips}>
                    {(
                        [
                            ["all", "Tutti", undefined],
                            ["w5", "Lun–Ven", [0, 1, 2, 3, 4]],
                            ["we", "Sab e Dom", [5, 6]]
                        ] as const
                    ).map(([v, l, ds]) => (
                        <button key={v} type="button" className={s.chip} aria-pressed={dk === v} onClick={() => setDays(ds ? [...ds] : undefined)}>
                            {l}
                        </button>
                    ))}
                </div>
                <div className={s.chips} role="group" aria-label="Giorni">
                    {DAYS.map((n, i) => (
                        <button
                            key={n}
                            type="button"
                            className={s.chip}
                            aria-pressed={days.includes(i)}
                            onClick={() => {
                                const ds = [...days], j = ds.indexOf(i);
                                if (j < 0) ds.push(i);
                                else if (ds.length > 1) ds.splice(j, 1);
                                setDays(ds.sort((a, b) => a - b));
                            }}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>
            <div className={s.ifl}>
                <h4>Orario</h4>
                <SegmentedControl
                    size="sm"
                    value={w.ranges ? "0" : "1"}
                    onChange={v =>
                        upd(dd => {
                            if (v === "1") delete dd.when.ranges;
                            else dd.when.ranges = [[12 * 60, 15 * 60]];
                        })
                    }
                    options={[
                        { value: "1", label: "Tutto il giorno" },
                        { value: "0", label: "Fasce orarie" }
                    ]}
                />
                {w.ranges?.map((r, j) => (
                    <div key={j} className={`${s.hrowf} ${s.irange}`}>
                        <label className={s.hfld}>
                            Dalle <TimeSel v={r[0]} max={1440 - FSLOT} onChange={m => upd(dd => void (dd.when.ranges![j][0] = m))} />
                        </label>
                        <label className={s.hfld}>
                            alle <TimeSel v={r[1]} min={FSLOT} max={1440} onChange={m => upd(dd => void (dd.when.ranges![j][1] = m))} />
                        </label>
                        {w.ranges!.length > 1 && (
                            <IconButton size="sm" icon={<X size={14} />} aria-label={`Togli la fascia ${hhmm(r[0])}–${hhmm(r[1])}`} onClick={() => upd(dd => void dd.when.ranges!.splice(j, 1))} />
                        )}
                    </div>
                ))}
                {w.ranges && w.ranges.length < 4 && (
                    <span className={s.ilaterrow}>
                        <Button size="sm" variant="ghost" className={s.ilink} leftIcon={<Plus size={16} />} disabled={!NEW_MODEL.multiRange} onClick={addRange}>
                            Aggiungi una fascia
                        </Button>
                        {!NEW_MODEL.multiRange && <span className={s.muted}>Più fasce {DB_LATER}.</span>}
                    </span>
                )}
                <Band w={w} axis={axis} upd={upd} />
                {w.ranges && (
                    <p className={s.muted}>
                        Trascina le barre per spostare le fasce, a 15 minuti per volta.{" "}
                        {NEW_MODEL.overnight ? "Anche dopo mezzanotte: fino alle 02:00 è la stessa serata." : `Dopo mezzanotte ${DB_LATER}.`}
                    </p>
                )}
                {bad && bad.startsWith("Una fascia") && <Warn>{bad}.</Warn>}
            </div>
        </>
    );
    function setDate(edge: "from" | "to", v: string) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (!m) return;
        const n = dayNum(+m[1], +m[2] - 1, +m[3]);
        upd(dd => {
            if (dd.when.period) dd.when.period[edge] = n;
        });
    }
    function addRange() {
        upd(dd => {
            const rs = dd.when.ranges!, e = Math.max(...rs.map(r => r[1]));
            rs.push(e <= 18 * 60 ? [19 * 60, 22 * 60] : [Math.min(e + 60, 1440 - 60), Math.min(e + 180, 1440)]);
            normRanges(rs);
        });
    }
}

/* ---------- Dove e quando (D145, G1) ---------- */
export type DoveQuandoProps = QuandoPassoProps & {
    sedi: readonly PassoSede[];
    groups: readonly PassoGruppo[];
    L: DraftLookups;
    /** Il Quando con le stesse ore per tutte; senza, `QuandoPasso`. Il tunnel ci mette anche «Sempre». */
    quando?: ReactNode;
    /** false: niente «hanno le stesse ore?» (la storia, che oggi ha un orario solo). */
    split?: boolean;
};

/**
 * Un passo solo: in cima le sedi col bottone «Sedi» del Calendario, sotto le ore.
 * Con più sedi si chiede se hanno le stesse ore; se no, una riga per sede con
 * le sue ore, che si apre sul posto col Quando di sempre (F1).
 */
export function DoveQuandoPasso({ draft: d, upd, sedi, groups, L, bad, durs, axis, quando, split: canSplit = true }: DoveQuandoProps) {
    const hid = useId();
    const [open, setOpen] = useState<string | null>(null);
    const ids = sediOf(d.where, sedi, groups);
    const name = (id: string) => sedi.find(x => x.id === id)?.name ?? "sede";
    const w = d.where;
    const group = !w.all && !w.activityIds.length && w.groupIds.length ? w.groupIds : null;
    const label = w.all
        ? `Tutte le sedi · ${sedi.length}, anche le nuove`
        : group
          ? listIt(group.map(g => "«" + (L.groups.get(g) ?? "gruppo") + "»")) + ` · ${ids.length} ${ids.length === 1 ? "sede" : "sedi"}`
          : undefined;
    const setWhere = (next: CalWhere) =>
        upd(dd => {
            dd.where = next;
            dd.per = syncPer(dd.per, sediOf(next, sedi, groups), dd.when);
        });
    // tutte prese = tutte, anche quelle che si aggiungeranno; un gruppo intero = il gruppo, anche chi ci entrerà
    const pick = (next: string[]) => {
        if (sedi.length > 1 && next.length === sedi.length) return setWhere({ all: true, activityIds: [], groupIds: [] });
        const g = groups.find(x => x.activityIds.length > 1 && x.activityIds.length === next.length && x.activityIds.every(id => next.includes(id)));
        setWhere(g ? { all: false, activityIds: [], groupIds: [g.id] } : { all: false, activityIds: next, groupIds: [] });
    };
    const gruppi = useMemo(() => groups.map(g => ({ id: g.id, name: g.name, sedeIds: g.activityIds })), [groups]);
    const split = (on: boolean) => {
        setOpen(null);
        upd(dd => {
            dd.per = on ? Object.fromEntries(sediOf(dd.where, sedi, groups).map(id => [id, structuredClone(dd.when)])) : null;
        });
    };
    // il Quando di una sede: la stessa bozza, col suo quando al posto di quello di tutte
    const updPer =
        (id: string): Upd =>
        fn =>
            upd(dd => {
                if (!dd.per?.[id]) return;
                const one = { ...dd, when: dd.per[id] };
                fn(one);
                dd.per[id] = one.when;
            });
    const who = ids.length > 3 ? `Le ${ids.length} sedi` : listIt(ids.map(name));
    return (
        <>
            <div className={s.ifl}>
                <h4 id={hid}>Dove</h4>
                <SediBottone className={s.dqsedi} sedi={sedi} gruppi={gruppi} value={ids} onChange={pick} future>
                    {label}
                </SediBottone>
                <p className={s.muted}>
                    {w.all
                        ? "Vale anche per le sedi che aprirai."
                        : group
                          ? "Vale anche per le sedi che entreranno nel gruppo. Se cambi le sedi qui, valgono quelle scelte."
                          : "Quello che vale per una sede vince su quello che vale per tutte."}
                </p>
                {bad === "Scegli almeno una sede" && <Warn>{bad}.</Warn>}
            </div>
            {canSplit && ids.length > 1 && (
                <div className={s.ifl}>
                    <h4>{who} hanno le stesse ore?</h4>
                    <SegmentedControl
                        size="sm"
                        value={d.per ? "no" : "si"}
                        onChange={v => split(v === "no")}
                        options={[
                            { value: "si", label: "Sì, le stesse" },
                            { value: "no", label: "No, cambiano" }
                        ]}
                    />
                </div>
            )}
            {!d.per ? (
                quando ?? <QuandoPasso draft={d} upd={upd} durs={durs} axis={axis} bad={bad} />
            ) : (
                <div className={s.ifl}>
                    <h4>Le ore di ogni sede</h4>
                    <p className={s.muted}>{open ? "Le ore di " + name(open) + ": cambiano solo lì." : "Ogni sede parte dalle ore scelte per tutte. Apri quella da cambiare."}</p>
                    <div className={s.dqrows}>
                        {Object.entries(d.per).map(([id, pw]) => (
                            <div key={id} className={s.dqrow} data-open={open === id || undefined}>
                                <button type="button" className={s.dqhd} aria-expanded={open === id} onClick={() => setOpen(o => (o === id ? null : id))}>
                                    <b>{name(id)}</b>
                                    <span>{durLabel(pw)}</span>
                                    <em>{open === id ? "Chiudi" : "Cambia"}</em>
                                </button>
                                {open === id && (
                                    <div className={s.dqin}>
                                        <QuandoPasso draft={{ ...d, when: pw }} upd={updPer(id)} durs={durs} axis={axis} bad={invalid({ ...d, per: null, when: pw })} />
                                        <p className={s.dqcopy}>
                                            Uguale a:{" "}
                                            {Object.keys(d.per!)
                                                .filter(x => x !== id)
                                                .map((x, k) => (
                                                    <span key={x}>
                                                        {k > 0 && " · "}
                                                        <button
                                                            type="button"
                                                            className={s.dqlink}
                                                            onClick={() =>
                                                                upd(dd => {
                                                                    if (dd.per?.[x]) dd.per[id] = structuredClone(dd.per[x]);
                                                                })
                                                            }
                                                        >
                                                            {name(x)}
                                                        </button>
                                                    </span>
                                                ))}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {bad && bad !== "Scegli almeno una sede" && <Warn>{bad}.</Warn>}
                </div>
            )}
        </>
    );
}

const todayNum = () => {
    const r = new Date();
    return dayNum(r.getFullYear(), r.getMonth(), r.getDate());
};

export function Warn({ children }: { children: ReactNode }) {
    return (
        <p className={s.hwarn}>
            <TriangleAlert size={15} aria-hidden />
            <span>{children}</span>
        </p>
    );
}
