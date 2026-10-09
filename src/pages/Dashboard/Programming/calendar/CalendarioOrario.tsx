import { useRef, type PointerEvent as RPointerEvent } from "react";
import { DB_TODAY, normRanges, type Draft } from "./calendarDraft";
import { FSLOT, hhmm, type Axis, type CalWhen } from "./calendarModel";
import s from "./CalendarioView.module.scss";

/* L'orario del passo «Quando»: le ore di inizio e fine, e la fascia disegnata. */

/** Un'ora a quarti d'ora, da `min` a `max`. */
export function TimeSel({ v, onChange, min = 0, max }: { v: number; onChange: (m: number) => void; min?: number; max: number }) {
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
export function Band({ w, axis, upd }: { w: CalWhen; axis: Axis; upd: (fn: (d: Draft) => void) => void }) {
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
