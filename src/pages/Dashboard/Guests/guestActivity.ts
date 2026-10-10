import type { GuestVisitMark } from "@/services/supabase/reservationGuests";
import type { ReservationGuestSummary } from "@/types/reservationGuest";

/**
 * Chi torna e chi no, dalle visite dei clienti in elenco (Clienti A, D154).
 * Puro: nessuna rete, la data di oggi arriva da fuori. Testabile.
 */

/** Un mese dei dodici: 0 nessuna visita, 1 è venuto, 2 solo assenze. */
export type MonthMark = 0 | 1 | 2;

export interface GuestActivity {
    /** Gli ultimi 12 mesi, dal più vecchio a questo. */
    months: MonthMark[];
    /** Le volte che è venuto negli ultimi 12 mesi. */
    visits12: number;
    /** Le volte che è venuto, da sempre. */
    came: number;
    /** L'ultima volta che è venuto ("YYYY-MM-DD"), o null. */
    lastCame: string | null;
    /** Le sedi da cui è passato, dalla più frequentata. */
    sedi: { id: string; name: string }[];
}

/** Venuto davvero: la prenotazione c'è stata ed è già passata. */
const CAME = new Set(["confirmed", "seated", "completed"]);

/** Le soglie dei filtri, in un posto solo. */
export const REGULAR_VISITS_12 = 6;
export const LOST_MIN_VISITS = 4;
export const LOST_DAYS = 90;
export const NEW_DAYS = 30;

/** "YYYY-MM-DD" della data locale. */
export function isoDay(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

function daysBefore(today: Date, days: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return isoDay(d);
}

export function summarizeGuestVisits(
    marks: readonly GuestVisitMark[],
    today: Date
): Map<string, GuestActivity> {
    const todayIso = isoDay(today);
    // L'indice del mese: 11 è questo, 0 è undici mesi fa.
    const monthIndex = (iso: string) => {
        const [y, m] = iso.split("-").map(n => parseInt(n, 10));
        return 11 - ((today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m));
    };
    const out = new Map<string, GuestActivity>();
    const sedeCount = new Map<string, Map<string, { name: string; n: number }>>();

    for (const v of marks) {
        if (v.reservation_date > todayIso) continue;
        let g = out.get(v.guest_id);
        if (!g) {
            g = { months: Array<MonthMark>(12).fill(0), visits12: 0, came: 0, lastCame: null, sedi: [] };
            out.set(v.guest_id, g);
        }
        const i = monthIndex(v.reservation_date);
        if (CAME.has(v.status)) {
            g.came += 1;
            if (!g.lastCame || v.reservation_date > g.lastCame) g.lastCame = v.reservation_date;
            if (i >= 0 && i < 12) {
                g.months[i] = 1;
                g.visits12 += 1;
            }
            const sedi = sedeCount.get(v.guest_id) ?? new Map();
            const s = sedi.get(v.activity_id) ?? { name: v.activity_name ?? "sede", n: 0 };
            s.n += 1;
            sedi.set(v.activity_id, s);
            sedeCount.set(v.guest_id, sedi);
        } else if (v.status === "no_show" && i >= 0 && i < 12 && g.months[i] === 0) {
            g.months[i] = 2;
        }
    }
    for (const [guestId, sedi] of sedeCount) {
        const g = out.get(guestId);
        if (!g) continue;
        g.sedi = [...sedi.entries()].sort((a, b) => b[1].n - a[1].n).map(([id, s]) => ({ id, name: s.name }));
    }
    return out;
}

export type GuestFilter = "all" | "regular" | "new" | "lost" | "absent";

const hasTag = (tags: readonly string[] | undefined, tag: string) =>
    (tags ?? []).some(t => t.trim().toLowerCase() === tag);

/** Abituale: lo dice un'etichetta, o è venuto almeno 6 volte nell'anno. */
export function isRegular(activity: GuestActivity | undefined, tags: readonly string[] | undefined): boolean {
    return hasTag(tags, "abituale") || (activity?.visits12 ?? 0) >= REGULAR_VISITS_12;
}

export function isNew(guest: ReservationGuestSummary, today: Date): boolean {
    return guest.first_visit_date !== null && guest.first_visit_date >= daysBefore(today, NEW_DAYS);
}

/** Non torna: è venuto almeno 4 volte, l'ultima più di 3 mesi fa. */
export function isLost(activity: GuestActivity | undefined, today: Date): boolean {
    if (!activity || activity.came < LOST_MIN_VISITS || !activity.lastCame) return false;
    return activity.lastCame < daysBefore(today, LOST_DAYS);
}

export function matchesGuestFilter(
    filter: GuestFilter,
    guest: ReservationGuestSummary,
    activity: GuestActivity | undefined,
    tags: readonly string[] | undefined,
    today: Date
): boolean {
    switch (filter) {
        case "all":
            return true;
        case "regular":
            return isRegular(activity, tags);
        case "new":
            return isNew(guest, today);
        case "lost":
            return isLost(activity, today);
        case "absent":
            return guest.visible_no_shows > 0;
    }
}
