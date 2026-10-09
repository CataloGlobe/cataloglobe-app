// I passi «Quando» e «Dove» della sezione Aggiungi / Modifica completa, da soli:
// li usano la sezione del Calendario e i tunnel di creazione.
import { useRef, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Check, Folder, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DB_LATER, DB_TODAY, isoDay, normRanges, whenKey, whereText, type Draft, type DraftLookups } from "./calendarDraft";
import { FSLOT, dayNum, durLabel, hhmm, type Axis, type CalWhen } from "./calendarModel";
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
export function DovePasso({ draft: d, upd, sedi, groups, L, bad }: DovePassoProps) {
    const w = d.where;
    const set = w.all
        ? sedi.map(x => x.id)
        : w.groupIds.length
          ? [...new Set(w.groupIds.flatMap(g => groups.find(x => x.id === g)?.activityIds ?? []))]
          : w.activityIds;
    return (
        <div className={s.ifl}>
            <h4>Dove</h4>
            <div className={s.chips}>
                <button type="button" className={s.chip} aria-pressed={w.all} onClick={() => upd(dd => void (dd.where = { all: true, activityIds: [], groupIds: [] }))}>
                    Tutte le sedi
                </button>
                {groups.map(g => (
                    <button
                        key={g.id}
                        type="button"
                        className={s.chip}
                        aria-pressed={!w.all && w.groupIds.length === 1 && w.groupIds[0] === g.id && !w.activityIds.length}
                        onClick={() => upd(dd => void (dd.where = { all: false, activityIds: [], groupIds: [g.id] }))}
                    >
                        <Folder size={13} aria-hidden />
                        {g.name}
                    </button>
                ))}
            </div>
            <div className={s.isedi}>
                {sedi.map(x => {
                    const on = set.includes(x.id);
                    return (
                        <button
                            key={x.id}
                            type="button"
                            className={s.gsc}
                            role="checkbox"
                            aria-checked={on}
                            onClick={() =>
                                upd(dd => {
                                    const next = on ? set.filter(y => y !== x.id) : [...set, x.id];
                                    dd.where = next.length === sedi.length ? { all: true, activityIds: [], groupIds: [] } : { all: false, activityIds: sedi.map(y => y.id).filter(y => next.includes(y)), groupIds: [] };
                                })
                            }
                        >
                            <span className={s.box}>{on && <Check size={11} aria-hidden />}</span>
                            {x.name}
                        </button>
                    );
                })}
            </div>
            <p className={s.muted}>{whereText(w, L)}. Quello che vale per una sede vince su quello che vale per tutte.</p>
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

function TimeSel({ v, onChange, min = 0, max }: { v: number; onChange: (m: number) => void; min?: number; max: number }) {
    const opts: number[] = [];
    for (let m = min; m <= max; m += FSLOT) opts.push(m);
    if (!opts.includes(v)) opts.push(v);
    opts.sort((a, b) => a - b);
    return (
        <select className={s.hin} value={v} onChange={ev => onChange(Number(ev.target.value))}>
            {opts.map(m => (
                <option key={m} value={m}>
                    {m === 1440 ? "24:00" : hhmm(m)}
                </option>
            ))}
        </select>
    );
}

/* le fasce si trascinano sulla barra, a quarti d'ora */
function Band({ w, axis, upd }: { w: CalWhen; axis: Axis; upd: (fn: (d: Draft) => void) => void }) {
    const A0 = Math.min(axis.from, ...(w.ranges ?? []).map(r => Math.floor(r[0] / 60) * 60));
    const A1 = DB_TODAY.overnight ? axis.to : 1440;
    const X = (m: number) => ((Math.max(A0, Math.min(A1, m)) - A0) / (A1 - A0)) * 100;
    const rs = w.ranges ?? [[A0, A1] as [number, number]];
    const drag = !!w.ranges;
    const bd = useRef<{ j: number; mode: "l" | "r" | "m"; x0: number; w: number; orig: [number, number] } | null>(null);
    const ticks: number[] = [];
    for (let m = A0; m <= A1; m += 120) ticks.push(m);
    const down = (j: number, mode: "l" | "r" | "m") => (ev: RPointerEvent<HTMLElement>) => {
        ev.preventDefault();
        ev.stopPropagation();
        const track = (ev.currentTarget.closest("[data-band]") as HTMLElement).getBoundingClientRect();
        bd.current = { j, mode, x0: ev.clientX, w: track.width, orig: [rs[j][0], rs[j][1]] };
        document.body.classList.add(s.ibdrag);
        const move = (e: PointerEvent) => {
            const b = bd.current;
            if (!b) return;
            const dm = Math.round(((e.clientX - b.x0) / b.w) * ((A1 - A0) / FSLOT)) * FSLOT, [a, z] = b.orig;
            upd(dd => {
                const r = dd.when.ranges?.[b.j];
                if (!r) return;
                if (b.mode === "m") {
                    const dl = Math.max(A0 - a, Math.min(A1 - z, dm));
                    r[0] = a + dl;
                    r[1] = z + dl;
                } else if (b.mode === "l") r[0] = Math.max(A0, Math.min(z - FSLOT, a + dm));
                else r[1] = Math.min(A1, Math.max(a + FSLOT, z + dm));
            });
        };
        const up = () => {
            bd.current = null;
            document.body.classList.remove(s.ibdrag);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            upd(dd => dd.when.ranges && normRanges(dd.when.ranges));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    return (
        <div className={`${s.iband} ${drag ? s.drag : ""}`} aria-hidden="true">
            <div className={s.ibt} data-band>
                {rs.map(([a, b], j) =>
                    drag ? (
                        <i key={j} data-tip={`${hhmm(a)}–${b === 1440 ? "24:00" : hhmm(b)}\n~Trascina per spostarla, dai bordi per allungarla o accorciarla. A passi di 15 minuti.`} style={{ left: X(a) + "%", width: X(b) - X(a) + "%" }} onPointerDown={down(j, "m")}>
                            <b className={`${s.ibh} ${s.l}`} onPointerDown={down(j, "l")} />
                            <b className={`${s.ibh} ${s.r}`} onPointerDown={down(j, "r")} />
                        </i>
                    ) : (
                        <i key={j} style={{ left: X(a) + "%", width: X(b) - X(a) + "%" }} />
                    )
                )}
            </div>
            <div className={s.ibl}>
                {ticks.map(m => (
                    <span key={m} style={{ left: X(m) + "%" }}>
                        {(m / 60) % 24}
                    </span>
                ))}
            </div>
        </div>
    );
}
