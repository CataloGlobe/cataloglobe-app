/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_PUBLIC_CATALOG_API_BASE?: string;
    // Flag Supabase image transformations (render/image) per la cover pubblica.
    // "true" → rewrite render/image + srcset responsive; assente/altro → OFF
    // (URL object/public diretto). Default OFF: l'endpoint render/image dà 403
    // sui piani Supabase senza transformations. Prefisso VITE_ → esposto al
    // bundle client; stessa var letta lato SSR via process.env.
    readonly VITE_IMAGE_TRANSFORM?: string;
    // Allergie nel modulo pubblico di prenotazione: "true" → campo e consenso
    // visibili; assente/altro → OFF. Gemello edge: RESERVATION_ALLERGIES_ENABLED.
    readonly VITE_RESERVATION_ALLERGIES?: string;
    // Redesign della pagina pubblica: "true" → componenti di
    // PublicCollectionView/redesign/; assente/altro → pagina di oggi. Solo staging.
    readonly VITE_PUBLIC_REDESIGN?: string;
    readonly VITE_OFFICINA_CALENDARIO?: string;
    // aggiungi qui eventuali altre variabili
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
