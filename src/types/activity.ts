export interface V2Activity {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    activity_type: string | null;
    address: string | null;
    street_number: string | null;
    postal_code: string | null;
    province: string | null;
    city: string | null;
    cover_image: string | null;
    description: string | null;
    status: "active" | "inactive";
    inactive_reason: "maintenance" | "closed" | "unavailable" | null;
    phone: string | null;
    email_public: string | null;
    website: string | null;
    instagram: string | null;
    facebook: string | null;
    whatsapp: string | null;
    phone_public: boolean;
    email_public_visible: boolean;
    website_public: boolean;
    instagram_public: boolean;
    facebook_public: boolean;
    whatsapp_public: boolean;
    payment_methods: string[];
    payment_methods_public: boolean;
    services: string[];
    services_public: boolean;
    fees: ActivityFee[] | null;
    fees_public: boolean;
    hours_public: boolean;
    ordering_enabled: boolean;
    ordering_verification_mode: "none" | "first_order";
    enable_reservations: boolean;
    /**
     * Lista di email destinatarie degli avvisi nuova prenotazione per la sede.
     * Quando vuota, l'Edge Function `submit-reservation` ricade sull'email
     * dell'owner del tenant. Sostituisce `email_public` come sorgente.
     */
    reservation_notification_emails: string[];
    /**
     * Capacità coperti per la finestra di prenotazione. NULL = nessun limite
     * (comportamento V0). Usato da `submit-reservation` per il gate
     * pubblico e dall'UI admin per il callout "picco previsto / capienza".
     */
    reservation_capacity: number | null;
    /** Durata standard del tavolo in minuti (default 120, range 15-600). */
    reservation_duration_minutes: number;
    /** Step 1: solo `continua` cablata. `turni` riservata a Step 2. */
    reservation_availability_mode: "continua" | "turni";
    /** Step 1: solo `manuale` cablata. `auto` riservata a Step 3. */
    reservation_confirmation_mode: "manuale" | "auto";
    /**
     * Cosa fa l'Edge `submit-reservation` quando si supera la capienza:
     *   - `hard` → rifiuta con 409 `CAPACITY_FULL` (default).
     *   - `soft` → insert `pending`, capienza solo informativa.
     */
    reservation_overbooking_form: "hard" | "soft";
    /**
     * Pacing per fascia oraria — tetto sugli ARRIVI, non sulle presenze.
     * Si affianca alla capienza senza sostituirla: la capienza dice quante
     * persone stanno nel locale, il pacing quante ne possono arrivare insieme.
     *
     * Ampiezza della fascia in minuti (15 | 30 | 60, default 15). NON è il
     * passo della griglia di orari offerti dal form pubblico (`reservationSlots.ts`):
     * sono due cose distinte per scelta, così cambiare l'uno non sposta l'altro.
     */
    reservation_pacing_slot_minutes: number;
    /**
     * Tetto di COPERTI in arrivo nella fascia. NULL = nessun limite.
     * Mai 0: il CHECK a schema lo vieta, così un `if (limite)` distratto non
     * può trasformare "nessun limite" in "tutto bloccato".
     */
    reservation_pacing_max_covers: number | null;
    /**
     * Tetto di PRENOTAZIONI in arrivo nella fascia. NULL = nessun limite.
     * Leva indipendente dalla precedente: quattro tavoli da 2 e un tavolo da 8
     * fanno gli stessi coperti ma un carico di sala molto diverso. Con entrambi
     * valorizzati vince il più restrittivo.
     */
    reservation_pacing_max_bookings: number | null;
    /**
     * Se true, le prenotazioni confermate di questa sede ricevono il
     * promemoria alle 18:00 del giorno prima (job `send-reservation-reminders`,
     * migration 20260829120001). Default true.
     */
    reservation_reminder_enabled: boolean;
    /**
     * Email pubblicata nell'informativa privacy prenotazioni della sede come
     * canale a cui il cliente si rivolge per accesso / rettifica / cancellazione
     * dei propri dati.
     *
     * NULL = fallback all'email dell'owner del tenant, risolto a runtime lato
     * edge (`tenants.owner_user_id` → `auth.users`, service_role). Il fallback
     * NON viene materializzato qui: un valore copiato si sgancerebbe in silenzio
     * il giorno che l'owner cambia email.
     *
     * Distinta da `email_public` (contatto commerciale in vetrina) e da
     * `reservation_notification_emails` (destinatari degli avvisi operativi, che
     * possono essere indirizzi personali del team e non vanno pubblicati).
     */
    reservation_privacy_contact_email: string | null;
    qr_fg_color: string | null;
    qr_bg_color: string | null;
    google_review_url: string | null;
    created_at: string;
    updated_at: string;
}

export type ActivityFeeKey =
    | "coperto"
    | "servizio"
    | "prenotazione_minima"
    | "spesa_minima"
    | "eta_minima";

export interface ActivityFee {
    key: ActivityFeeKey;
    value: string;
}

export type V2ActivityType = string; // can be refined later if there are fixed types

export interface ActivitySlugAlias {
    id: string;
    activity_id: string;
    slug: string;
    created_at: string;
}
