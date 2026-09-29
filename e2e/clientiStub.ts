import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Clienti (lotto `ds-5-coda`, P0).
 *
 * Rubrica, note per sede, visite e sedi rispondono da qui (`restStub.ts`:
 * scritture intercettate, 500 per quelle non registrate). La ricerca applica
 * l'`or` di PostgREST su nome/email/telefono, che `matches` non fa. Permessi,
 * piano, azienda e sidebar restano veri.
 *
 * | Cliente | Visite | Assenze | Etichette |
 * |---|---|---|---|
 * | Giulia Rossi e2e | 7 | 0 | abituale (Centro), VIP (Porto) |
 * | Marco Bianchi e2e | 3 | 2 | — |
 * | Sara Verdi e2e | 1 | 0 | — |
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5c000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const GUEST = { rossi: uuid(1), bianchi: uuid(2), verdi: uuid(3) } as const;
export const { SEDE } = sediOf("e2e5c000");

function guest(id: string, name: string, phone: string, extra: Row = {}): Row {
    return {
        id,
        tenant_id: TENANT_ID,
        phone_e164: phone,
        display_name: name,
        email: null,
        created_at: "2026-03-01T10:00:00.000Z",
        updated_at: "2026-03-01T10:00:00.000Z",
        visible_visits: 1,
        visible_no_shows: 0,
        first_visit_date: "2026-03-01",
        last_visit_date: "2026-03-01",
        visible_activities: 1,
        ...extra
    };
}

function note(guestId: string, activityId: string, notes: string | null, tags: string[]): Row {
    return {
        id: `${guestId.slice(0, -4)}${activityId.slice(-4)}`,
        tenant_id: TENANT_ID,
        guest_id: guestId,
        activity_id: activityId,
        notes,
        tags,
        created_at: "2026-03-01T10:00:00.000Z",
        updated_at: "2026-03-01T10:00:00.000Z"
    };
}

export function makeTables(count?: number): Tables {
    const sedi = appearanceTables("e2e5c000", []);
    const guests = [
        guest(GUEST.rossi, "Giulia Rossi e2e", "+393331112233", {
            email: "giulia@example.com",
            visible_visits: 7,
            first_visit_date: "2025-11-04",
            last_visit_date: "2026-09-20",
            visible_activities: 2
        }),
        guest(GUEST.bianchi, "Marco Bianchi e2e", "+393334445566", {
            visible_visits: 3,
            visible_no_shows: 2,
            first_visit_date: "2026-05-10",
            last_visit_date: "2026-09-12"
        }),
        guest(GUEST.verdi, "Sara Verdi e2e", "+393337778899", {
            first_visit_date: "2026-09-01",
            last_visit_date: "2026-09-01"
        })
    ];
    // Il tetto dei 200 della rubrica: righe finte oltre le tre vere.
    for (let i = guests.length; i < (count ?? guests.length); i++) {
        guests.push(guest(uuid(1000 + i), `Cliente ${i} e2e`, `+39300${String(i).padStart(7, "0")}`, { last_visit_date: "2026-01-01" }));
    }
    return {
        v_reservation_guests_directory: guests,
        reservation_guest_notes: [
            note(GUEST.rossi, SEDE.centro, "Preferisce il tavolo in fondo.", ["abituale"]),
            note(GUEST.rossi, SEDE.porto, null, ["VIP"])
        ],
        v_reservation_guest_visits: [
            {
                reservation_id: uuid(801),
                guest_id: GUEST.rossi,
                tenant_id: TENANT_ID,
                activity_id: SEDE.centro,
                activity_name: "Centro e2e",
                reservation_date: "2026-09-20",
                reservation_time: "20:30:00",
                party_size: 4,
                status: "completed",
                guest_notes: "Un seggiolone, grazie"
            },
            {
                reservation_id: uuid(802),
                guest_id: GUEST.rossi,
                tenant_id: TENANT_ID,
                activity_id: SEDE.porto,
                activity_name: "Porto e2e",
                reservation_date: "2026-08-02",
                reservation_time: "13:00:00",
                party_size: 2,
                status: "no_show",
                guest_notes: null
            }
        ],
        activities: sedi.activities
    };
}

/** L'`or` di `listReservationGuests`: `display_name.ilike.%x%,email.ilike.%x%[,phone_e164.ilike.%123%]`. */
function applySearch(rows: Row[], params: URLSearchParams): Row[] {
    const or = params.get("or");
    if (!or) return rows;
    const clauses = or
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map(c => /^(\w+)\.ilike\.(.*)$/.exec(c))
        .filter((m): m is RegExpExecArray => m !== null)
        .map(m => ({ field: m[1], needle: m[2].replace(/[%*]/g, "").toLowerCase() }));
    return rows.filter(row => clauses.some(c => String(row[c.field] ?? "").toLowerCase().includes(c.needle)));
}

export type { WriteCall, WriteHandler } from "./restStub";
export type ClientiStub = RestStub & { tables: Tables };

export async function stubClienti(page: Page, options: { empty?: boolean; count?: number } = {}): Promise<ClientiStub> {
    const tables = makeTables(options.count);
    if (options.empty) tables.v_reservation_guests_directory = [];
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            if (table === "v_reservation_guests_directory") {
                const found = applySearch(rows, params);
                return [...found].sort((a, b) => String(b.last_visit_date).localeCompare(String(a.last_visit_date)));
            }
            return rows;
        }
    });
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
