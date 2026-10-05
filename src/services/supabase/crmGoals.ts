/**
 * Obiettivo della settimana del CRM (Home, migration 20261005150200).
 * Tabella di piattaforma `crm_weekly_goals`: una riga per lunedì di Roma.
 */
import { supabase } from "@/services/supabase/client";

/** Il numero di telefonate da fissare nella settimana; null se non è stato scelto. */
export async function getCrmWeeklyGoal(weekStart: string): Promise<number | null> {
    const { data, error } = await supabase
        .from("crm_weekly_goals")
        .select("calls_target")
        .eq("week_start", weekStart)
        .maybeSingle();
    if (error) throw error;
    return (data as { calls_target: number } | null)?.calls_target ?? null;
}

/** Sceglie o cambia l'obiettivo della settimana (`weekStart` = lunedì, AAAA-MM-GG). */
export async function setCrmWeeklyGoal(weekStart: string, callsTarget: number, userId: string): Promise<void> {
    const { error } = await supabase
        .from("crm_weekly_goals")
        .upsert({ week_start: weekStart, calls_target: callsTarget, set_by: userId, set_at: new Date().toISOString() });
    if (error) throw error;
}
