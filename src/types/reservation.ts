// V2Reservation — riga di public.reservations. Una prenotazione tavolo
// associata a una sede (activity_id), inserita dal flusso customer-facing
// e gestita dall'admin via transizioni di status (pending → confirmed |
// declined | cancelled).
//
// `reservation_date` e' DATE Postgres serializzato come stringa "YYYY-MM-DD".
// `reservation_time` e' TIME senza timezone, serializzato come "HH:MM:SS"
// (wall-clock locale della sede; nessuna aritmetica timezone DB-side).
export type ReservationStatus = "pending" | "confirmed" | "declined" | "cancelled";

// "online" = submitted via the public form (submit-reservation edge function);
// "manual" = inserted by an admin via the dashboard (createReservation).
export type ReservationSource = "online" | "manual";

export interface V2Reservation {
    id: string;
    tenant_id: string;
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes: string | null;
    status: ReservationStatus;
    source: ReservationSource;
    // Stamped by DB DEFAULT auth.uid() on INSERT (migration
    // 20260609100000). Resolves to the operator's user id for `source =
    // "manual"` inserts and to NULL for online inserts (RPC runs as
    // service_role). Read-only from the frontend perspective.
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string;
}
