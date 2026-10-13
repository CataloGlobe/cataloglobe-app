import type { LucideIcon } from "lucide-react";
import { Facebook, Globe, Instagram, Mail, MessageCircle, Phone } from "lucide-react";
import type { ActivityFee, V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
import type { Printer } from "@/types/printers";
import { FEE_DEFINITIONS, type FeeDefinition } from "@/constants/activityFees";
import { getDaySlots } from "@/pages/ReservationPage/availability";
import { SERVICE_DAY_START_HOUR } from "@/pages/Dashboard/Reservations/serviceDay";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { normalizeHours } from "../tabs/hours-services/blockTimeRange";
import type { SchedaPart } from "./schedaCopy";

/**
 * I conti della Scheda (prototipo C+++): cosa dire adesso, cosa risponde ogni
 * tessera, cosa c'è da sistemare. Funzioni pure sui dati della sede, così le
 * frasi si provano senza la pagina.
 */

// ── Il tempo ────────────────────────────────────────────────────────────────

export const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_LONG = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS = [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre"
];

export interface SchedaNow {
    /** "YYYY-MM-DD" della giornata di servizio, in ora di Roma. */
    iso: string;
    /** 0 = lunedì … 6 = domenica, come `day_of_week`: il giorno di `iso`. */
    weekday: number;
    /** Minuti dalla mezzanotte di `iso`: dopo mezzanotte e prima delle 5
     *  passano 1440, come le fasce che chiudono il giorno dopo. */
    minutes: number;
}

/** «Oggi» è la giornata di servizio in ora di Roma, come la sala
 *  (`serviceDayOf`): all'una di notte un locale aperto fino alle 2 è ancora
 *  nella sera di ieri, e «Chiudi oggi» chiude quella. */
export function makeNow(date: Date): SchedaNow {
    const r = toRomeDateTime(date);
    const late = r.hour < SERVICE_DAY_START_HOUR;
    const civil = Date.UTC(r.year, r.month, r.day) - (late ? 86_400_000 : 0);
    return {
        iso: new Date(civil).toISOString().slice(0, 10),
        weekday: (r.dayOfWeek + (late ? 5 : 6)) % 7,
        minutes: r.hour * 60 + r.minute + (late ? 1440 : 0)
    };
}

/** «venerdì 12:30»; dopo mezzanotte il giorno del calendario, «sabato 1:15». */
export function nowLabel(now: SchedaNow): string {
    const late = now.minutes >= 1440;
    const day = late ? (now.weekday + 1) % 7 : now.weekday;
    const m = now.minutes % 60;
    return `${DAY_LONG[day]} ${Math.floor(now.minutes / 60) % 24}:${String(m).padStart(2, "0")}`;
}

/** 900 → «15», 1110 → «18:30», 1470 → «0:30». */
export function hh(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
}

const toMin = (t: string) => {
    const [h, m] = t.split(":");
    return Number(h) * 60 + Number(m);
};

// ── Gli orari ───────────────────────────────────────────────────────────────

/** Una fascia in minuti; `b` passa 1440 quando chiude dopo mezzanotte. */
export interface Span {
    a: number;
    b: number;
}

function toSpan(s: { opens_at: string; closes_at: string; closes_next_day: boolean }): Span {
    const a = toMin(s.opens_at);
    return { a, b: toMin(s.closes_at) + (s.closes_next_day ? 24 * 60 : 0) };
}

/** Le fasce di un giorno della settimana, senza chiusure. */
export function weekdaySpans(hours: V2ActivityHours[], weekday: number): Span[] {
    return hours
        .filter(h => h.day_of_week === weekday && !h.is_closed && h.opens_at && h.closes_at)
        .sort((x, y) => x.slot_index - y.slot_index)
        .map(h =>
            toSpan({ opens_at: h.opens_at!.slice(0, 5), closes_at: h.closes_at!.slice(0, 5), closes_next_day: h.closes_next_day })
        );
}

/** Le fasce di oggi come le vede il cliente: chiusure comprese, e la coda
 *  della sera prima dopo mezzanotte (stessa funzione del modulo pubblico). */
export function todaySpans(hours: V2ActivityHours[], closures: V2ActivityClosure[], now: SchedaNow): Span[] {
    return getDaySlots(now.iso, normalizeHours(hours), closures).map(toSpan);
}

const covers = (c: V2ActivityClosure, iso: string) => c.closure_date <= iso && iso <= (c.end_date ?? c.closure_date);

export function todayClosure(closures: V2ActivityClosure[], now: SchedaNow): V2ActivityClosure | null {
    return closures.find(c => covers(c, now.iso)) ?? null;
}

/** «Solo per oggi»: una chiusura di un giorno solo, oggi. Si toglie con
 *  «Torna agli orari di sempre» senza toccare ferie più lunghe. */
export function isTodayOnly(c: V2ActivityClosure | null, now: SchedaNow): boolean {
    return Boolean(c && c.closure_date === now.iso && (c.end_date ?? c.closure_date) === now.iso);
}

export function nextClosure(closures: V2ActivityClosure[], now: SchedaNow): V2ActivityClosure | null {
    return [...closures].filter(c => c.closure_date > now.iso).sort((x, y) => x.closure_date.localeCompare(y.closure_date))[0] ?? null;
}

/** «24 dicembre», «24 – 26 dicembre», «31 dic – 2 gen». */
export function closureWhen(c: V2ActivityClosure): string {
    const [, m1, d1] = c.closure_date.split("-").map(Number);
    const end = c.end_date ?? c.closure_date;
    const [, m2, d2] = end.split("-").map(Number);
    if (end === c.closure_date) return `${d1} ${MONTHS[m1 - 1]}`;
    if (m1 === m2) return `${d1} – ${d2} ${MONTHS[m1 - 1]}`;
    return `${d1} ${MONTHS[m1 - 1].slice(0, 3)} – ${d2} ${MONTHS[m2 - 1].slice(0, 3)}`;
}

export const closureWhat = (c: V2ActivityClosure) => c.label?.trim() || (c.is_closed ? "Chiusura" : "Orari speciali");

export interface OpenNow {
    open: boolean;
    /** «Aperto · chiude alle 15», «Chiuso · apre alle 18:30», «Chiuso oggi». */
    text: string;
}

/** Quando si riapre dopo oggi: fra quanti giorni di servizio, e a che ora. */
export interface NextOpen {
    days: number;
    weekday: number;
    at: number;
}

function addDaysIso(iso: string, days: number): string {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Il primo turno dei prossimi sette giorni, chiusure comprese (la coda
 *  della notte prima, che parte a mezzanotte, non è una riapertura). */
export function nextOpening(hours: V2ActivityHours[], closures: V2ActivityClosure[], now: SchedaNow): NextOpen | null {
    const normalized = normalizeHours(hours);
    for (let days = 1; days <= 7; days++) {
        const first = getDaySlots(addDaysIso(now.iso, days), normalized, closures)
            .map(toSpan)
            .find(s => s.a > 0);
        if (first) return { days, weekday: (now.weekday + days) % 7, at: first.a };
    }
    return null;
}

/** «riapre domani alle 12», «riapre giovedì alle 19»; dopo mezzanotte il
 *  giorno dopo è già oggi sul calendario: «riapre alle 12». */
export function reopenText(next: NextOpen, now: SchedaNow): string {
    const calendarDays = next.days - (now.minutes >= 1440 ? 1 : 0);
    const when = calendarDays === 0 ? "" : calendarDays === 1 ? "domani " : `${DAY_LONG[next.weekday]} `;
    return `riapre ${when}alle ${hh(next.at)}`;
}

/** «Chiuso oggi» è solo della chiusura straordinaria (D169): finito l'ultimo
 *  turno si dice quando si riapre. */
export function openNow(spans: Span[], closure: V2ActivityClosure | null, now: SchedaNow, next: NextOpen | null = null): OpenNow {
    if (closure?.is_closed) return { open: false, text: "Chiuso oggi, straordinario" };
    const s = spans.find(x => now.minutes >= x.a && now.minutes < x.b);
    if (s) return { open: true, text: `Aperto · chiude alle ${hh(s.b)}` };
    const nx = spans.find(x => x.a > now.minutes);
    if (nx) return { open: false, text: `Chiuso · apre alle ${hh(nx.a)}` };
    return { open: false, text: next ? `Chiuso · ${reopenText(next, now)}` : "Chiuso" };
}

/** «7:30–15 · 18:30–23», «Chiuso». */
export const spansText = (spans: Span[]) => (spans.length ? spans.map(s => `${hh(s.a)}–${hh(s.b)}`).join(" · ") : "Chiuso");

/** I giorni con gli stessi orari si leggono insieme: «Mar–Gio  7:30–15 · 18:30–23». */
export function hoursGroups(weekSpans: Span[][], today: number): { days: string; text: string; today: boolean }[] {
    const out: { from: number; to: number; text: string }[] = [];
    weekSpans.forEach((spans, i) => {
        const text = spansText(spans);
        const last = out[out.length - 1];
        if (last && last.text === text && last.to === i - 1) last.to = i;
        else out.push({ from: i, to: i, text });
    });
    return out.map(g => ({
        days: g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`,
        text: g.text,
        today: today >= g.from && today <= g.to
    }));
}

// ── Contatti, conto, offerta ────────────────────────────────────────────────

type ContactField = "phone" | "email_public" | "website" | "instagram" | "facebook" | "whatsapp";
type ContactFlag =
    | "phone_public"
    | "email_public_visible"
    | "website_public"
    | "instagram_public"
    | "facebook_public"
    | "whatsapp_public";

export interface ContactDef {
    field: ContactField;
    flag: ContactFlag;
    label: string;
    placeholder: string;
    type: "text" | "email" | "url" | "tel";
    Icon: LucideIcon;
}

export const CONTACTS: ContactDef[] = [
    { field: "phone", flag: "phone_public", label: "Telefono", placeholder: "+39 02 1234567", type: "tel", Icon: Phone },
    { field: "email_public", flag: "email_public_visible", label: "Email", placeholder: "info@esempio.it", type: "email", Icon: Mail },
    { field: "website", flag: "website_public", label: "Sito web", placeholder: "https://…", type: "url", Icon: Globe },
    { field: "instagram", flag: "instagram_public", label: "Instagram", placeholder: "@nomelocale", type: "text", Icon: Instagram },
    { field: "facebook", flag: "facebook_public", label: "Facebook", placeholder: "https://facebook.com/…", type: "url", Icon: Facebook },
    { field: "whatsapp", flag: "whatsapp_public", label: "WhatsApp", placeholder: "+39 …", type: "tel", Icon: MessageCircle }
];

export const filledContacts = (a: V2Activity) => CONTACTS.filter(c => (a[c.field] ?? "").trim() !== "");
export const visibleContacts = (a: V2Activity) => filledContacts(a).filter(c => Boolean(a[c.flag]));

const num = (v: string) => v.replace(".", ",");

export function feesFilled(fees: ActivityFee[] | null): { def: FeeDefinition; value: string }[] {
    return FEE_DEFINITIONS.flatMap(def => {
        const value = fees?.find(f => f.key === def.key)?.value?.trim() ?? "";
        return value ? [{ def, value }] : [];
    });
}

/** «Coperto 2,00 €», «Servizio 10 %», «Età minima 18 anni». */
export function feeShort(def: FeeDefinition, value: string): string {
    const unit = def.unit.startsWith("€") ? " €" : def.unit === "%" ? " %" : def.unit ? ` ${def.unit}` : "";
    return `${def.label} ${num(value)}${unit}`;
}

/** Per il telefono: «2,00 €/persona». */
export const feeValue = (def: FeeDefinition, value: string) => `${num(value)} ${def.unit}`;

export const feesEmpty = (fees: ActivityFee[] | null) => {
    const filled = new Set(feesFilled(fees).map(f => f.def.key));
    return FEE_DEFINITIONS.filter(def => !filled.has(def.key));
};

export const streetLine = (a: V2Activity) => `${a.address ?? ""} ${a.street_number ?? ""}`.trim();
export const cityLine = (a: V2Activity) =>
    `${a.postal_code ?? ""} ${a.city ?? ""}${a.province ? ` (${a.province})` : ""}`.trim();
export const addressLine = (a: V2Activity) => [streetLine(a), cityLine(a)].filter(Boolean).join(", ");
export const hasAddress = (a: V2Activity) => Boolean((a.address ?? "").trim() && (a.city ?? "").trim());

// ── Stampanti ───────────────────────────────────────────────────────────────

/** `statuses` è l'esito fresco di «Riprova»; senza, vale lo stato salvato
 *  dall'ultimo evento (null = mai sentita, non «spenta»). */
export function printerDown(p: Printer, statuses: Record<string, boolean> | null): boolean {
    if (statuses && p.sn in statuses) return !statuses[p.sn];
    return p.is_online === false;
}

// ── Adesso ──────────────────────────────────────────────────────────────────

/** Un pezzo della frase di «Adesso»: `on`/`off` si colorano. */
export interface Segment {
    text: string;
    tone?: "on" | "off";
}

export interface NowFacts {
    activity: V2Activity;
    hasHours: boolean;
    spans: Span[];
    closure: V2ActivityClosure | null;
    now: SchedaNow;
    /** Dopo l'ultimo turno: quando si riapre. */
    reopen?: NextOpen | null;
    reservationsOn: boolean;
    orderingOn: boolean;
}

export function nowSentence(f: NowFacts): Segment[] {
    const out: Segment[] = [];
    const o = openNow(f.spans, f.closure, f.now, f.reopen ?? null);
    if (!f.hasHours) {
        out.push({ text: "Gli orari non ci sono ancora: la pagina non dice se siete aperti." });
    } else if (f.closure?.is_closed) {
        out.push({ text: "Oggi " }, { text: "siete chiusi", tone: "off" }, { text: ", fuori dal solito: la pagina lo dice già." });
    } else if (o.open) {
        const s = f.spans.find(x => f.now.minutes >= x.a && f.now.minutes < x.b)!;
        const nx = f.spans.find(x => x.a > f.now.minutes);
        out.push(
            { text: "Adesso siete " },
            { text: "aperti", tone: "on" },
            { text: ` fino alle ${hh(s.b)}${nx ? `, poi di nuovo dalle ${hh(nx.a)} alle ${hh(nx.b)}` : ""}.` }
        );
    } else {
        const nx = f.spans.find(x => x.a > f.now.minutes);
        const after = f.reopen ? `: ${reopenText(f.reopen, f.now).replace("riapre", "riaprite")}` : "";
        out.push({ text: nx ? `Adesso siete chiusi: riaprite alle ${hh(nx.a)}.` : `Per oggi avete chiuso${after}.` });
    }
    if (f.closure && !f.closure.is_closed && f.spans.length) {
        out.push({ text: ` Oggi chiudete alle ${hh(f.spans[f.spans.length - 1].b)}, fuori dal solito.` });
    }
    const can = [f.reservationsOn && "prenotare un tavolo", f.orderingOn && "ordinare dal tavolo"].filter(Boolean);
    if (f.closure?.is_closed) {
        if (f.reservationsOn) out.push({ text: " Si può prenotare per i prossimi giorni." });
    } else {
        out.push({
            text: can.length
                ? ` Dalla pagina si può ${can.join(" e ")}.`
                : " Dalla pagina si legge e basta: prenotazioni e ordini sono spenti."
        });
    }
    return out;
}

/** «Chiudi alle 21» ha senso solo se oggi si resta aperti oltre le 21 e non
 *  sono ancora passate. */
export const EARLY_CLOSE = 21 * 60;
export const canCloseEarly = (spans: Span[], now: SchedaNow) =>
    now.minutes < EARLY_CLOSE && spans.some(s => s.b > EARLY_CLOSE);

// ── Cosa c'è da sistemare ───────────────────────────────────────────────────

export type ProblemAction = { kind: "printer" } | { kind: "focus" } | { kind: "hoursPublic" };

export interface Problem {
    part: SchedaPart;
    text: string;
    button: string;
    action: ProblemAction;
}

export function problems(a: V2Activity, downPrinters: Printer[]): Problem[] {
    const out: Problem[] = [];
    if (a.ordering_enabled) {
        for (const p of downPrinters) {
            out.push({
                part: "ordini",
                text: `Le comande di «${p.label}» non escono: la stampante non risponde.`,
                button: "Riprova",
                action: { kind: "printer" }
            });
        }
    }
    if (!a.cover_image) out.push({ part: "locale", text: "Senza foto la vostra pagina parte dal nome.", button: "Aggiungi la foto", action: { kind: "focus" } });
    if (!(a.description ?? "").trim())
        out.push({ part: "locale", text: "Manca la presentazione: due righe su chi siete.", button: "Scrivila", action: { kind: "focus" } });
    if (!a.hours_public)
        out.push({ part: "orari", text: "Gli orari sono nascosti: il cliente non sa se siete aperti.", button: "Mostrali", action: { kind: "hoursPublic" } });
    if (!visibleContacts(a).length)
        out.push({ part: "contatti", text: "Nessun contatto sulla pagina: non vi possono chiamare.", button: "Mostrane uno", action: { kind: "focus" } });
    if (!hasAddress(a)) out.push({ part: "dove", text: "Manca l'indirizzo: la pagina non porta alla mappa.", button: "Scrivilo", action: { kind: "focus" } });
    return out;
}

// ── Lo stato di ogni parte (pallino dell'elenco, etichetta del fuoco) ───────

export type Tone = "ok" | "warn" | "off";
export const TONE_LABEL: Record<Tone, string> = { ok: "A posto", warn: "Da guardare", off: "Spento" };

export function partTone(part: SchedaPart, a: V2Activity, hasHours: boolean, downPrinters: Printer[]): Tone {
    switch (part) {
        case "locale":
            return a.cover_image && (a.name ?? "").trim() && (a.description ?? "").trim() ? "ok" : "warn";
        case "orari":
            return a.hours_public && hasHours ? "ok" : "warn";
        case "contatti": {
            const f = filledContacts(a).length;
            const v = visibleContacts(a).length;
            return v && f === v ? "ok" : "warn";
        }
        case "dove":
            return hasAddress(a) ? "ok" : "warn";
        case "link":
            return "ok";
        case "offrite":
            return a.payment_methods?.length || a.services?.length ? "ok" : "off";
        case "conto":
            return feesFilled(a.fees).length ? "ok" : "off";
        case "prenotazioni":
            return a.enable_reservations ? "ok" : "off";
        case "ordini":
            return !a.ordering_enabled ? "off" : downPrinters.length ? "warn" : "ok";
    }
}

// ── Tutto insieme, una volta per disegno ────────────────────────────────────

export interface SchedaFacts {
    /** La sede come sarà dopo il Salva (draft). */
    a: V2Activity;
    now: SchedaNow;
    hasHours: boolean;
    /** Oggi, chiusure comprese. */
    spans: Span[];
    /** La settimana, lunedì primo; oggi ha le fasce vere di oggi. */
    weekSpans: Span[][];
    /** La settimana di sempre, come la legge il cliente sulla pagina. */
    regular: Span[][];
    closure: V2ActivityClosure | null;
    next: V2ActivityClosure | null;
    /** Il prossimo turno dopo oggi (D169). */
    reopen: NextOpen | null;
    open: OpenNow;
    printers: Printer[];
    down: Printer[];
    reservationsLocked: boolean;
    orderingLocked: boolean;
}

export function buildFacts(input: {
    a: V2Activity;
    hours: V2ActivityHours[];
    closures: V2ActivityClosure[];
    now: SchedaNow;
    printers: Printer[];
    statuses: Record<string, boolean> | null;
    reservationsLocked: boolean;
    orderingLocked: boolean;
}): SchedaFacts {
    const { a, hours, closures, now } = input;
    const spans = todaySpans(hours, closures, now);
    const closure = todayClosure(closures, now);
    const reopen = nextOpening(hours, closures, now);
    const regular = DAY_SHORT.map((_, i) => weekdaySpans(hours, i));
    const weekSpans = regular.map((r, i) => (i === now.weekday ? spans.filter(s => s.b > 6 * 60) : r));
    return {
        a,
        now,
        hasHours: hours.some(h => !h.is_closed && h.opens_at),
        spans,
        weekSpans,
        regular,
        closure,
        next: nextClosure(closures, now),
        reopen,
        open: openNow(spans, closure, now, reopen),
        printers: input.printers,
        down: input.printers.filter(p => p.is_active && printerDown(p, input.statuses)),
        reservationsLocked: input.reservationsLocked,
        orderingLocked: input.orderingLocked
    };
}

/** La parte si vede sul telefono? (Ordini e link non hanno un pezzo loro:
 *  la card dice dove stanno.) */
export function partOnPhone(part: SchedaPart, f: SchedaFacts): boolean {
    const a = f.a;
    switch (part) {
        case "orari":
            return a.hours_public;
        case "offrite":
            return (a.payment_methods_public && (a.payment_methods ?? []).length > 0) || (a.services_public && (a.services ?? []).length > 0);
        case "conto":
            return a.fees_public && feesFilled(a.fees).length > 0;
        default:
            return true;
    }
}
