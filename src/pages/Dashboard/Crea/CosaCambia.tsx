// «Cosa cambia nel calendario», in «Controlla»: la somma e le sedi per esito.
// Toccare una sede la sceglie per la settimana del «Quando».
import { useState } from "react";
import { ArrowLeftRight, Calendar, CalendarCheck, CalendarOff, Check, CircleDashed, Layers } from "lucide-react";
import { q, durLabel, type CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { hoursText, type SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CreaKind as Kind } from "./creaModel";
import { effChips, effSum, type EffIco, type EffPrima, type EffVal } from "./creaEffetto";
import type { HPeriodo } from "./creaSedePer";
import s from "./Crea.module.scss";

const ICO: Record<EffIco, typeof Layers> = { off: CalendarOff, posto: ArrowLeftRight, insieme: Layers, solo: CircleDashed };
const sediN = (n: number) => n + " " + (n === 1 ? "sede" : "sedi");

export function CosaCambia({
    sedi,
    kind,
    insieme,
    when,
    multi,
    pair,
    sede,
    onSede,
    prima,
    periodi,
    me
}: {
    /** I menù che stanno da soli: quando si vede solo lui, o il tuo al suo posto (punto 4). */
    periodi?: readonly HPeriodo[];
    /** Il nome del tuo. */
    me?: string;
    sedi: readonly SedeEff[];
    kind: Kind;
    /** La risposta «insieme / al posto», unica o sede per sede. */
    insieme: EffVal;
    when: CalWhen;
    multi: boolean;
    /** Lo stile che il menù porta con sé. */
    pair?: string | null;
    sede: string | null;
    onSede: (id: string) => void;
    /** In modifica, se la voce era in onda: com'era, per «Prima: …» e le sedi dove non cambia niente. */
    prima?: EffPrima;
}) {
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const sum = effSum(sedi, kind, insieme, prima);
    const name = (id: string) => sedi.find(x => x.id === id)?.name ?? "sede";
    const chips = (key: string, ids: string[]) => {
        if (!multi) return null;
        const ch = effChips(ids, !!open[key]);
        return (
            <div className={s.cchips}>
                {ch.ids.map(id => (
                    <button key={id} type="button" className={s.cchip} aria-pressed={id === sede} onClick={() => onSede(id)}>
                        {name(id)}
                    </button>
                ))}
                {ids.length > 4 && (
                    <button type="button" className={`${s.cchip} ${s.cmore}`} aria-expanded={!!open[key]} onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))}>
                        {open[key] ? "Meno" : "+" + ch.more}
                    </button>
                )}
            </div>
        );
    };
    return (
        <>
            <p className={s.csum}>
                <CalendarCheck size={17} aria-hidden />
                <span>
                    {!sum.on && !multi && "Questa settimana non c'è."}
                    {multi && (
                        <>
                            In onda in <b>{sum.on < sum.tot ? `${sum.on} di ${sediN(sum.tot)}` : sediN(sum.on)}</b>
                        </>
                    )}
                    {sum.same && (
                        <>
                            {multi && " · "}
                            {durLabel(when)}
                            {/* «tutto il giorno» conta le ore della griglia, non del locale: il numero confondeva (difetto 13) */}
                            {!!when.ranges?.length && (
                                <>
                                    {" · "}
                                    <b>{hoursText(sum.mins)}</b> a settimana
                                </>
                            )}
                        </>
                    )}
                    {kind === "menu" && sum.on > 0 && pair && " · stile " + q(pair)}
                </span>
            </p>
            <div className={s.cgs}>
                {sum.groups.map(g => {
                    const Ico = ICO[g.ico];
                    return (
                        <div key={g.key} className={g.off ? `${s.cg} ${s.cgoff}` : s.cg}>
                            <div className={s.cgh}>
                                <Ico size={16} aria-hidden />
                                <b>{g.lab}</b>
                                {multi && <span className={s.cn}>{sediN(g.ids.length)}</span>}
                            </div>
                            {g.hrs && <p className={s.cprima}>{g.hrs}</p>}
                            {g.prima != null && <p className={s.cprima}>Prima: {g.prima}</p>}
                            {chips(g.key, g.ids)}
                        </div>
                    );
                })}
                {sum.unchanged.length > 0 &&
                    (multi ? (
                        <div className={`${s.cg} ${s.cgoff}`}>
                            <div className={s.cgh}>
                                <Check size={16} aria-hidden />
                                <b>In {sediN(sum.unchanged.length)} non cambia niente</b>
                            </div>
                            {chips("u", sum.unchanged)}
                        </div>
                    ) : (
                        <p className={s.hint}>Nel calendario non cambia niente.</p>
                    ))}
            </div>
            {!!periodi?.length && (
                <>
                    <h5 className={s.ch5}>Periodi in cui cambia</h5>
                    <div className={s.cgs}>
                        {periodi.map(p => (
                            <div key={p.key} className={`${s.cg} ${s.per}`}>
                                <div className={s.cgh}>
                                    <span className={s.cdate}>
                                        <Calendar size={12} aria-hidden />
                                        {p.quando.charAt(0).toUpperCase() + p.quando.slice(1)}
                                    </span>
                                    <b>{p.lui ? "Si vede solo " + q(p.con) : "Si vede " + q(me ?? "") + ", " + q(p.con) + " no"}</b>
                                    {multi && <span className={s.cn}>{sediN(p.ids.length)}</span>}
                                </div>
                                {chips("p" + p.key, p.ids)}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}
