import type { ActivityFee } from "@/types/activity";
import type { ResolvedCollections } from "@/types/resolvedCollections";
import type { VerticalType } from "@/constants/verticalTypes";
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import type { AvailableLanguage } from "@/context/Language/LanguageContext";

/**
 * Tipi del payload `resolve-public-catalog` consumato dalla pagina pubblica.
 *
 * Promossi da PublicCollectionPage (SSR stage 3, step 1) così che la
 * derivazione dello stato pagina (derivePageState) e — in futuro — l'entry
 * SSR condividano la stessa shape. `fetchPublicCatalog` continua a emettere
 * un payload opaco (`Record<string, unknown>`): il cast a questa shape vive
 * in un solo punto, al confine di consumo nella pagina.
 */

export type PublicBusiness = {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    cover_image: string | null;
    status: "active" | "inactive";
    inactive_reason: "maintenance" | "closed" | "unavailable" | null;
    /**
     * Maintenance mode ordinazioni QR per-sede. Fonte di verita server-side
     * via `resolve-public-catalog`. Quando `false`, frontend mostra UI
     * read-only senza FAB/+/buttons. Backward compat: payload Redis snapshot
     * pre-Fix 1 puo non avere il campo — consumer usa fallback `?? true`.
     */
    ordering_enabled: boolean;
    /**
     * Reservation form opt-in per-sede. Quando `true`, la route `/:slug/prenota`
     * renderizza il form; quando `false`, mostra lo stato "reservations-disabled".
     * Backward compat: payload stale (Redis/localStorage) pre-deploy non ha il
     * campo → fallback `?? false` lato consumer (sede deve esplicitamente abilitarle).
     */
    enable_reservations: boolean;
    address: string | null;
    street_number: string | null;
    postal_code: string | null;
    city: string | null;
    province: string | null;
    instagram: string | null;
    instagram_public: boolean;
    facebook: string | null;
    facebook_public: boolean;
    whatsapp: string | null;
    whatsapp_public: boolean;
    website: string | null;
    website_public: boolean;
    phone: string | null;
    phone_public: boolean;
    email_public: string | null;
    email_public_visible: boolean;
    google_review_url: string | null;
    /**
     * Toggle del proprietario per esporre gli orari di apertura nel footer
     * della pagina menu. Quando `false`, il blocco PublicOpeningHours non
     * viene renderizzato anche se `opening_hours` arriva nel payload (la
     * resolve-public-catalog espone gli orari anche con `enable_reservations`
     * attivo per consentire la validazione del form prenotazione, ma il menu
     * deve continuare a rispettare la scelta di nascondere).
     */
    hours_public: boolean;
    payment_methods: string[];
    services: string[];
    fees: ActivityFee[];
};

export type ResolvedPayloadShape = {
    business: PublicBusiness;
    tenantLogoUrl: string | null;
    resolved: ResolvedCollections;
    subscription_inactive?: boolean;
    canonical_slug?: string | null;
    base_language_code?: string | null;
    effective_language?: string | null;
    available_languages?: AvailableLanguage[];
    lang_unsupported?: boolean;
    opening_hours?: OpeningHoursEntry[];
    upcoming_closures?: UpcomingClosure[];
    vertical_type?: VerticalType | null;
    has_story?: boolean;
};
