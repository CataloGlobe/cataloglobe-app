import { supabase } from "@/services/supabase/client";

/**
 * Autorizzazione admin di piattaforma (i fondatori), non tenant-scoped.
 *
 * Wrappa la RPC `is_platform_admin()` (SECURITY DEFINER, STABLE), che
 * risponde `true` solo se `auth.uid()` ha una riga in `public.platform_admins`.
 *
 * Nessun caching / memoizzazione: la correttezza del gate vale piu' di un
 * round-trip risparmiato.
 *
 * Fail-closed QUI e non nel chiamante: il contratto della funzione e'
 * "boolean, mai throw". Cosi' nessun call site puo' dimenticare un try/catch
 * e lasciar passare un utente per via di un errore di rete, di un 42501 o di
 * una risposta ambigua. Qualsiasi esito diverso da `true` esplicito = non admin.
 */
export async function isPlatformAdmin(): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error) {
        console.error("[platformAdmin] is_platform_admin fallita:", error);
        return false;
    }
    return data === true;
}
