// «Cosa cambia nel calendario», in «Controlla»: la somma e le sedi per esito.
// Toccare una sede la sceglie per la settimana del «Quando».
import { useState } from "react";
import { ArrowLeftRight, CalendarCheck, CalendarOff, CircleDashed, Layers } from "lucide-react";
import { q, durLabel, type CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { hoursText, type SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CreaKind as Kind } from "./creaModel";
import { effChips, effSum, type EffIco, type EffVal } from "./creaEffetto";
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
    onSede
}: {
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
}) {
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const sum = effSum(sedi, kind, insieme);
    const name = (id: string) => sedi.find(x => x.id === id)?.name ?? "sede";
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
                            {durLabel(when)} · <b>{hoursText(sum.mins)}</b> a settimana
                        </>
                    )}
                    {kind === "menu" && sum.on > 0 && pair && " · stile " + q(pair)}
                </span>
            </p>
            <div className={s.cgs}>
                {sum.groups.map(g => {
                    const Ico = ICO[g.ico], ch = effChips(g.ids, !!open[g.key]);
                    return (
                        <div key={g.key} className={g.off ? `${s.cg} ${s.cgoff}` : s.cg}>
                            <div className={s.cgh}>
                                <Ico size={16} aria-hidden />
                                <b>{g.lab}</b>
                                {multi && <span className={s.cn}>{sediN(g.ids.length)}</span>}
                            </div>
                            {g.hrs && <p className={s.cprima}>{g.hrs}</p>}
                            {multi && (
                                <div className={s.cchips}>
                                    {ch.ids.map(id => (
                                        <button key={id} type="button" className={s.cchip} aria-pressed={id === sede} onClick={() => onSede(id)}>
                                            {name(id)}
                                        </button>
                                    ))}
                                    {g.ids.length > 4 && (
                                        <button type="button" className={`${s.cchip} ${s.cmore}`} aria-expanded={!!open[g.key]} onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}>
                                            {open[g.key] ? "Meno" : "+" + ch.more}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
