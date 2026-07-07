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
