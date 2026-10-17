// I pezzi piccoli de «L'aspetto» dello stile: il gruppo di una scelta, le pillole, la tavolozza.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ink, palette, sameHex, type PaletteKind } from "./stileLook";
import s from "./StileAspetto.module.scss";

export type Opts<V extends string> = readonly (readonly [V, string])[];

export function Group({ label, hint, wide, cond, off, children }: { label: string; hint?: ReactNode; wide?: boolean; cond?: boolean; off?: string; children: ReactNode }) {
    const hintId = useId();
    const note = off || hint;
    return (
        <div className={[s.og, wide && s.wide, cond && s.cond, off && s.off].filter(Boolean).join(" ")} role="group" aria-label={label} aria-describedby={note ? hintId : undefined}>
            <span className={s.lab}>{label}</span>
            {children}
            {note && (
                <span className={s.hint} id={hintId}>
                    {note}
                </span>
            )}
        </div>
    );
}

/**
 * Una scelta fra pochi valori, ognuno col suo disegno (`draw`): in riga, o in tessere con
 * `tiles` colonne. Con `off` resta al suo posto, spenta, col motivo (deciso da Lorenzo il 2026-10-16).
 */
export function Choice<V extends string>({ label, opts, value, on, wide, cond, hint, off, draw, tiles }: { label: string; opts: Opts<V>; value: V; on: (v: V) => void; wide?: boolean; cond?: boolean; hint?: ReactNode; off?: string; draw?: (v: V) => ReactNode; tiles?: 2 | 3 | 4 }) {
    return (
        <Group label={label} wide={wide} cond={cond} hint={hint} off={off}>
            <div className={tiles ? s.tiles : s.chips} data-cols={tiles}>
                {opts.map(([v, text]) => (
                    <button key={v} type="button" className={tiles ? `${s.chip} ${s.tile}` : s.chip} aria-pressed={value === v} disabled={!!off} onClick={() => on(v)}>
                        {draw?.(v)}
                        {text}
                    </button>
                ))}
            </div>
        </Group>
    );
}

/** La tavolozza: un fumetto sul pulsante, dieci tinte per cinque toni; in fondo il colore libero. */
export function Palette({ title, kind, value, used, logo, right, pick, live, close }: { title: string; kind: PaletteKind; value: string; used: readonly string[]; logo: readonly string[]; right?: boolean; pick: (c: string) => void; live: (c: string) => void; close: () => void }) {
    const [free, setFree] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const out = (e: PointerEvent) => void (box.current?.parentElement?.contains(e.target as Node) || close());
        const esc = (e: KeyboardEvent) => void (e.key === "Escape" && close());
        document.addEventListener("pointerdown", out);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("pointerdown", out);
            document.removeEventListener("keydown", esc);
        };
    }, [close]);
    const cell = (c: string, i: number) => <button key={c + i} type="button" className={s.pc} style={ink(c)} aria-label={c.toUpperCase()} aria-pressed={sameHex(value, c)} onClick={() => pick(c)} />;
    return (
        <div ref={box} className={[s.pal, right && s.right].filter(Boolean).join(" ")} role="dialog" aria-label={title}>
            <div className={s.pgrid}>{palette(kind).map(cell)}</div>
            {logo.length > 0 && (
                <div className={s.prow}>
                    <small>Dal tuo logo</small>
                    {logo.map(cell)}
                </div>
            )}
            <div className={s.prow}>
                <small>Già usati</small>
                {used.map(cell)}
            </div>
            <div className={s.palf}>
                <button type="button" className={s.linkb} aria-expanded={free} onClick={() => setFree(f => !f)}>
                    Altri colori…
                </button>
                {free && (
                    <span className={s.free}>
                        <input type="color" value={value.toLowerCase()} aria-label="Scegli un colore qualsiasi" onChange={e => live(e.target.value)} />
                        <code>{value.toUpperCase()}</code>
                    </span>
                )}
            </div>
        </div>
    );
}
