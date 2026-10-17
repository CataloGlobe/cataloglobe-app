// I disegnini delle scelte de «L'aspetto», copiati dall'editor stili (editor.css, `.mq`, `.mm`,
// `.ma`, `.mo`, `.mf`, `.mp`, `.mh`): i colori arrivano da fuori, dalle variabili della pagina vera.
import type { CSSProperties } from "react";
import m from "./StileMini.module.scss";

export type MiniKind = "fisse" | "mat" | "ang" | "mot" | "feat" | "piatto" | "pill";

export function Mini({ kind, v, style }: { kind: MiniKind; v: string; style?: CSSProperties }) {
    const cls = (base: string) => `${m[base]} ${m[`${base}-${v}`] ?? ""}`;
    switch (kind) {
        case "fisse":
            return (
                <span className={m.mq} style={style} aria-hidden>
                    <i>
                        <em />
                        <u />
                        <span>
                            <u />
                            <u />
                            <u />
                        </span>
                    </i>
                    <s />
                    <s />
                    <b>
                        <u />
                    </b>
                    <b className={m.sq} />
                </span>
            );
        case "mat":
            return (
                <span className={cls("mm")} style={style} aria-hidden>
                    <u />
                    <i />
                </span>
            );
        case "ang":
            return (
                <span className={m.ma} aria-hidden>
                    <i style={style} />
                </span>
            );
        case "mot":
            return <span className={m.mo} style={style} aria-hidden />;
        case "feat":
            return (
                <span className={cls("mf")} aria-hidden>
                    <u />
                    <b />
                    <s />
                </span>
            );
        case "piatto":
            return (
                <span className={cls("mp")} aria-hidden>
                    <i>
                        <b />
                        <s />
                    </i>
                    <i>
                        <b />
                        <s />
                    </i>
                </span>
            );
        case "pill":
            return (
                <span className={cls("mh")} style={style} aria-hidden>
                    <u className={m.on}>Primi</u>
                    <u>Dolci</u>
                </span>
            );
    }
}
