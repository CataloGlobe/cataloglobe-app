// I giorni della sede aperta in breve: si vedono solo quando la settimana a destra non c'è (sotto i 1100px).
import type { Impatto } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import s from "./Crea.module.scss";

export function SedeGiorni({ sede, eff }: { sede: { id: string; name: string }; eff?: Impatto }) {
    const g = eff?.sedi?.find(x => x.id === sede.id)?.giorni;
    if (!g?.length) return null;
    return (
        <ul className={s.hdays} aria-label={`I giorni di ${sede.name}`}>
            {g.map(x => (
                <li key={x.days + x.txt}>
                    <b>{x.days}</b> {x.txt}
                </li>
            ))}
        </ul>
    );
}
