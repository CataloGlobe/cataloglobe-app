import { supabase } from "@/services/supabase/client";
import type { ActivitySlugAlias } from "@/types/activity";

/**
 * Recupera tutti gli alias di una sede (per UI lista alias).
 * Ordinati per created_at DESC (più recenti prima).
 */
export async function getActivitySlugAliases(
    activityId: string,
    _tenantId: string
): Promise<ActivitySlugAlias[]> {
    const { data, error } = await supabase
        .from("activity_slug_aliases")
        .select("id, activity_id, slug, created_at")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/**
 * Salva un alias per il vecchio slug dopo un cambio slug.
 * Ignora silenziosamente i conflitti UNIQUE (23505) — possono
 * verificarsi se l'alias era già stato registrato in precedenza.
 * Propaga tutti gli altri errori.
 */
export async function createActivitySlugAlias(
    activityId: string,
    _tenantId: string,
    oldSlug: string
): Promise<void> {
    const { error } = await supabase
        .from("activity_slug_aliases")
        .insert({ activity_id: activityId, slug: oldSlug });

    if (!error) return;

    // Duplicato: ignora silenziosamente
    if (error.code === "23505") return;

    throw error;
}

/**
 * Elimina un alias (azione volontaria dell'operatore).
 * La RLS garantisce che l'utente possa eliminare solo alias
 * di sedi del proprio tenant.
 */
export async function deleteActivitySlugAlias(
    aliasId: string,
    _tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("activity_slug_aliases")
        .delete()
        .eq("id", aliasId);

    if (error) throw error;
}
