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

const REMEMBER_KEY = "authRememberMe";
const isBrowserRuntime =
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.sessionStorage !== "undefined";

function getRememberPreference(): boolean {
    if (!isBrowserRuntime) return true;

    // default: true (SaaS standard)
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (raw === null) return true;
    return raw === "true";
}

function getAuthStorage(): Storage | undefined {
    if (!isBrowserRuntime) return undefined;

    // ✅ True -> localStorage (persistente)
    // ✅ False -> sessionStorage (dura finché il browser è aperto; refresh OK)
    return getRememberPreference() ? window.localStorage : window.sessionStorage;
}

function createSupabaseClient(): SupabaseClient {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    }

    const storage = getAuthStorage();

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
 * Salva la preferenza e ricrea il client con lo storage corretto.
 * Va chiamato PRIMA del login.
 */
export function setRememberMe(remember: boolean) {
    if (!isBrowserRuntime) return;
    localStorage.setItem(REMEMBER_KEY, String(remember));
}

/**
 * Utile in casi particolari (es. dopo logout forzato / reset).
 */
export function rebuildSupabaseClient() {
    return supabase;
}
