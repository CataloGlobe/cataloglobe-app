import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getEnvValue(key: string): string | undefined {
    const importMetaEnv =
        typeof import.meta !== "undefined"
            ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
            : undefined;
    if (importMetaEnv?.[key]) return importMetaEnv[key];

    const processEnv =
        (
            globalThis as typeof globalThis & {
                process?: { env?: Record<string, string | undefined> };
            }
        ).process?.env ?? {};

    return processEnv[key];
}

const SUPABASE_URL = getEnvValue("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnvValue("VITE_SUPABASE_ANON_KEY");

const isBrowserRuntime =
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.sessionStorage !== "undefined";

/**
 * «Ricordami» è stato tolto (deciso da Lorenzo il 2026-10-09): la sessione sta
 * sempre in localStorage. Chi aveva la casella spenta ha la sessione in
 * sessionStorage: la si sposta una volta, così non deve rifare l'accesso.
 */
function migrateLegacySessionStorage() {
    const legacyKey = "authRememberMe";
    if (localStorage.getItem(legacyKey) === null) return;
    try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
            const value = sessionStorage.getItem(key);
            if (value !== null && localStorage.getItem(key) === null) {
                localStorage.setItem(key, value);
            }
            sessionStorage.removeItem(key);
        }
    } finally {
        localStorage.removeItem(legacyKey);
    }
}

function createSupabaseClient(): SupabaseClient {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    }

    if (isBrowserRuntime) migrateLegacySessionStorage();
    const storage = isBrowserRuntime ? window.localStorage : undefined;

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: isBrowserRuntime, // in Node non usiamo storage persistente
            autoRefreshToken: isBrowserRuntime,
            detectSessionInUrl: isBrowserRuntime,
            storage
        }
    });

    if (isBrowserRuntime) {
        client.auth.onAuthStateChange(event => {
            if (event === "PASSWORD_RECOVERY") {
                if (window.location.pathname === "/reset-password") {
                    sessionStorage.setItem("passwordRecoveryFlow", "true");
                }
            }
        });

        if (getEnvValue("DEV") === "true") {
            client.auth.onAuthStateChange((event, session) => {
                console.log("[supabase] auth changed:", event, session?.user?.id);
            });
        }
    }

    if (!isBrowserRuntime && getEnvValue("DEBUG_SUPABASE_AUTH") === "true") {
        client.auth.onAuthStateChange((event, session) => {
            console.log("[supabase][node] auth changed:", event, session?.user?.id);
        });
    }

    return client;
}

export const supabase = createSupabaseClient();

/**
 * Utile in casi particolari (es. dopo logout forzato / reset).
 */
export function rebuildSupabaseClient() {
    return supabase;
}
