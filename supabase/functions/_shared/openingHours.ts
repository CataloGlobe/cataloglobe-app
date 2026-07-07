// Pure, dependency-free opening-hours evaluation for the ordering gate.
// Faithful port of src/pages/ReservationPage/availability.ts (getDaySlots +
// isTimeWithinSlots). day_of_week is Monday-based (0=Mon..6=Sun).
// Timezone handling lives in nowInRomeParts(); this core is fully pure/testable.

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

/**
 * Returns true if the activity is open at the given Rome wall-clock instant.
 * No configured hours => open (unrestricted): avoids blocking tenants that
 * never set up hours.
 */
export function isActivityOpen(parts: RomeParts, hours: HourRow[], closures: ClosureRow[]): boolean {
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

/** Derive Rome-local date/dow/minutes for an instant. Uses Intl (tz DB), deterministic per instant. */
export function nowInRomeParts(instant: Date): RomeParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
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
