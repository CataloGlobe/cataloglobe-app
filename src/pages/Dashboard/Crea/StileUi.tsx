// I pezzi piccoli de «L'aspetto» dello stile: il gruppo di una scelta, le pillole, la tavolozza.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ink, palette, sameHex, type PaletteKind } from "./stileLook";
import s from "./StileAspetto.module.scss";

export type Opts<V extends string> = readonly (readonly [V, string])[];

export function Group({ label, hint, wide, cond, children }: { label: string; hint?: string; wide?: boolean; cond?: boolean; children: ReactNode }) {
    return (
        <div className={[s.og, wide && s.wide, cond && s.cond].filter(Boolean).join(" ")} role="group" aria-label={label}>
            <span className={s.lab}>{label}</span>
            {children}
            {hint && <span className={s.hint}>{hint}</span>}
        </div>
    );
}

export function Choice<V extends string>({ label, opts, value, on, wide, cond, mini }: { label: string; opts: Opts<V>; value: V; on: (v: V) => void; wide?: boolean; cond?: boolean; mini?: boolean }) {
    return (
        <Group label={label} wide={wide} cond={cond}>
            <div className={s.chips}>
                {opts.map(([v, text]) => (
                    <button key={v} type="button" className={s.chip} aria-pressed={value === v} onClick={() => on(v)}>
                        {mini && (
                            <span className={s.mini} data-m={v} aria-hidden>
                                Primi
                            </span>
                        )}
                        {text}
                    </button>
                ))}
            </div>
        </Group>
    );
}

/** La tavolozza: un fumetto sul pulsante, dieci tinte per cinque toni; in fondo il colore libero. */
export function Palette({ title, kind, value, used, right, pick, live, close }: { title: string; kind: PaletteKind; value: string; used: readonly string[]; right?: boolean; pick: (c: string) => void; live: (c: string) => void; close: () => void }) {
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
