/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    // aggiungi qui eventuali altre variabili
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
