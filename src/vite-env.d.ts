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
    // aggiungi qui eventuali altre variabili
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
