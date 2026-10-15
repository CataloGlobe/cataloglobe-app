import type { CSSProperties } from "react";
import { FAMILY_ICON } from "@/components/ui/FamilyName/family";
import { KIND_LABEL, type CalKind, type DayNum } from "./calendarModel";
import s from "./CalendarioView.module.scss";

/** Una riga dell'agenda: una cosa in onda, con le sue ore. */
export type AgendaItem = { key: string; k: CalKind; label: string; hours: string; color: string; now: boolean; onPick?: () => void };

type Props = {
    /** I sette giorni della settimana, da lunedì. */
    days: readonly { date: DayNum; name: string; num: number }[];
    selected: DayNum;
    today: DayNum;
    /** «Mercoledì 14 ottobre · San Pietro». */
    title: string;
    kinds: readonly CalKind[];
    items: readonly AgendaItem[];
    onDay: (d: DayNum) => void;
};

/**
 * Il Calendario al telefono nella D (Visual Redesign 2, PR 10; copia `cAgenda`):
 * un giorno alla volta, la striscia della settimana in cima, poi le famiglie
 * con una riga per cosa e le ore scritte. Toccare una riga apre il pannello.
 */
export function CalendarioAgenda({ days, selected, today, title, kinds, items, onDay }: Props) {
    const fams = kinds.filter(k => items.some(x => x.k === k));
    return (
        <div className={s.agenda}>
            <div className={s.agStrip} role="group" aria-label="Giorno della settimana">
                {days.map(d => (
                    <button
                        key={d.date}
                        type="button"
                        aria-pressed={d.date === selected}
                        className={d.date === today ? s.agToday : undefined}
                        onClick={() => onDay(d.date)}
                    >
                        <span>{d.name}</span>
                        <b>{d.num}</b>
                    </button>
                ))}
            </div>
            <p className={s.agDay}>{title}</p>
            {fams.length ? (
                fams.map(k => {
                    const Icon = k === "visibility" ? null : FAMILY_ICON[k];
                    return (
                        <div key={k} className={s.agFam}>
                            <span className={s.agFh} style={{ "--c": items.find(x => x.k === k)?.color } as CSSProperties}>
                                {Icon ? <Icon size={15} aria-hidden /> : <i aria-hidden />}
                                {KIND_LABEL[k]}
                            </span>
                            {items
                                .filter(x => x.k === k)
                                .map(x => (
                                    <button
                                        key={x.key}
                                        type="button"
                                        className={`${s.agIt} ${x.now ? s.agNow : ""}`}
                                        style={{ "--c": x.color } as CSSProperties}
                                        disabled={!x.onPick}
                                        onClick={x.onPick}
                                    >
                                        <span className={s.agT}>{x.hours}</span>
                                        <span className={s.agN}>{x.label}</span>
                                        {x.now && <em>adesso</em>}
                                    </button>
                                ))}
                        </div>
                    );
                })
            ) : (
                <p className={s.agNone}>Niente in onda questo giorno.</p>
            )}
        </div>
    );
}
