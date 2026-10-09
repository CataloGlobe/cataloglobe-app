// I passi «Quando» e «Dove» della sezione Aggiungi / Modifica completa, da soli:
// li usano la sezione del Calendario e i tunnel di creazione.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Folder, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DB_LATER, DB_TODAY, isoDay, normRanges, whenKey, whereText, type Draft, type DraftLookups } from "./calendarDraft";
import { FSLOT, dayNum, durLabel, hhmm, type Axis, type CalWhen } from "./calendarModel";
import { SediPannello } from "./SediScelta";
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

export type DovePassoProps = {
    draft: Draft;
    upd: Upd;
    sedi: readonly PassoSede[];
    groups: readonly PassoGruppo[];
    L: DraftLookups;
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
                        <Button size="sm" variant="ghost" className={s.ilink} leftIcon={<Plus size={16} />} disabled={!DB_TODAY.multiRange} onClick={addRange}>
                            Aggiungi una fascia
                        </Button>
                        {!DB_TODAY.multiRange && <span className={s.muted}>Più fasce {DB_LATER}.</span>}
                    </span>
                )}
                <Band w={w} axis={axis} upd={upd} />
                {w.ranges && (
                    <p className={s.muted}>
                        Trascina le barre per spostare le fasce, a 15 minuti per volta.{" "}
                        {DB_TODAY.overnight ? "Anche dopo mezzanotte: fino alle 02:00 è la stessa serata." : `Dopo mezzanotte ${DB_LATER}.`}
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

/* ---------- Dove ---------- */
type DoveModo = "all" | "group" | "some";

/**
 * Il passo «Dove» (D130 A): tre scelte, e sotto «Sedi scelte» il pannello
 * delle sedi già aperto. Un gruppo scelto come tale vale anche per le sedi
 * che entreranno; «Prendi le sedi di:» spunta solo quelle di oggi.
 */
export function DovePasso({ draft: d, upd, sedi, groups, L, bad }: DovePassoProps) {
    const w = d.where;
    const hid = useId();
    const [modo, setModo] = useState<DoveModo>(() => (w.all ? "all" : w.groupIds.length && !w.activityIds.length ? "group" : "some"));
    // le sedi scelte a mano restano lì se si passa a un'altra scelta e si torna
    const lastSeats = useRef<string[]>(w.activityIds);
    const lastGroups = useRef<string[]>(w.groupIds);
    if (!w.all && w.activityIds.length) lastSeats.current = w.activityIds;
    if (!w.all && w.groupIds.length) lastGroups.current = w.groupIds;
    // una bozza che cambia da fuori (ripresa, tenuta da parte) porta con sé la sua scelta
    const shape: DoveModo = w.all ? "all" : w.activityIds.length ? "some" : w.groupIds.length ? "group" : modo;
    useEffect(() => setModo(shape), [shape]);

    const pick = (m: DoveModo) => {
        setModo(m);
        if (m === "all") return upd(dd => void (dd.where = { all: true, activityIds: [], groupIds: [] }));
        if (m === "group") {
            const g = lastGroups.current.length ? lastGroups.current : groups.slice(0, 1).map(x => x.id);
            return upd(dd => void (dd.where = { all: false, activityIds: [], groupIds: [...g] }));
        }
        // dal gruppo si parte dalle sue sedi di oggi, per ritoccarle
        const fromGroup = w.groupIds.length ? sedi.filter(x => groups.some(g => w.groupIds.includes(g.id) && g.activityIds.includes(x.id))).map(x => x.id) : [];
        const seats = w.activityIds.length ? w.activityIds : fromGroup.length ? fromGroup : lastSeats.current;
        upd(dd => void (dd.where = { all: false, activityIds: [...seats], groupIds: [] }));
    };
    const toggleGroup = (id: string) =>
        upd(dd => {
            const on = dd.where.groupIds.includes(id);
            dd.where = { all: false, activityIds: [], groupIds: on ? dd.where.groupIds.filter(x => x !== id) : groups.filter(g => g.id === id || dd.where.groupIds.includes(g.id)).map(g => g.id) };
        });
    const radio = (m: DoveModo, label: string, count?: string) => (
        <button type="button" className={s.dmode} role="radio" aria-checked={modo === m} onClick={() => modo !== m && pick(m)}>
            <span className={s.dradio} aria-hidden />
            {label}
            {count && <small>{count}</small>}
        </button>
    );

    return (
        <div className={s.ifl}>
            <h4 id={hid}>Dove</h4>
            <div className={s.dmodes} role="radiogroup" aria-labelledby={hid}>
                {radio("all", "Tutte le sedi", String(sedi.length))}
                {groups.length > 0 && radio("group", "Un gruppo", String(groups.length))}
                {modo === "group" && (
                    <div className={s.dsub}>
                        <div className={s.chips}>
                            {groups.map(g => (
                                <button key={g.id} type="button" className={s.chip} aria-pressed={w.groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>
                                    <Folder size={13} aria-hidden />
                                    {g.name}
                                    <small>{g.activityIds.length}</small>
                                </button>
                            ))}
                        </div>
                        <p className={s.muted}>Vale anche per le sedi che entreranno nel gruppo.</p>
                    </div>
                )}
                {radio("some", "Sedi scelte", modo === "some" ? `${w.activityIds.length} di ${sedi.length}` : undefined)}
                {modo === "some" && (
                    <div className={s.sinl}>
                        <SediPannello
                            sedi={sedi}
                            groups={groups}
                            value={w.activityIds}
                            take
                            onChange={ids => upd(dd => void (dd.where = { all: false, activityIds: ids, groupIds: dd.where.groupIds }))}
                        />
                    </div>
                )}
            </div>
            <p className={s.muted}>
                {!w.all && !w.groupIds.length && w.activityIds.length > 3 ? `${w.activityIds.length} sedi` : whereText(w, L)}. Quello che vale per una sede vince su quello che vale per tutte.
            </p>
            {bad === "Scegli almeno una sede" && <Warn>{bad}.</Warn>}
        </div>
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
