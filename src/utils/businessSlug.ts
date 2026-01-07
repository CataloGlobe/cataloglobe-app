import { supabase } from "@/services/supabase/client";
import { generateSlug, generateRandomSuffix } from "./slugify";

export async function ensureUniqueBusinessSlug(rawName: string): Promise<string> {
    const base = generateSlug(rawName || "");

    // fallback minimale se il nome è vuoto o slug è vuoto
    const baseSlug = base || "business";

    // 1) recuperiamo tutti gli slug che iniziano con baseSlug
    const { data, error } = await supabase
        .from("businesses")
        .select("slug")
        .ilike("slug", `${baseSlug}%`);

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
    // (probabilità di collisione praticamente nulla già al primo tentativo)
    for (let i = 0; i < 10; i++) {
        const candidate = `${baseSlug}-${generateRandomSuffix(4)}`;
        if (!existingSlugs.includes(candidate)) {
            return candidate;
        }
    }

    // 4) fallback estremo: aggiungiamo timestamp
    return `${baseSlug}-${Date.now()}`;
}
