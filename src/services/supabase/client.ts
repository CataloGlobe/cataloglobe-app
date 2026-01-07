import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

// 🔥 Aggiungi questo blocco per sincronizzare sempre la sessione
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth changed:", event, session);
});
