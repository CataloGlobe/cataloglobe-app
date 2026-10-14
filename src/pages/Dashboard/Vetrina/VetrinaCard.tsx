import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { FAMILY_ICON, type Family } from "@/components/ui/FamilyName/family";
import type { StylePalette } from "@/components/ui/StyleSwatch/stylePalette";
import type { OnAir } from "./vetrinaModel";
import s from "./Vetrina.module.scss";

/** La riga «In onda» sotto la card (`mvOnda`), o «Metti in onda» se è spento. */
export function OnAirLine({ onAir, onMetti, name }: { onAir: OnAir; onMetti?: () => void; name: string }) {
    if (onAir.state !== "off") {
        const bits = [onAir.when, onAir.where].filter((t): t is string => !!t);
        return (
            <div className={s.on}>
                <span className={s.ln} data-now={onAir.state === "now" ? "" : undefined}>
                    <i aria-hidden />
                    <b>{onAir.state === "now" ? "In onda adesso" : "In onda"}</b>
                    {bits.map(t => (
                        <span key={t}>
                            {" · "}
                            <span className={s.nb}>{t}</span>
                        </span>
                    ))}
                </span>
            </div>
        );
    }
    if (!onMetti) return <div className={s.on}>Non in onda</div>;
    return (
        <div className={s.on}>
            <Button variant="secondary" size="sm" onClick={onMetti} aria-label={`Metti in onda ${name}`}>
                Metti in onda
            </Button>
        </div>
    );
}

/** Il menù di carta sulla tinta viola (`mv-sheet`): il nome e le prime categorie. */
export function MenuPaper({ title, categories }: { title: string; categories: readonly string[] }) {
    return (
        <span className={s.sheet}>
            <span className={s.paper}>
                <i className={s.paperTitle}>{title}</i>
                {categories.map(c => (
                    <span key={c} className={s.paperCat}>
                        <i className={s.cat}>{c}</i>
                        <i className={s.line} />
                        <i className={s.line} data-short />
                    </span>
                ))}
            </span>
        </span>
    );
}

/** Il telefono con i colori dello stile sulla tinta verde acqua (`mv-sw`). */
export function StylePhone({ palette }: { palette: StylePalette }) {
    const vars = { "--c0": palette.background, "--c1": palette.primary, "--c2": palette.muted } as CSSProperties;
    return (
        <span className={s.sw}>
            <span className={s.phone} style={vars}>
                <i className={s.aa}>Aa</i>
                <i className={s.phoneBar} />
                <i className={s.line} />
                <i className={s.line} data-short />
                <i className={s.line} />
            </span>
        </span>
    );
}

type CardProps = {
    family: Family;
    /** Dove porta il clic sulla card. */
    to: string;
    preview: ReactNode;
    name: ReactNode;
    meta: ReactNode;
    /** Il nome per i lettori di schermo e per «Metti in onda». */
    label: string;
    onAir: OnAir;
    onMetti?: () => void;
    /** Il ⋮ con Modifica, Duplica, Elimina… */
    actions?: ReactNode;
};

/**
 * Una card di Menù e vetrina (Visual Redesign 2, `mvCard`): l'anteprima sulla
 * tinta della famiglia con l'icona in alto a sinistra, nome e numeri, poi la
 * riga «In onda» e il ⋮. Spenta, l'anteprima si sbiadisce un poco.
 */
export function VetrinaCard({ family, to, preview, name, meta, label, onAir, onMetti, actions }: CardProps) {
    const Icon = FAMILY_ICON[family];
    return (
        <article className={s.card} data-off={onAir.state === "off" ? "" : undefined}>
            <Link to={to} className={s.hit}>
                <span className={s.pv} data-family={family}>
                    <span className={s.pvIc} aria-hidden>
                        <Icon />
                    </span>
                    {preview}
                </span>
                <b className={s.name}>{name}</b>
                <small className={s.meta}>{meta}</small>
            </Link>
            <div className={s.ft}>
                <OnAirLine onAir={onAir} onMetti={onMetti} name={label} />
                {actions}
            </div>
        </article>
    );
}

/** Nessun risultato con la ricerca o il filtro (`mvNone`). */
export function VetrinaNone({ onClear }: { onClear: () => void }) {
    return (
        <section className={s.empty}>
            <b>Nessun risultato</b>
            <span>Prova con un&apos;altra parola o togli il filtro.</span>
            <Button variant="secondary" size="sm" onClick={onClear}>
                Togli i filtri
            </Button>
        </section>
    );
}
