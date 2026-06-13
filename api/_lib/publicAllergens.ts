/**
 * Fetch server-side della tabella `allergens` per il renderer SSR (stage 4b).
 *
 * PostgREST diretto via fetch (stesso pattern no-SDK di supabaseEdge.ts):
 * evita di trascinare @supabase/supabase-js (e il client singleton frontend
 * con le sue dipendenze) nel bundle della function. La tabella è l'unica
 * cross-tenant senza scoping utente (eccezione documentata in CLAUDE.md):
 * anon key sufficiente.
 *
 * Memo a livello modulo (lambda warm): la lista cambia praticamente mai,
 * TTL difensivo 5 minuti.
 */

export type PublicAllergen = {
    id: number;
    code: string;
    label_it: string;
    label_en: string;
    sort_order: number;
};

const MEMO_TTL_MS = 5 * 60 * 1000;

let memo: { data: PublicAllergen[]; fetchedAt: number } | null = null;

function readSupabaseEnv(): { url: string; key: string } | null {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/+$/, ""), key };
}

/**
 * Lista allergeni ordinata per sort_order. Ritorna `null` su qualsiasi
 * errore (env mancante, rete, non-200): il chiamante renderizza con
 * allergens=null, stesso degrade della SPA quando listAllAllergens fallisce.
 */
export async function fetchPublicAllergens(): Promise<PublicAllergen[] | null> {
    if (memo && Date.now() - memo.fetchedAt < MEMO_TTL_MS) {
        return memo.data;
    }

    const env = readSupabaseEnv();
    if (!env) return null;

    try {
        const response = await fetch(
            `${env.url}/rest/v1/allergens?select=*&order=sort_order.asc`,
            {
                headers: {
                    apikey: env.key,
                    Authorization: `Bearer ${env.key}`
                }
            }
        );
        if (!response.ok) return null;
        const data = (await response.json()) as PublicAllergen[];
        if (!Array.isArray(data)) return null;
        memo = { data, fetchedAt: Date.now() };
        return data;
    } catch {
        return null;
    }
}
