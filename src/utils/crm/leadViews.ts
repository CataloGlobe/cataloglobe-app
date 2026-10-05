/**
 * La pagina Lead in dati (canvas V4, R4a, R4b, T8a; versione finale del
 * 2026-10-05): le viste con i conteggi, il binario delle fasi, la frase
 * dell'ultimo contatto e il Riepilogo del giro. Puro: legge ciò che la
 * pagina ha già caricato.
 */
import type { CrmAppointmentWithVenue, CrmLeadSource, CrmStage, CrmVenueListItem } from "@/types/crm";
import { CRM_STAGES } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { relativeAgo } from "@/utils/crm/crmHome";
import { romeParts } from "@shared/crmCallSlots";

export type LeadView =
    | "riepilogo"
    | "da-lavorare"
    | "senza-nessuno"
    | "in-conversazione"
    | "telefonate"
    | "fermi"
    | "miei"
    | "paganti"
    | "persi"
    | "tutti";

export interface LeadViewMeta {
    view: Exclude<LeadView, "riepilogo">;
    label: string;
    /** Nome corto per i chip (telefono, finestra stretta). */
    short: string;
    /** Le viste chiuse stanno sotto «Altro». */
    group: "lavoro" | "altro";
}

export const LEAD_VIEWS: LeadViewMeta[] = [
    { view: "da-lavorare", label: "Da lavorare", short: "Da lavorare", group: "lavoro" },
    { view: "senza-nessuno", label: "Nuovi, senza nessuno", short: "Senza nessuno", group: "lavoro" },
    { view: "in-conversazione", label: "In conversazione", short: "In conversazione", group: "lavoro" },
    { view: "telefonate", label: "Telefonate fissate", short: "Telefonate", group: "lavoro" },
    { view: "fermi", label: "Fermi da più di 3 giorni", short: "Fermi", group: "lavoro" },
    { view: "miei", label: "I miei", short: "Miei", group: "lavoro" },
    { view: "paganti", label: "Clienti paganti", short: "Paganti", group: "altro" },
    { view: "persi", label: "Persi", short: "Persi", group: "altro" },
    { view: "tutti", label: "Tutti", short: "Tutti", group: "altro" }
];

const VIEW_SET = new Set<string>(["riepilogo", ...LEAD_VIEWS.map(v => v.view)]);

/** `?vista=` della pagina; la vecchia `pipeline` e i valori sconosciuti tornano a «Da lavorare». */
export function parseLeadView(raw: string | null): LeadView {
    return raw && VIEW_SET.has(raw) ? (raw as LeadView) : "da-lavorare";
}

const CLOSED: CrmStage[] = ["cliente_pagante", "perso"];
const DAY_MS = 24 * 60 * 60 * 1000;
/** «Fermi»: nessun movimento da più di tre giorni. */
export const STALE_DAYS = 3;

export function isOpen(v: CrmVenueListItem): boolean {
    return !CLOSED.includes(v.stage);
}

export function isStale(v: CrmVenueListItem, now: Date): boolean {
    return isOpen(v) && now.getTime() - new Date(v.last_activity_at).getTime() > STALE_DAYS * DAY_MS;
}

export function matchesView(v: CrmVenueListItem, view: LeadView, ctx: { userId: string | null; now: Date }): boolean {
    switch (view) {
        case "riepilogo":
        case "tutti":
            return true;
        case "da-lavorare":
            return isOpen(v);
        case "senza-nessuno":
            return isOpen(v) && v.assigned_to === null;
        case "in-conversazione":
            return v.stage === "in_conversazione";
        case "telefonate":
            return v.stage === "telefonata_fissata";
        case "fermi":
            return isStale(v, ctx.now);
        case "miei":
            return isOpen(v) && ctx.userId !== null && v.assigned_to === ctx.userId;
        case "paganti":
            return v.stage === "cliente_pagante";
        case "persi":
            return v.stage === "perso";
    }
}

export function viewCounts(venues: CrmVenueListItem[], ctx: { userId: string | null; now: Date }): Record<LeadView, number> {
    const counts = {} as Record<LeadView, number>;
    for (const meta of LEAD_VIEWS) counts[meta.view] = venues.filter(v => matchesView(v, meta.view, ctx)).length;
    counts.riepilogo = venues.length;
    return counts;
}

/** Le colonne e il binario: da Nuovo a Pagante. Perso è un filtro, non una tacca. */
export const PIPELINE_STAGES: CrmStage[] = CRM_STAGES.filter(s => s !== "perso");

/** Dove sta sul binario (0 = Nuovo); null per Perso. */
export function trackIndex(stage: CrmStage): number | null {
    const i = PIPELINE_STAGES.indexOf(stage);
    return i < 0 ? null : i;
}

/** Ricerca su nome del locale, città, persona e numero (senza spazi né +). */
export function searchLeads(venues: CrmVenueListItem[], query: string): CrmVenueListItem[] {
    const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const q = fold(query.trim());
    if (!q) return venues;
    const digits = q.replace(/[^\d]/g, "");
    return venues.filter(v => {
        const contact = v.crm_contacts[0];
        if (fold(`${v.name} ${v.city ?? ""} ${contact?.name ?? ""}`).includes(q)) return true;
        return digits.length >= 3 && (contact?.phone_e164 ?? "").replace(/[^\d]/g, "").includes(digits);
    });
}

const WEEKDAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long" });
const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" });

function romeDayNumber(at: Date): number {
    const p = romeParts(at);
    return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
}

/** «oggi 17:45», «domani 11:00», «martedì 18:00» (entro una settimana), altrimenti la data. */
export function dayAndTime(iso: string, now: Date): string {
    const at = new Date(iso);
    const diff = romeDayNumber(at) - romeDayNumber(now);
    const time = HOUR.format(at);
    if (diff === 0) return `oggi ${time}`;
    if (diff === 1) return `domani ${time}`;
    if (diff === -1) return `ieri ${time}`;
    if (diff > 1 && diff < 7) return `${WEEKDAY.format(at)} ${time}`;
    return `${at.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" })} ${time}`;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Il giorno della prova («giorno 4 di 30»); null fuori da In prova. */
export function trialDay(venue: CrmVenueListItem, now: Date): { day: number; total: number } | null {
    if (venue.stage !== "in_prova" || !venue.trial_ends_at) return null;
    const start = new Date(venue.stage_changed_at).getTime();
    const end = new Date(venue.trial_ends_at).getTime();
    const total = Math.max(1, Math.round((end - start) / DAY_MS));
    return { day: Math.min(total, Math.max(1, Math.floor((now.getTime() - start) / DAY_MS) + 1)), total };
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short" });
const MONTH = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", month: "long" });

/** La versione corta per le carte delle colonne: «oggi 17:45», «mar 18:00». */
export function shortDayAndTime(iso: string, now: Date): string {
    const at = new Date(iso);
    const diff = romeDayNumber(at) - romeDayNumber(now);
    const time = HOUR.format(at);
    if (diff === 0) return `oggi ${time}`;
    if (diff === 1) return `domani ${time}`;
    if (diff > 1 && diff < 7) return `${WEEKDAY_SHORT.format(at)} ${time}`;
    return at.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
}

/** «3 giorni» → «3 gg», per le carte strette. */
function shortAgo(iso: string, now: Date): string {
    return relativeAgo(iso, now).replace(/ giorni$/, " gg");
}

/** La riga piccola di una carta delle colonne (R4a), dopo la città. */
export function cardMeta(input: {
    venue: CrmVenueListItem;
    wait: VenueWait | undefined;
    next: CrmAppointmentWithVenue | undefined;
    now: Date;
}): ContactLine {
    const { venue, wait, next, now } = input;
    if (wait) return { text: wait.wait, warn: wait.level !== "normale" };
    if (next) return { text: shortDayAndTime(next.starts_at, now), warn: false };
    const trial = trialDay(venue, now);
    if (trial) return { text: `giorno ${trial.day} di ${trial.total}`, warn: false };
    if (venue.stage === "cliente_pagante") return { text: `da ${MONTH.format(new Date(venue.stage_changed_at))}`, warn: false };
    return { text: shortAgo(venue.last_activity_at, now), warn: isStale(venue, now) };
}

/** «è nuovo e nessuno lo segue» → «Nuovo, nessuno lo segue»: la frase della riga al telefono. */
export function waitSentence(text: string): string {
    return capitalize(text.replace(/^è nuovo e /, "nuovo, "));
}

/** In Colonne «Da lavorare» tiene anche i paganti (colonna verde); Perso resta fuori. */
export function boardVenues(venues: CrmVenueListItem[], view: LeadView, ctx: { userId: string | null; now: Date }): CrmVenueListItem[] {
    if (view === "da-lavorare" || view === "riepilogo") return venues.filter(v => v.stage !== "perso");
    return venues.filter(v => v.stage !== "perso" && matchesView(v, view, ctx));
}

export interface ContactLine {
    text: string;
    /** Arancio: c'è qualcosa che aspetta o è fermo da troppo. */
    warn: boolean;
}

/**
 * «Ultimo contatto» in una frase (R4b): cosa aspetta voi, il prossimo
 * appuntamento, il giorno della prova, oppure da quanto non si muove.
 */
export function contactLine(input: {
    venue: CrmVenueListItem;
    wait: VenueWait | undefined;
    next: CrmAppointmentWithVenue | undefined;
    now: Date;
}): ContactLine {
    const { venue, wait, next, now } = input;
    if (wait) {
        // «ha scritto: la risposta è pronta» → «ha scritto»: nell'elenco basta il fatto.
        const what = wait.text.replace(/^è nuovo e /, "").replace(/:.*$/, "");
        return { text: `${wait.wait} fa, ${what}`, warn: wait.level !== "normale" };
    }
    if (next) {
        const what = venue.stage === "demo_fissata" ? "Demo" : "Telefonata";
        return { text: `${what} ${dayAndTime(next.starts_at, now)}`, warn: false };
    }
    const trial = trialDay(venue, now);
    if (trial) return { text: `Prova giorno ${trial.day} di ${trial.total}`, warn: false };
    if (venue.stage === "cliente_pagante") return { text: `Cliente da ${relativeAgo(venue.stage_changed_at, now)}`, warn: false };
    if (venue.stage === "perso") return { text: venue.lost_reason ?? "Perso", warn: false };
    const ago = capitalize(relativeAgo(venue.last_activity_at, now));
    const when = ago === "Adesso" || ago === "Ieri" ? ago : `${ago} fa`;
    if (isStale(venue, now)) {
        const why =
            venue.stage === "telefonata_fatta" || venue.stage === "demo_fatta"
                ? "fase da aggiornare"
                : venue.stage === "contattato"
                  ? "nessuna risposta"
                  : "fermo";
        return { text: `${when}, ${why}`, warn: true };
    }
    return { text: when, warn: false };
}

/** Il primo appuntamento ancora da fare di ogni locale. */
export function nextAppointments(appointments: CrmAppointmentWithVenue[], now: Date): Map<string, CrmAppointmentWithVenue> {
    const nowIso = now.toISOString();
    const next = new Map<string, CrmAppointmentWithVenue>();
    for (const a of [...appointments].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
        if (a.status === "cancelled" || a.starts_at < nowIso || next.has(a.venue_id)) continue;
        next.set(a.venue_id, a);
    }
    return next;
}

/** Le iniziali per il pallino di chi segue il locale. */
export function initials(name: string | null): string {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

// ── Riepilogo (V4) ──────────────────────────────────────────────────────

export type SummaryPeriod = "7" | "30" | "90";

export const SUMMARY_PERIODS: { value: SummaryPeriod; label: string }[] = [
    { value: "7", label: "7 gg" },
    { value: "30", label: "30 gg" },
    { value: "90", label: "Trimestre" }
];

export interface FunnelRow {
    stage: CrmStage;
    reached: number;
    /** «5 mai raggiunti» (Contattato) o «13 si fermano qui»; null se non c'è niente da dire. */
    note: string | null;
    /** La fase dove se ne fermano di più. */
    worst: boolean;
}

export interface LeadSummary {
    arrived: number;
    /** Percentuale di chi è arrivato almeno a In conversazione; null senza arrivi. */
    repliedPct: number | null;
    clients: number;
    /** Giorni, mediana, dall'arrivo al pagamento; null senza clienti. */
    daysToPay: number | null;
    funnel: FunnelRow[];
    sources: { source: CrmLeadSource; count: number }[];
    /** Minuti, mediana, dall'arrivo al primo contatto; null se nessuno è stato contattato. */
    firstReplyMinutes: number | null;
    /** Giorni, mediana, dall'arrivo alla prima telefonata fissata. */
    daysToCall: number | null;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const CONTATTATO = PIPELINE_STAGES.indexOf("contattato");
const IN_CONVERSAZIONE = PIPELINE_STAGES.indexOf("in_conversazione");

/**
 * Il giro dei lead arrivati nel periodo. Le fasi raggiunte si leggono dalla
 * fase di adesso (chi è in Demo fatta è passato da tutte quelle prima); un
 * Perso conta fino a Contattato se qualcuno lo aveva contattato.
 */
export function leadSummary(input: {
    venues: CrmVenueListItem[];
    appointments: CrmAppointmentWithVenue[];
    period: SummaryPeriod;
    now: Date;
}): LeadSummary {
    const { venues, appointments, period, now } = input;
    const from = now.getTime() - Number(period) * DAY_MS;
    const arrived = venues.filter(v => new Date(v.created_at).getTime() >= from);

    const reachedIndex = (v: CrmVenueListItem) => trackIndex(v.stage) ?? (v.first_contacted_at ? CONTATTATO : 0);
    const reached = PIPELINE_STAGES.map((_, i) => arrived.filter(v => reachedIndex(v) >= i).length);

    const drops = PIPELINE_STAGES.map((_, i) =>
        i >= IN_CONVERSAZIONE && i < PIPELINE_STAGES.length - 1 ? reached[i] - reached[i + 1] : 0
    );
    const worstDrop = Math.max(0, ...drops);
    const funnel: FunnelRow[] = PIPELINE_STAGES.map((stage, i) => {
        let note: string | null = null;
        if (i === CONTATTATO && reached[0] - reached[i] > 0) note = `${reached[0] - reached[i]} mai raggiunti`;
        if (drops[i] > 0) note = `${drops[i]} ${drops[i] === 1 ? "si ferma" : "si fermano"}`;
        const worst = worstDrop > 0 && drops[i] === worstDrop;
        if (worst) note = `${note} qui`;
        return { stage, reached: reached[i], note, worst };
    });

    const clientsList = arrived.filter(v => v.stage === "cliente_pagante");
    const bySource = new Map<CrmLeadSource, number>();
    for (const v of arrived) {
        const source = v.crm_leads[0]?.source;
        if (source) bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    const firstCall = new Map<string, number>();
    for (const a of appointments) {
        const t = new Date(a.created_at).getTime();
        if (!firstCall.has(a.venue_id) || t < (firstCall.get(a.venue_id) ?? Infinity)) firstCall.set(a.venue_id, t);
    }

    return {
        arrived: arrived.length,
        repliedPct: arrived.length ? Math.round((reached[IN_CONVERSAZIONE] / arrived.length) * 100) : null,
        clients: clientsList.length,
        daysToPay: median(
            clientsList.map(v => (new Date(v.stage_changed_at).getTime() - new Date(v.created_at).getTime()) / DAY_MS)
        ),
        funnel,
        sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        firstReplyMinutes: median(
            arrived
                .filter(v => v.first_contacted_at)
                .map(v => (new Date(v.first_contacted_at as string).getTime() - new Date(v.created_at).getTime()) / 60000)
        ),
        daysToCall: median(
            arrived
                .filter(v => firstCall.has(v.id))
                .map(v => ((firstCall.get(v.id) as number) - new Date(v.created_at).getTime()) / DAY_MS)
        )
    };
}

/** «18 min», «3 ore», «2 giorni»: per le velocità del Riepilogo. */
export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
    const hours = minutes / 60;
    if (hours < 24) return Math.round(hours) === 1 ? "1 ora" : `${Math.round(hours)} ore`;
    const days = Math.round(hours / 24);
    return days === 1 ? "1 giorno" : `${days} giorni`;
}
