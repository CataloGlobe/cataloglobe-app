// In evidenza, le parti nuove (D187): «Quando succede» è una data scritta sulla
// card, solo un'informazione; «Il pulsante» è una scelta fra quattro, senza link
// libero. Si vedono con `NEW_MODEL.evid`; le colonne le scrive il database nuovo.
import { dayOfWeek, dayParts, type DayNum } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { DAYS_L, DB, DB_WAIT, NEW_MODEL, elides, isoDay, listIt, mShort, ore } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { FeaturedContent } from "@/services/supabase/featuredContents";
import type { Tunnel } from "./creaModel";

export type EvDateKind = "none" | "day" | "period" | "week";
/** `days`: 0 = lunedì … 6 = domenica; `time`: minuti dalla mezzanotte, facoltativa. */
export type EvDate = { k: EvDateKind; day: DayNum; from: DayNum; to: DayNum; days: number[]; time: number | null };
export type EvBtn = "" | "prenota" | "ordine" | "vedi";

export const newEvDate = (today: DayNum): EvDate => ({ k: "none", day: today, from: today, to: today + 6, days: [dayOfWeek(today)], time: null });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La riga sulla card: «Mercoledì 21 ott, dalle 17», «Dal 19 al 25 ott», «Ogni mercoledì». */
export function dateTxt(d: EvDate): string {
    if (d.k === "none") return "";
    const tm = d.time != null ? ", dalle " + ore(d.time) : "";
    if (d.k === "day") return cap(DAYS_L[dayOfWeek(d.day)]) + " " + mShort(d.day) + tm;
    if (d.k === "period") {
        const a = dayParts(d.from), b = dayParts(d.to);
        return (elides(d.from) ? "Dall'" : "Dal ") + (a.month === b.month && a.year === b.year ? a.day : mShort(d.from)) + (elides(d.to) ? " all'" : " al ") + mShort(d.to) + tm;
    }
    const ds = [...d.days].sort((x, y) => x - y);
    return (ds.length ? "Ogni " + listIt(ds.map(i => DAYS_L[i])) : "Ogni settimana") + tm;
}

const price = (s: string) => parseFloat(s.replace(",", "."));
const withDishes = (t: Tunnel) => (t.evType === "promo" || t.evType === "bundle") && t.dishes.length > 0;

/** Il pulsante si può scegliere? `pro`: il piano che ha le prenotazioni. */
export function btnOk(t: Tunnel, b: EvBtn, pro: boolean): boolean {
    if (b === "prenota") return pro;
    if (b === "ordine") return withDishes(t) && t.evType === "bundle" && price(t.bundle) > 0;
    if (b === "vedi") return withDishes(t);
    return true;
}

/** Il pulsante che vale: una scelta che i piatti non reggono più cade da sola. */
export const effBtn = (t: Tunnel): EvBtn => (btnOk(t, t.btn, true) ? t.btn : "");

export const btnName = (t: Tunnel, b: EvBtn = effBtn(t)): string =>
    b === "prenota" ? "Prenota con CataloGlobe" : b === "ordine" ? "Aggiungi all'ordine" : b === "vedi" ? (t.dishes.length > 1 ? "Vedi i prodotti" : "Vedi il piatto") : "Nessun pulsante";

/** La scritta del pulsante sulla card (il prezzo unico lo aggiunge il telefono). */
export const btnLabel = (t: Tunnel, b: EvBtn = effBtn(t)): string => (b === "prenota" ? "Prenota un tavolo" : b ? btnName(t, b) : "");

/**
 * La prima volta che si arriva al «Quando»: un giorno o un periodo sulla card
 * diventano «solo in certi momenti», da oggi a quel giorno. Niente da «E adesso?».
 */
export function presetQuando(t: Tunnel, today: DayNum): void {
    if (!NEW_MODEL.evid || t.kind !== "evid" || t.edit || t.qset) return;
    t.qset = true;
    const d = t.date;
    if (t.from || (d.k !== "day" && d.k !== "period")) return;
    const end = d.k === "day" ? d.day : d.to;
    if (end < today) return;
    t.qmode = "momenti";
    t.when = { period: { from: today, to: end } };
    t.per = null;
    t.qauto = end;
}

/** «Fino al 21 ott, il giorno del contenuto: puoi cambiarlo.» finché il periodo è ancora quello. */
export function qautoNote(t: Tunnel): string {
    if (!NEW_MODEL.evid || t.kind !== "evid" || t.qauto == null || t.qmode !== "momenti" || t.when.period?.to !== t.qauto) return "";
    return `Fino ${elides(t.qauto) ? "all'" : "al "}${mShort(t.qauto)}, il giorno del contenuto: puoi cambiarlo.`;
}

/** Ciò che il database di oggi non sa ancora tenere. */
export function evidWait(t: Tunnel): string {
    if (DB.ready || !NEW_MODEL.evid || t.kind !== "evid") return "";
    if (t.date.k !== "none") return "«Quando succede»: " + DB_WAIT;
    return effBtn(t) ? "«Il pulsante»: " + DB_WAIT : "";
}

const hms = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

/** Le colonne nuove (fase a del pacchetto database): giorni con la convenzione delle regole, 0 = domenica. */
export function evidColumns(t: Tunnel): Partial<FeaturedContent> {
    if (!DB.ready || !NEW_MODEL.evid) return {};
    const d = t.date, b = effBtn(t);
    return {
        shown_date_kind: d.k === "none" ? null : d.k === "week" ? "weekly" : d.k,
        shown_date_from: d.k === "day" ? isoDay(d.day) : d.k === "period" ? isoDay(d.from) : null,
        shown_date_to: d.k === "period" ? isoDay(d.to) : null,
        shown_weekdays: d.k === "week" ? [...d.days].map(x => (x + 1) % 7).sort((x, y) => x - y) : null,
        shown_time_from: d.k !== "none" && d.time != null ? hms(d.time) : null,
        shown_time_to: null,
        ...(b && !t.cta ? { cta_text: btnLabel(t, b), cta_url: null } : {}),
        cta_action: t.cta ? "link" : b === "prenota" ? "reservation" : b === "ordine" ? "add_to_order" : b === "vedi" ? "show_products" : "none"
    };
}

type Row = Pick<FeaturedContent, "shown_date_kind" | "shown_date_from" | "shown_date_to" | "shown_weekdays" | "shown_time_from" | "cta_action">;
const dayOfIso = (iso: string): DayNum => Math.round(Date.parse(iso + "T00:00:00Z") / 86_400_000);

/** Dal database al tunnel: la data e il pulsante di un contenuto già salvato. */
export function readEvid(t: Tunnel, c: Partial<Row>): void {
    const k = c.shown_date_kind;
    if (k === "day" && c.shown_date_from) Object.assign(t.date, { k: "day", day: dayOfIso(c.shown_date_from) });
    else if (k === "period" && c.shown_date_from && c.shown_date_to) Object.assign(t.date, { k: "period", from: dayOfIso(c.shown_date_from), to: dayOfIso(c.shown_date_to) });
    else if (k === "weekly" && c.shown_weekdays) Object.assign(t.date, { k: "week", days: c.shown_weekdays.map(x => (x + 6) % 7).sort((x, y) => x - y) });
    if (t.date.k !== "none" && c.shown_time_from) {
        const [h, m] = c.shown_time_from.split(":").map(Number);
        t.date.time = h * 60 + m;
    }
    t.btn = c.cta_action === "reservation" ? "prenota" : c.cta_action === "add_to_order" ? "ordine" : c.cta_action === "show_products" ? "vedi" : "";
    // «reservation» non è un link libero, anche se la riga porta ancora un testo
    if (t.btn) t.cta = false;
}
