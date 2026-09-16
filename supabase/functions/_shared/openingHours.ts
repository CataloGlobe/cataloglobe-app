// ⚠️ SYNC: questo file è il porto Edge di una logica che vive in TRE posti.
// Le altre due copie sono:
//   - src/pages/ReservationPage/availability.ts        (fasce del giorno,
//     coda notturna, chiusure straordinarie, orario dentro le fasce)
//   - src/pages/ReservationPage/utils/reservationSlots.ts (griglia offerta
//     al cliente: passo, intervallo semiaperto, preavviso, orizzonte)
// Qualsiasi modifica alla regola va replicata in TUTTI i file, nello stesso
// commit (stesso pattern di scheduleResolver.ts e priceSummary.ts).
//
// Pure, senza dipendenze di runtime Deno. `day_of_week` è Monday-based
// (0=lun..6=dom). Il fuso vive in `nowInRomeParts()` e in
// `wallClockToInstant()`: il nucleo è puro e testabile.
//
// ── Due domande, due risposte alla sede SENZA orari ────────────────────────
//
//   isActivityOpenNow          ordini (submit-order)       zero righe → APERTO
//   isReservationTimeBookable  prenotazioni                zero righe → NO
//
// Divergono di proposito. Ordinare da un menu non richiede che il locale
// abbia configurato gli orari: il cliente è già seduto, il locale è
// evidentemente aperto, e bloccare 18 sedi su 25 per una tabella vuota
// sarebbe un danno. Prenotare un tavolo sì: senza fasce non esiste un orario
// da offrire, e la pagina pubblica lo dice già da tempo (stato
// `hours-unconfigured`, `hasBookableDays`). Il server qui smette solo di
// contraddirla. NON «aggiustare» l'incoerenza allineando le due funzioni.

import { wallClockToInstant } from "./reservationCancellation.ts";

export interface HourRow {
  day_of_week: number;
  opens_at: string | null;   // "HH:MM" or "HH:MM:SS"
  closes_at: string | null;
  closes_next_day: boolean;
  is_closed: boolean;
  slot_index?: number;
}

export interface ClosureSlot { opens_at: string; closes_at: string; closes_next_day: boolean; }
export interface ClosureRow {
  closure_date: string;        // ISO "YYYY-MM-DD"
  end_date: string | null;     // inclusive range end
  is_closed: boolean;
  slots: ClosureSlot[] | null;
}

export interface RomeParts {
  isoDate: string;      // today in Europe/Rome
  prevIsoDate: string;  // yesterday in Europe/Rome
  dow: number;          // Monday-based 0..6 for isoDate
  prevDow: number;      // Monday-based 0..6 for prevIsoDate
  minutes: number;      // minutes since midnight, local wall clock
}

interface EffSlot { opens: number; closes: number; nextDay: boolean; }

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}/;

function toMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function findClosureCovering(isoDate: string, closures: ClosureRow[]): ClosureRow | null {
  for (const c of closures) {
    const end = c.end_date ?? c.closure_date;
    if (c.closure_date <= isoDate && isoDate <= end) return c;
  }
  return null;
}

function effectiveSlots(isoDate: string, dow: number, hours: HourRow[], closures: ClosureRow[]): EffSlot[] {
  const c = findClosureCovering(isoDate, closures);
  if (c) {
    if (c.is_closed) return [];
    return (c.slots ?? []).map((s) => ({
      opens: toMinutes(s.opens_at), closes: toMinutes(s.closes_at), nextDay: s.closes_next_day,
    }));
  }
  return hours
    .filter((h) => h.day_of_week === dow && !h.is_closed && h.opens_at && h.closes_at)
    .map((h) => ({ opens: toMinutes(h.opens_at as string), closes: toMinutes(h.closes_at as string), nextDay: h.closes_next_day }));
}

// ── Ordini: è aperto ADESSO? ────────────────────────────────────────────────

/**
 * Returns true if the activity is open at the given Rome wall-clock instant.
 * No configured hours => open (unrestricted): avoids blocking tenants that
 * never set up hours. Vedi l'intestazione del file: NON allineare a
 * `isReservationTimeBookable`.
 */
export function isActivityOpenNow(parts: RomeParts, hours: HourRow[], closures: ClosureRow[]): boolean {
  if (hours.length === 0) return true;

  const todayClosure = findClosureCovering(parts.isoDate, closures);

  for (const s of effectiveSlots(parts.isoDate, parts.dow, hours, closures)) {
    if (s.nextDay) {
      if (parts.minutes >= s.opens) return true;
    } else if (parts.minutes >= s.opens && parts.minutes < s.closes) {
      return true;
    }
  }

  // Previous-day overnight tail — suppressed when today is itself a closure day.
  if (!todayClosure) {
    for (const s of effectiveSlots(parts.prevIsoDate, parts.prevDow, hours, closures)) {
      if (s.nextDay && parts.minutes < s.closes) return true;
    }
  }
  return false;
}

// ── Prenotazioni: QUESTO istante è prenotabile online? ──────────────────────

export type ReservationBookabilityFailure =
  | "VENUE_NOT_BOOKABLE"   // la sede non ha nessuna riga di orari
  | "BEYOND_HORIZON"       // data oltre `reservation_horizon_days`
  | "VENUE_CLOSED"         // giorno di chiusura, o nessuna fascia copre l'orario
  | "TIME_NOT_ON_GRID"     // dentro una fascia, ma non un orario che il picker offre
  | "TOO_SOON";            // prima di now + preavviso (copre «ora già passata»)

export type ReservationBookability =
  | { ok: true }
  | { ok: false; reason: ReservationBookabilityFailure };

export interface ReservationBookabilityInput {
  hours: HourRow[];
  closures: ClosureRow[];
  /** "YYYY-MM-DD", data di calendario a muro (Europe/Rome). */
  reservationDate: string;
  /** "HH:MM" o "HH:MM:SS". */
  reservationTime: string;
  /** `activities.reservation_pacing_slot_minutes`: passo della griglia. */
  slotMinutes: number;
  /** `activities.reservation_min_notice_minutes`. */
  minNoticeMinutes: number;
  /** `activities.reservation_horizon_days`, oggi compreso. */
  horizonDays: number;
  /** Istante corrente. Iniettato per i test. */
  now: Date;
}

/** Fascia del giorno come la vede il picker: `[opens, closesExclusive)` in minuti. */
interface DaySlot { opens: number; closesExclusive: number; }

/** Monday-based dow (0=lun..6=dom) di una data ISO, senza fuso: è calendario. */
function mondayDowOfIso(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Le fasce prenotabili di una data, porto di `availability.ts:getDaySlots`
 * appiattito al modo in cui la griglia le consuma (`reservationSlots.ts:
 * generateDaySlots`):
 *   1. una chiusura che copre la data SOSTITUISCE gli orari del giorno e
 *      sopprime la coda notturna del giorno prima (piena → nessuna fascia;
 *      parziale → i suoi `slots`);
 *   2. altrimenti le righe di `activity_hours` del giorno;
 *   3. in testa, la coda del giorno prima quando `closes_next_day`:
 *      `00:00–closes_at` (la coda non trabocca oltre).
 * `closes_next_day` sul giorno stesso significa «fino a mezzanotte»: la parte
 * dopo appartiene a D+1 come coda. Intervallo SEMIAPERTO: l'orario esatto di
 * chiusura non è una fascia.
 */
function reservationDaySlots(isoDate: string, hours: HourRow[], closures: ClosureRow[]): DaySlot[] {
  const closure = findClosureCovering(isoDate, closures);
  if (closure) {
    return effectiveSlots(isoDate, mondayDowOfIso(isoDate), hours, closures)
      .map((s) => ({ opens: s.opens, closesExclusive: s.nextDay ? 24 * 60 : s.closes }));
  }
  const prevIso = addDaysIso(isoDate, -1);
  const tails: DaySlot[] = effectiveSlots(prevIso, mondayDowOfIso(prevIso), hours, closures)
    .filter((s) => s.nextDay && s.closes > 0)
    .map((s) => ({ opens: 0, closesExclusive: s.closes }));
  const main: DaySlot[] = effectiveSlots(isoDate, mondayDowOfIso(isoDate), hours, closures)
    .map((s) => ({ opens: s.opens, closesExclusive: s.nextDay ? 24 * 60 : s.closes }));
  return [...tails, ...main];
}

/**
 * Il cancello server-side della prenotazione online. Mette sul server quello
 * che il form pubblico già applica, più il preavviso minimo. Riporta QUALE
 * controllo ha fallito; il primo che fallisce decide.
 *
 * Ordine: quello in cui il cliente li incontra sul picker — prima la sede
 * (ha orari?), poi la data (nell'orizzonte? aperta?), poi l'orario (sulla
 * griglia? ancora raggiungibile?).
 *
 * «Sulla griglia» vuol dire: uno degli orari che `generateDaySlots` avrebbe
 * emesso — multiplo del passo a partire dall'apertura della fascia, dentro
 * `[apre, chiude)`. Un locale che chiude alle 23:00 con passo 15 ha come
 * ultimo slot le 22:45: le 23:00 sono VENUE_CLOSED, non TIME_NOT_ON_GRID,
 * perché nessuna fascia le contiene.
 *
 * Il confronto di preavviso è fra ISTANTI (Europe/Rome), non fra date: con
 * preavviso 0 rifiuta anche «oggi alle 12:00» richiesto alle 12:30. Non
 * esiste un secondo controllo «non nel passato»: è lo stesso, con parametro 0.
 *
 * Data o ora non interpretabili → VENUE_CLOSED: nessuna fascia le contiene.
 * La Edge valida la forma prima, quindi qui è solo difesa in profondità.
 */
export function isReservationTimeBookable(input: ReservationBookabilityInput): ReservationBookability {
  const { hours, closures, reservationDate, reservationTime, slotMinutes, minNoticeMinutes, horizonDays, now } = input;

  // 1. La sede ha orari.
  if (hours.length === 0) return { ok: false, reason: "VENUE_NOT_BOOKABLE" };

  if (!ISO_DATE_RE.test(reservationDate) || !HHMM_RE.test(reservationTime)) {
    return { ok: false, reason: "VENUE_CLOSED" };
  }

  // 2. Orizzonte: da oggi (Roma) a oggi + horizon - 1, compresi. Stessa
  //    finestra di `buildHorizonDays`. Il passato è affare del preavviso.
  const todayIso = nowInRomeParts(now).isoDate;
  const lastIso = addDaysIso(todayIso, Math.max(1, Math.floor(horizonDays)) - 1);
  if (reservationDate > lastIso) return { ok: false, reason: "BEYOND_HORIZON" };

  // 3. La data ha fasce, e una di esse contiene l'orario.
  const slots = reservationDaySlots(reservationDate, hours, closures);
  const t = toMinutes(reservationTime);
  const slot = slots.find((s) => t >= s.opens && t < s.closesExclusive);
  if (!slot) return { ok: false, reason: "VENUE_CLOSED" };

  // 4. L'orario è uno di quelli offerti: apertura + k·passo.
  const step = Number.isFinite(slotMinutes) && slotMinutes > 0 ? Math.floor(slotMinutes) : 15;
  if ((t - slot.opens) % step !== 0) return { ok: false, reason: "TIME_NOT_ON_GRID" };

  // 5. Preavviso, fra istanti.
  const instant = wallClockToInstant(reservationDate, reservationTime);
  if (instant === null) return { ok: false, reason: "TOO_SOON" };
  const notice = Number.isFinite(minNoticeMinutes) && minNoticeMinutes > 0 ? minNoticeMinutes : 0;
  if (instant.getTime() < now.getTime() + notice * 60_000) return { ok: false, reason: "TOO_SOON" };

  return { ok: true };
}

/** Derive Rome-local date/dow/minutes for an instant. Uses Intl (tz DB), deterministic per instant. */
export function nowInRomeParts(instant: Date): RomeParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  // Some ICU builds render midnight as "24" with hour12:false.
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const minutes = hour * 60 + Number(parts.minute);
  const shortToMon: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const dow = shortToMon[parts.weekday as string];
  const prev = nowInRomePartsDateOnly(new Date(instant.getTime() - 24 * 60 * 60 * 1000));
  return { isoDate, prevIsoDate: prev.isoDate, dow, prevDow: prev.dow, minutes };
}

function nowInRomePartsDateOnly(instant: Date): { isoDate: string; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const shortToMon: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { isoDate: `${parts.year}-${parts.month}-${parts.day}`, dow: shortToMon[parts.weekday as string] };
}
