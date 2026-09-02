// Rubrica clienti — profilo ospite costruito dalle prenotazioni.
//
// Il profilo appartiene all'AZIENDA (tenant), non alla sede: le sedi di un
// tenant sono la stessa impresa e lo stesso titolare dei dati. Lo storico dice
// poi in quale sede è avvenuta ogni visita.
//
// ⚠️ I CONTEGGI DIPENDONO DA CHI GUARDA. Le view sono `security_invoker`,
// quindi le visite sono filtrate riga per riga dalla RLS di `reservations`:
// un manager assegnato a una sola sede vede solo le visite di quella sede,
// e i suoi `visible_*` sono più bassi di quelli dell'owner sullo stesso
// profilo. Il prefisso `visible` è nel nome delle colonne apposta: nessuna UI
// deve stampare questi numeri come "totale del cliente" senza dire rispetto a
// cosa (vedi `guestVisibilityCopy.ts`).
//
// Ambito strettamente operativo: riconoscere chi arriva, sapere se ha
// allergie, sapere se non si è presentato. Non è marketing — nessun invio,
// nessuna esportazione, nessuna azione di gruppo.

/** Riga di `public.reservation_guests` (profilo, senza aggregati). */
export interface V2ReservationGuest {
    id: string;
    tenant_id: string;
    /** Chiave di identità: telefono in forma canonica E.164. */
    phone_e164: string;
    /** Ultimo nome visto in prenotazione. Scritto dal trigger, non a mano. */
    display_name: string;
    email: string | null;
    /**
     * Note scritte DAL LOCALE ("preferisce il tavolo in fondo").
     * Da non confondere con `V2Reservation.notes`, scritte DAL CLIENTE
     * ("allergico alle spezie"): autori diversi, non vanno mescolate.
     */
    venue_notes: string | null;
    /** Marcature libere del locale: abituale, VIP, allergie… */
    tags: string[];
    created_at: string;
    updated_at: string;
}

/** Riga di `public.v_reservation_guests_directory` (profilo + aggregati). */
export interface ReservationGuestSummary extends V2ReservationGuest {
    /** Visite visibili A CHI LEGGE. Mai presentare come totale assoluto. */
    visible_visits: number;
    visible_no_shows: number;
    /** "YYYY-MM-DD" o null se nessuna visita visibile. */
    first_visit_date: string | null;
    last_visit_date: string | null;
    /** Numero di sedi visibili in cui il cliente è passato. */
    visible_activities: number;
}

/** Riga di `public.v_reservation_guest_visits` (una visita). */
export interface ReservationGuestVisit {
    reservation_id: string;
    guest_id: string;
    tenant_id: string;
    activity_id: string;
    /** Può essere null: la view usa LEFT JOIN su `activities`, così una visita
     *  non sparisce se manca il permesso di lettura sulla sede. */
    activity_name: string | null;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    status: string;
    /** Note del CLIENTE su quella prenotazione. */
    guest_notes: string | null;
    source: string;
    created_at: string;
}

/** Campi editabili a mano sul profilo. Tutto il resto lo scrive il trigger. */
export interface ReservationGuestNotesInput {
    venue_notes: string | null;
    tags: string[];
}
