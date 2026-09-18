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
