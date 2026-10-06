/**
 * Libreria delle obiezioni (migration 20261006100000): obiezioni sentite per
 * locale e risposte che funzionano per categoria. Tabelle di piattaforma.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmObjection, CrmObjectionAnswer, CrmObjectionCategory } from "@/types/crm";

const SELECT = "id, venue_id, category, note, source, created_by, created_at";

/** Le obiezioni da `sinceIso` in poi (riepilogo). */
export async function listCrmObjectionsSince(sinceIso: string): Promise<CrmObjection[]> {
    const { data, error } = await supabase
        .from("crm_objections")
        .select(SELECT)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmObjection[];
}

/** Le obiezioni di un locale, la più recente in cima (scheda). */
export async function listCrmVenueObjections(venueId: string): Promise<CrmObjection[]> {
    const { data, error } = await supabase
        .from("crm_objections")
        .select(SELECT)
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmObjection[];
}

export async function addCrmObjection(input: {
    venueId: string;
    category: CrmObjectionCategory;
    note: string | null;
    source: "perso" | "scheda";
}): Promise<void> {
    const note = input.note?.trim() ?? "";
    const { error } = await supabase.from("crm_objections").insert({
        venue_id: input.venueId,
        category: input.category,
        note: note === "" ? null : note.slice(0, 500),
        source: input.source
    });
    if (error) throw error;
}

export async function deleteCrmObjection(id: string): Promise<void> {
    const { error } = await supabase.from("crm_objections").delete().eq("id", id);
    if (error) throw error;
}

export async function listCrmObjectionAnswers(): Promise<CrmObjectionAnswer[]> {
    const { data, error } = await supabase
        .from("crm_objection_answers")
        .select("category, answer, updated_by, updated_at");
    if (error) throw error;
    return (data ?? []) as CrmObjectionAnswer[];
}

/**
 * Salva le risposte cambiate: testo vuoto = risposta tolta. Una scrittura
 * per categoria, tutte insieme.
 */
export async function saveCrmObjectionAnswers(
    changes: { category: CrmObjectionCategory; answer: string }[],
    userId: string
): Promise<void> {
    const now = new Date().toISOString();
    const upserts = changes
        .filter(c => c.answer.trim() !== "")
        .map(c => ({ category: c.category, answer: c.answer.trim().slice(0, 1000), updated_by: userId, updated_at: now }));
    const removed = changes.filter(c => c.answer.trim() === "").map(c => c.category);
    if (upserts.length > 0) {
        const { error } = await supabase.from("crm_objection_answers").upsert(upserts);
        if (error) throw error;
    }
    if (removed.length > 0) {
        const { error } = await supabase.from("crm_objection_answers").delete().in("category", removed);
        if (error) throw error;
    }
}
