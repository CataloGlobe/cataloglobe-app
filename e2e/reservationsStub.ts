import type { Page, Route } from "@playwright/test";

/**
 * Dati finti per l'e2e di Prenotazioni (lotto `ds-5-prenotazioni`, passo 2 P0).
 *
 * La sede di test (Garbagnate) non ha prenotazioni su staging, e una fixture
 * vera che qualcuno sposta a mano rompe la suite (§47.2, apertura 1). Qui le
 * letture di `reservations`, `reservation_tables` e `v_seatings_with_state`
 * rispondono da questa lista, filtrata come farebbe PostgREST sui parametri
 * che la pagina usa; tutto il resto (sedi, tavoli, permessi) resta vero.
 *
 * Le scritture non partono mai: ogni edge function è intercettata. Chi vuole
 * provare un gesto registra un gestore con `onWrite` e controlla il corpo
 * (test di cablaggio); un gesto senza gestore risponde 500.
 */

export const TENANT_ID = "5b37c952-1add-4196-aab3-9775d98a9c32";
export const GARBAGNATE_ID = "1f62cac4-2ba9-436b-b075-057203658422";
/** Un'altra sede della stessa azienda: le sue righe non devono comparire nella rotta di Garbagnate. */
export const VAREDO_ID = "ea2ddd25-c88d-4d50-a68d-f423b430486d";

export type StubReservation = {
    id: string;
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    customer_name: string;
    party_size: number;
    status: "pending" | "confirmed" | "declined" | "cancelled" | "seated" | "no_show" | "completed";
    source: "online" | "manual";
    notes: string | null;
    guest_confirmed_at: string | null;
};

function isoDay(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

let counter = 0;
function id(): string {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

/** Otto righe a Garbagnate (3 da gestire, di cui una scaduta; 5 di oggi o dopo) e una a Varedo. */
export function makeReservations(): StubReservation[] {
    const r = (o: Partial<StubReservation> & Pick<StubReservation, "reservation_date" | "reservation_time" | "customer_name" | "status">): StubReservation => ({
        id: id(),
        activity_id: GARBAGNATE_ID,
        party_size: 2,
        source: "online",
        notes: null,
        guest_confirmed_at: null,
        ...o
    });
    return [
        r({ reservation_date: isoDay(0), reservation_time: "19:30:00", customer_name: "Giulia Bianchi", party_size: 4, status: "pending", notes: "Compleanno, se possibile tavolo tranquillo" }),
        r({ reservation_date: isoDay(1), reservation_time: "20:00:00", customer_name: "Marco Rossi", status: "pending" }),
        r({ reservation_date: isoDay(-2), reservation_time: "21:00:00", customer_name: "Luca Verdi", party_size: 3, status: "pending" }),
        r({ reservation_date: isoDay(0), reservation_time: "12:30:00", customer_name: "Anna Neri", status: "completed", source: "manual" }),
        r({ reservation_date: isoDay(0), reservation_time: "13:00:00", customer_name: "Paolo Gallo", party_size: 6, status: "seated" }),
        r({ reservation_date: isoDay(0), reservation_time: "20:30:00", customer_name: "Sara Conti", status: "confirmed" }),
        r({ reservation_date: isoDay(0), reservation_time: "21:15:00", customer_name: "Elena Riva", party_size: 5, status: "confirmed", source: "manual" }),
        r({ reservation_date: isoDay(0), reservation_time: "20:45:00", customer_name: "Ospite di Varedo", status: "pending", activity_id: VAREDO_ID })
    ];
}

function toRow(r: StubReservation) {
    const now = new Date().toISOString();
    return {
        ...r,
        tenant_id: TENANT_ID,
        customer_email: null,
        customer_phone: "+39 333 1234567",
        customer_phone_e164: "+393331234567",
        customer_phone_digits: "393331234567",
        created_at: now,
        updated_at: now,
        created_by_user_id: null,
        seated_at: r.status === "seated" ? now : null,
        completed_at: r.status === "completed" ? now : null,
        reminder_sent_at: null,
        customer_language: "it",
        guest_id: null,
        reminder_attempts: 0,
        reminder_failed_at: null,
        reminder_last_error: null,
        ics_sequence: 0
    };
}

/** Il sottoinsieme dei filtri PostgREST che la pagina usa su `reservations`. */
function matches(r: StubReservation, params: URLSearchParams): boolean {
    for (const [key, raw] of params) {
        if (["select", "order", "limit", "offset"].includes(key)) continue;
        if (key === "or") {
            const name = /customer_name\.ilike\.[%*]([^%*]*)[%*]/.exec(raw)?.[1];
            if (name !== undefined && !r.customer_name.toLowerCase().includes(name.toLowerCase())) return false;
            continue;
        }
        const [op, ...rest] = raw.split(".");
        const value = rest.join(".");
        const field = String((r as Record<string, unknown>)[key] ?? (key === "tenant_id" ? TENANT_ID : ""));
        if (op === "eq" && field !== value) return false;
        if (op === "gte" && !(field >= value)) return false;
        if (op === "lte" && !(field <= value)) return false;
        if (op === "lt" && !(field < value)) return false;
        if (op === "in" && !value.replace(/[()]/g, "").split(",").includes(field)) return false;
    }
    return true;
}

export type WriteHandler = (body: unknown) => unknown;

export type ReservationsStub = {
    rows: StubReservation[];
    /** L'id della tavolata aperta (quella della prenotazione «Al tavolo»). */
    seatingId: string;
    /** Ogni chiamata a un'edge function intercettata, in ordine. */
    writes: { fn: string; body: unknown }[];
    /** Registra la risposta finta di un'edge function (test di cablaggio). */
    onWrite: (fn: string, handler: WriteHandler) => void;
};

export async function stubReservations(page: Page): Promise<ReservationsStub> {
    const rows = makeReservations();
    const handlers = new Map<string, WriteHandler>();
    const seatingId = "00000000-0000-4000-9000-000000000001";
    const stub: ReservationsStub = { rows, seatingId, writes: [], onWrite: (fn, h) => handlers.set(fn, h) };

    await page.route("**/rest/v1/reservations?**", async (route: Route) => {
        if (route.request().method() !== "GET") return route.fulfill({ status: 500, json: { message: "scrittura non prevista dall'e2e" } });
        const params = new URL(route.request().url()).searchParams;
        await route.fulfill({ json: rows.filter(r => matches(r, params)).map(toRow) });
    });
    await page.route("**/rest/v1/reservation_tables?**", route => route.fulfill({ json: [] }));

    const seated = rows.find(r => r.status === "seated");
    await page.route("**/rest/v1/v_seatings_with_state?**", route =>
        route.fulfill({
            json: seated
                ? [
                      {
                          id: seatingId,
                          tenant_id: TENANT_ID,
                          activity_id: GARBAGNATE_ID,
                          status: "open",
                          party_size: seated.party_size,
                          opened_at: new Date(Date.now() - 45 * 60_000).toISOString(),
                          closed_at: null,
                          closed_reason: null,
                          opened_by_user_id: null,
                          tables: [],
                          reservations: [
                              {
                                  reservation_id: seated.id,
                                  customer_name: seated.customer_name,
                                  reservation_time: seated.reservation_time,
                                  party_size: seated.party_size,
                                  status: "seated"
                              }
                          ],
                          pending_orders_count: 0,
                          pending_orders_deliverable: false
                      }
                  ]
                : []
        })
    );
    await page.route("**/rest/v1/seating_tables?**", route => route.fulfill({ json: [] }));
    // La tavolata di una prenotazione (`getSeatingForReservation`, `maybeSingle`):
    // quella aperta per la prenotazione «Al tavolo», nessuna per le altre.
    await page.route("**/rest/v1/seatings?**", route => {
        const reservationId = new URL(route.request().url()).searchParams
            .get("seating_reservations.reservation_id")
            ?.replace(/^eq\./, "");
        const open = seated && reservationId === seated.id;
        return route.fulfill({
            json: open
                ? {
                      id: seatingId,
                      tenant_id: TENANT_ID,
                      activity_id: GARBAGNATE_ID,
                      status: "open",
                      party_size: seated.party_size,
                      opened_at: new Date(Date.now() - 45 * 60_000).toISOString(),
                      closed_at: null,
                      closed_reason: null,
                      opened_by_user_id: null
                  }
                : null
        });
    });

    const intercept = async (route: Route) => {
        const fn = new URL(route.request().url()).pathname.split("/").pop() ?? "";
        const body = route.request().postDataJSON() as unknown;
        stub.writes.push({ fn, body });
        const handler = handlers.get(fn);
        if (!handler) return route.fulfill({ status: 500, json: { error_code: "SERVER_ERROR", message: `${fn} non prevista dall'e2e` } });
        await route.fulfill({ json: handler(body) });
    };
    // Le edge che scrivono prenotazioni.
    await page.route(/\/functions\/v1\/(respond-reservation|update-reservation)$/, intercept);
    // Le RPC: quelle di lettura (get_/is_/has_) passano, le altre sono gesti.
    await page.route("**/rest/v1/rpc/**", route => {
        const fn = new URL(route.request().url()).pathname.split("/").pop() ?? "";
        return /^(get|is|has)_/.test(fn) ? route.continue() : intercept(route);
    });

    return stub;
}
