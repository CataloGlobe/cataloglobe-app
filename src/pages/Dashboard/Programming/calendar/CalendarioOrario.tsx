import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Clock } from "lucide-react";
import { NEW_MODEL, normRanges, parseTime, type Draft } from "./calendarDraft";
import { FSLOT, hhmm, type Axis, type CalWhen } from "./calendarModel";
import s from "./CalendarioView.module.scss";

/* L'orario del passo «Quando»: le ore di inizio e fine, e la fascia disegnata. */

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Un'ora da scrivere (22, 2230, 22:30) o da scegliere dall'orologio; le frecce
 * la spostano di un quarto d'ora. `start` è l'inizio della fascia, se questa è
 * la fine: con la notte accesa, le ore prima dell'inizio sono del giorno dopo.
 */
export function TimeField({ v, label, start, onChange }: { v: number; label: string; start?: number; onChange: (m: number) => void }) {
    const shown = v === 1440 ? "24:00" : hhmm(v);
    const [edit, setEdit] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const out = (e: MouseEvent) => {
            if (!box.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", out);
        return () => document.removeEventListener("mousedown", out);
    }, [open]);
    const commit = () => {
        const c = edit === null ? null : parseTime(edit);
        setEdit(null);
        if (c !== null && !Number.isNaN(c)) onChange(c);
    };
    const end = start !== undefined, next = end && v > 1440;
    const hour = (h: number, abs: number) => (
        <button key={abs} type="button" aria-pressed={Math.floor((v % 1440) / 60) === h && (!end || v > 1440 === abs >= 1440)} onClick={() => onChange(abs + (v % 60))}>
            {two(h)}
        </button>
    );
    const sh = end ? Math.floor(start / 60) : 0;
    const same: number[] = [], after: number[] = [];
    for (let h = sh; h < 24; h++) if (!end || h * 60 + 45 > start) same.push(h);
    if (end && NEW_MODEL.overnight) for (let h = 0; h <= sh; h++) after.push(h);
    return (
        <>
            <span className={s.tpk} ref={box}>
                <input
                    className={`${s.hin} ${s.tin}`}
                    value={edit ?? shown}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={label}
                    aria-expanded={open}
                    onChange={ev => setEdit(ev.target.value)}
                    onBlur={commit}
                    onKeyDown={ev => {
                        if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
                            ev.preventDefault();
                            setEdit(null);
                            onChange(v + (ev.key === "ArrowUp" ? FSLOT : -FSLOT));
                        } else if (ev.key === "Escape" && open) {
                            ev.stopPropagation();
                            setOpen(false);
                        } else if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                />
                <button type="button" className={s.tpb} aria-label={`Scegli l'ora: ${label}`} onClick={() => setOpen(o => !o)}>
                    <Clock size={15} aria-hidden />
                </button>
                {open && (
                    <div className={s.tpop} role="dialog" aria-label={label}>
                        <div className={s.tph}>
                            <h5>{after.length ? "Stesso giorno" : "Ora"}</h5>
                            <div className={s.tpg}>{same.map(h => hour(h, h * 60))}</div>
                        </div>
                        {after.length > 0 && (
                            <div className={`${s.tph} ${s.nd}`}>
                                <h5>Giorno dopo</h5>
                                <div className={s.tpg}>{after.map(h => hour(h, 1440 + h * 60))}</div>
                            </div>
                        )}
                        <div className={s.tph}>
                            <h5>Minuti</h5>
                            <div className={`${s.tpg} ${s.m}`}>
                                {[0, 15, 30, 45].map(x => (
                                    <button
                                        key={x}
                                        type="button"
                                        aria-pressed={v % 60 === x}
                                        onClick={() => {
                                            onChange(Math.floor((v % 1440) / 60) * 60 + x);
                                            setOpen(false);
                                        }}
                                    >
                                        :{two(x)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </span>
            {next && <span className={s.nday}>del giorno dopo</span>}
        </>
    );
}

/* le fasce si trascinano sulla barra, a quarti d'ora */
export function Band({ w, axis, upd }: { w: CalWhen; axis: Axis; upd: (fn: (d: Draft) => void) => void }) {
    const A0 = Math.min(axis.from, ...(w.ranges ?? []).map(r => Math.floor(r[0] / 60) * 60));
    // con la notte la barra arriva almeno alle 2, e fin dove arrivano le fasce
    const A1 = Math.max(NEW_MODEL.overnight ? Math.max(axis.to, 1560) : 1440, ...(w.ranges ?? []).map(r => Math.ceil(r[1] / 60) * 60));
    const X = (m: number) => ((Math.max(A0, Math.min(A1, m)) - A0) / (A1 - A0)) * 100;
    const rs = w.ranges ?? [[A0, A1] as [number, number]];
    const drag = !!w.ranges;
    const bd = useRef<{ j: number; mode: "l" | "r" | "m"; x0: number; w: number; orig: [number, number] } | null>(null);
    // la fascia presa, per il bagliore della D (v49)
    const [held, setHeld] = useState<number | null>(null);
    const ticks: number[] = [];
    for (let m = A0; m <= A1; m += 120) ticks.push(m);
    const down = (j: number, mode: "l" | "r" | "m") => (ev: RPointerEvent<HTMLElement>) => {
        ev.preventDefault();
        ev.stopPropagation();
        const track = (ev.currentTarget.closest("[data-band]") as HTMLElement).getBoundingClientRect();
        bd.current = { j, mode, x0: ev.clientX, w: track.width, orig: [rs[j][0], rs[j][1]] };
        document.body.classList.add(s.ibdrag);
        setHeld(j);
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
            setHeld(null);
            document.body.classList.remove(s.ibdrag);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            upd(dd => dd.when.ranges && normRanges(dd.when.ranges));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        // il sistema può togliere il dito (scroll, gesto): la fascia non resta presa
        window.addEventListener("pointercancel", up);
    };
    return (
        <div className={`${s.iband} ${drag ? s.drag : ""}`} aria-hidden="true">
            <div className={s.ibt} data-band>
                {drag && A1 > 1440 && <span className={s.ibnd} style={{ left: X(1440) + "%" }} data-tip="Dopo mezzanotte: giorno dopo" />}
                {rs.map(([a, b], j) =>
                    drag ? (
                        <i key={j} className={held === j ? s.on : undefined} data-tip={`${hhmm(a)}–${b === 1440 ? "24:00" : hhmm(b)}\n~Trascina per spostarla, dai bordi per allungarla o accorciarla. A passi di 15 minuti.`} style={{ left: X(a) + "%", width: X(b) - X(a) + "%" }} onPointerDown={down(j, "m")}>
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
                    <span key={m} className={A1 > 1440 && m === 1440 ? s.mid : undefined} style={{ left: X(m) + "%" }}>
                        {(m / 60) % 24}
                    </span>
                ))}
            </div>
        </div>
    );
}
