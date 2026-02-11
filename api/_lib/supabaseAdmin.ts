import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        const missing: string[] = [];
        if (!url) missing.push("SUPABASE_URL");
        if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

        const envLabel = process.env.VERCEL_ENV ?? "unknown";
        throw new Error(`Supabase env vars mancanti: ${missing.join(", ")} (env: ${envLabel}).`);
    }

    cachedClient = createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    return cachedClient;
}
