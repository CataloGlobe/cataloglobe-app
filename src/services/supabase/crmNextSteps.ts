/**
 * Il prossimo passo di un locale (scheda del lead, migration 20261005150300).
 * Tabella di piattaforma `crm_next_steps`: una riga per locale.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmNextStep } from "@/types/crm";

const SELECT = "venue_id, step, due_on, owner_user_id, set_by, set_at";

/** Il passo del locale; null se non ce n'è uno. */
export async function getCrmNextStep(venueId: string): Promise<CrmNextStep | null> {
    const { data, error } = await supabase.from("crm_next_steps").select(SELECT).eq("venue_id", venueId).maybeSingle();
    if (error) throw error;
    return (data as CrmNextStep | null) ?? null;
}

/** Scrive il passo (sopra quello di prima). `dueOn` = AAAA-MM-GG o null. */
export async function setCrmNextStep(
    venueId: string,
    input: { step: string; dueOn: string | null; ownerUserId: string | null },
    userId: string
): Promise<void> {
    const { error } = await supabase.from("crm_next_steps").upsert({
        venue_id: venueId,
        step: input.step.trim(),
        due_on: input.dueOn,
        owner_user_id: input.ownerUserId,
        set_by: userId,
        set_at: new Date().toISOString()
    });
    if (error) throw error;
}

/** «Fatto»: il passo non c'è più. */
export async function clearCrmNextStep(venueId: string): Promise<void> {
    const { error } = await supabase.from("crm_next_steps").delete().eq("venue_id", venueId);
    if (error) throw error;
}
