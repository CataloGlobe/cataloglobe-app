import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!;

const REMEMBER_KEY = "authRememberMe";

function getRememberPreference(): boolean {
    // default: true (SaaS standard)
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (raw === null) return true;
    return raw === "true";
}

function getAuthStorage(): Storage {
    // ✅ True -> localStorage (persistente)
    // ✅ False -> sessionStorage (dura finché il browser è aperto; refresh OK)
    return getRememberPreference() ? window.localStorage : window.sessionStorage;
}

function createSupabaseClient(): SupabaseClient {
    const storage = getAuthStorage();

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true, // IMPORTANT: deve restare true (se no refresh slogg)
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage
        }
    });

    client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            sessionStorage.setItem("passwordRecoveryFlow", "true");
        }

        // ✅ Se arriva una nuova sessione, assicurati che otpValidated sia coerente con l'utente
        if (event === "SIGNED_IN" && session?.user?.id) {
            const currentUserId = session.user.id;
            const otpValidatedUserId = localStorage.getItem("otpValidatedUserId");

            // Se il flag OTP era di un altro utente, lo resettiamo
            if (otpValidatedUserId && otpValidatedUserId !== currentUserId) {
                localStorage.removeItem("otpValidatedUserId");
            }
        }

        // ✅ Pulizia su logout
        if (event === "SIGNED_OUT") {
            localStorage.removeItem("otpValidatedUserId");
        }
    });

    if (import.meta.env.DEV) {
        client.auth.onAuthStateChange((event, session) => {
            console.log("[supabase] auth changed:", event, session?.user?.id);
        });
    }

    return client;
}

// ⚠️ export let: così possiamo “rimpiazzare” il client e gli import vedono il nuovo valore
export let supabase = createSupabaseClient();

/**
 * Salva la preferenza e ricrea il client con lo storage corretto.
 * Va chiamato PRIMA del login.
 */
export function setRememberMe(remember: boolean) {
    localStorage.setItem(REMEMBER_KEY, String(remember));
    supabase = createSupabaseClient();
}

/**
 * Utile in casi particolari (es. dopo logout forzato / reset).
 */
export function rebuildSupabaseClient() {
    supabase = createSupabaseClient();
    return supabase;
}
