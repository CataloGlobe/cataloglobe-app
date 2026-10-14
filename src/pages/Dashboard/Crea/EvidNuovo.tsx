// Le parti nuove di «Il contenuto» (D187): «Quando succede», una data scritta
// sulla card, e «Il pulsante», una scelta fra quattro al posto del link libero.
import { useId, useState, type ReactNode } from "react";
import { CalendarCheck, CalendarDays, CircleOff, Lock, MousePointerClick, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { hhmm, type DayNum } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { isoDay, parseTime } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Tunnel } from "./creaModel";
import { btnName, btnOk, dateTxt, effBtn, type EvBtn, type EvDateKind } from "./evidData";
import { EvidParte } from "./EvidContenuto";
import type { U } from "./CreaSteps";
import { Chip } from "./CreaUi";
import s from "./Crea.module.scss";
import e from "./Evid.module.scss";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const KINDS: [EvDateKind, string][] = [
    ["none", "Nessuna data"],
    ["day", "Un giorno"],
    ["period", "Un periodo"],
    ["week", "Ogni settimana"]
];
const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const dayOfIso = (iso: string): DayNum | null => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? Math.round(Date.parse(iso + "T00:00:00Z") / 86_400_000) : null);

/** L'ora facoltativa: scritta come nel Calendario (17, 1730, 17:30); vuota = nessuna. */
export function OraFacoltativa({ v, onChange }: { v: number | null; onChange: (m: number | null) => void }) {
    const [edit, setEdit] = useState<string | null>(null);
    const commit = () => {
        if (edit === null) return;
        const c = edit.trim() ? parseTime(edit) : null;
        setEdit(null);
        if (!edit.trim() || (c !== null && !Number.isNaN(c))) onChange(c === null ? null : c % 1440);
    };
    return (
        <input
            className={cx(s.in, e.hour)}
            value={edit ?? (v == null ? "" : hhmm(v))}
            placeholder="--:--"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Ora"
            onChange={ev => setEdit(ev.target.value)}
            onBlur={commit}
            onKeyDown={ev => ev.key === "Enter" && ev.currentTarget.blur()}
        />
    );
}

export function EvidQuandoSuccede({ t, u }: { t: Tunnel; u: U }) {
    const d = t.date, ids = { day: useId(), from: useId(), to: useId() };
    const set = (k: "day" | "from" | "to", iso: string) => {
        const n = dayOfIso(iso);
        if (n !== null) u(x => void (x.date[k] = n));
    };
    return (
        <EvidParte icon={<CalendarDays size={17} />} title="Quando succede" now={dateTxt(d)}>
            <p className={s.hint}>Solo un'informazione per il cliente, sulla card. Quando il contenuto si vede, e quando si spegne, lo decide il passo «Quando».</p>
            <div className={s.chips}>
                {KINDS.map(([k, label]) => (
                    <Chip key={k} on={d.k === k} onClick={() => u(x => void (x.date.k = k))}>
                        {label}
                    </Chip>
                ))}
            </div>
            {d.k === "day" && (
                <div className={e.erow}>
                    <label htmlFor={ids.day}>Il giorno</label>
                    <input type="date" className={cx(s.in, e.day)} id={ids.day} value={isoDay(d.day)} onChange={ev => set("day", ev.target.value)} />
                </div>
            )}
            {d.k === "period" && (
                <div className={e.erow}>
                    <label htmlFor={ids.from}>Dal</label>
                    <input type="date" className={cx(s.in, e.day)} id={ids.from} value={isoDay(d.from)} onChange={ev => set("from", ev.target.value)} />
                    <label htmlFor={ids.to}>al</label>
                    <input type="date" className={cx(s.in, e.day)} id={ids.to} data-bad="period" value={isoDay(d.to)} onChange={ev => set("to", ev.target.value)} />
                </div>
            )}
            {d.k === "week" && (
                <div className={s.chips} role="group" aria-label="Giorni">
                    {DAYS.map((x, i) => (
                        <Chip key={x} on={d.days.includes(i)} onClick={() => u(y => void (y.date.days = y.date.days.includes(i) ? y.date.days.filter(n => n !== i) : [...y.date.days, i]))}>
                            {x}
                        </Chip>
                    ))}
                </div>
            )}
            {d.k !== "none" && (
                <div className={e.erow}>
                    <span>Ora</span>
                    <OraFacoltativa v={d.time} onChange={m => u(x => void (x.date.time = m))} />
                    <span>facoltativa · sulla card: {dateTxt(d)}</span>
                </div>
            )}
        </EvidParte>
    );
}

export function EvidPulsante({ t, u, pro }: { t: Tunnel; u: U; pro: boolean }) {
    const n = t.dishes.length, cur = effBtn(t);
    const rows: [EvBtn, ReactNode, string, string][] = [
        ["", <CircleOff size={17} key="i" />, "La card si legge e basta.", ""],
        ["prenota", pro ? <CalendarCheck size={17} key="i" /> : <Lock size={17} key="i" />, "Apre la prenotazione del locale, senza uscire dalla pagina.", pro ? "" : "Serve il piano Pro: chi non ce l'ha lo vede col lucchetto."],
        ["ordine", <ShoppingBag size={17} key="i" />, "Mette nell'ordine del tavolo tutti i piatti, al prezzo unico.", btnOk(t, "ordine", pro) ? "" : "Solo coi piatti «tutti insieme a un prezzo unico», col prezzo scritto."],
        ["vedi", <UtensilsCrossed size={17} key="i" />, n > 1 ? "Apre le schede dei piatti, una dopo l'altra." : "Apre la scheda del piatto.", btnOk(t, "vedi", pro) ? "" : "Solo con dei piatti collegati."]
    ];
    return (
        <EvidParte icon={<MousePointerClick size={17} />} title="Il pulsante" now={btnName(t)}>
            <div className={s.list} role="radiogroup" aria-label="Il pulsante">
                {rows.map(([v, icon, text, why]) => {
                    const on = cur === v;
                    return (
                        <button key={v} type="button" className={cx(s.lpick, e.brow)} role="radio" aria-checked={on} disabled={!!why} onClick={() => u(x => void (x.btn = v))}>
                            <span className={cx(s.box, s.radio, on && s.on)} />
                            <span className={e.icon}>{icon}</span>
                            <span className={e.btx}>
                                <b>{btnName(t, v)}</b>
                                <small>{why || text}</small>
                            </span>
                        </button>
                    );
                })}
            </div>
        </EvidParte>
    );
}
