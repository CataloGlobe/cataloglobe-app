import { supabase } from "@/services/supabase/client";

export type ScheduleTargetType = "activity" | "activity_group";

export interface ScheduleTargetInput {
    targetType: ScheduleTargetType;
    targetId: string;
}

/**
 * Sostituisce l'intero set di target di una regola su `schedule_targets`
 * (RPC `update_schedule_targets`, atomica: DELETE + INSERT). Rifiutata dalla
 * RPC se la regola è `apply_to_all=true` — non chiamare in quel caso.
 * Le colonne inline su `schedules` (target_type/target_id/apply_to_all)
 * restano lo shim per Edge/resolver e vanno scritte separatamente.
 */
export async function updateScheduleTargets(
    scheduleId: string,
    targets: ScheduleTargetInput[]
): Promise<void> {
    const { error } = await supabase.rpc("update_schedule_targets", {
        p_schedule_id: scheduleId,
        p_targets: targets.map(t => ({ target_type: t.targetType, target_id: t.targetId }))
    });

    if (error) throw error;
}

/**
 * Porta su una sola sede una bozza appena creata (che nasce su tutte le
 * sedi): «Nuova regola» dalla sede (T9b, PG6). Prima apply_to_all=false con
 * lo shim inline, poi le sedi con la RPC, che rifiuta le regole apply_to_all.
 * Zero righe aggiornate (RLS) è un errore, come in `deleteReview`.
 */
export async function scopeRuleToActivity(scheduleId: string, activityId: string): Promise<void> {
    const { data, error } = await supabase
        .from("schedules")
        .update({ apply_to_all: false, target_type: "activity", target_id: activityId })
        .eq("id", scheduleId)
        .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error("Regola non aggiornata: non hai i permessi su questa regola.");
    }

    await updateScheduleTargets(scheduleId, [{ targetType: "activity", targetId: activityId }]);
}

/**
 * Le regole che il database lascia modificare al caller
 * (`can_write_schedule`, una chiamata per regola). Serve ai ruoli di sede: la
 * RLS di `schedule_targets` mostra loro solo le proprie sedi, quindi una regola
 * che vale anche per sedi altrui sembra tutta loro. Un errore conta come «no».
 */
export async function listWritableScheduleIds(scheduleIds: readonly string[]): Promise<Set<string>> {
    const results = await Promise.all(
        scheduleIds.map(async id => {
            const { data, error } = await supabase.rpc("can_write_schedule", { p_schedule_id: id });
            return !error && data === true ? id : null;
        })
    );
    return new Set(results.filter((id): id is string => id !== null));
}
