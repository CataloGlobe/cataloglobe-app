import { supabase } from "@/services/supabase/client";
import { generateSlug, generateRandomSuffix } from "./slugify";

/**
 * Cerca uno slug univoco GLOBALMENTE (non scoped a tenant).
 * Usata sia per la creazione di una nuova sede, sia per l'edit
 * (in quel caso passare excludeActivityId per escludere la sede corrente).
 *
 * @param rawName         - Il nome/slug di partenza (verrà normalizzato)
 * @param excludeActivityId - ID della sede da escludere dal controllo (modalità edit)
 * @returns Lo slug disponibile (uguale al base se libero, altrimenti con suffisso)
 */
export async function ensureUniqueBusinessSlug(
    rawName: string,
    excludeActivityId?: string
): Promise<string> {
    const base = generateSlug(rawName || "");

    // fallback minimale se il nome è vuoto o slug è vuoto
    const baseSlug = base || "business";

    // 1) recupera tutti gli slug che iniziano con baseSlug, globalmente
    let query = supabase
        .from("activities")
        .select("slug")
        .ilike("slug", `${baseSlug}%`);

    if (excludeActivityId) {
        query = query.neq("id", excludeActivityId);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Errore fetch slug:", error);
        // In caso di errore, usiamo comunque baseSlug (meglio che bloccare tutto)
        return baseSlug;
    }

    const existingSlugs = (data ?? []).map(row => row.slug as string);

    // 2) se il base non esiste, usiamo lui
    if (!existingSlugs.includes(baseSlug)) {
        return baseSlug;
    }

    // 3) altrimenti generiamo un suffisso random finché non troviamo uno slug libero
    for (let i = 0; i < 10; i++) {
        const candidate = `${baseSlug}-${generateRandomSuffix(4)}`;
        if (!existingSlugs.includes(candidate)) {
            return candidate;
        }
    }

    // 4) fallback estremo: aggiungiamo timestamp
    return `${baseSlug}-${Date.now()}`;
}
