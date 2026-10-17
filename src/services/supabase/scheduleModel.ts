import { supabase } from "@/services/supabase/client";
import type { OverlapMode } from "@shared/scheduleCompetition";

/**
 * Il salvataggio del modello nuovo (multi menù, passo 3): menù o stile,
 * `overlap_mode` e fasce di una regola `menu`/`style` già creata, in un colpo
 * solo con la RPC `save_schedule_model` (mig 20261017090000). Nome, stato,
 * periodo e sedi restano a `updateRule` e `update_schedule_targets`.
 */

type TargetRef = {
    target_type: "activity" | "activity_group";
    target_id: string;
};

/** Una fascia come la salva il database: giorni con 0 = domenica, minuti, fine oltre 1440 se passa la mezzanotte. */
export type ModelSlot = {
    days_of_week: number[] | null;
    start_minute: number;
    end_minute: number;
    /** Le sedi o i gruppi della regola in cui vale; vuoto = tutti quelli della regola. */
    targets?: TargetRef[];
};

export type ScheduleModelPayload = {
    catalog_id?: string;
    style_id?: string;
    overlap_mode?: OverlapMode | null;
    target_overlaps?: Array<TargetRef & { overlap_mode: OverlapMode | null }>;
    /** Assente: fasce non toccate; vuoto: «Sempre». */
    slots?: ModelSlot[];
};

export async function saveScheduleModel(
    scheduleId: string,
    payload: ScheduleModelPayload,
): Promise<void> {
    const { error } = await supabase.rpc("save_schedule_model", {
        p_schedule_id: scheduleId,
        p_payload: payload,
    });
    if (error) throw error;
}

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

/**
 * Una fascia dall'interfaccia (giorni con 0 = lunedì, ore «HH:MM») alla forma
 * del database. Una fine non dopo l'inizio passa la mezzanotte (19:00-02:00 =
 * 1140-1560); «00:00» o «23:59» come fine sono la mezzanotte. Inizio e fine
 * uguali non sono una fascia: errore (sarebbero 24 ore senza dirlo).
 */
export function toModelSlot(input: {
    uiDays: readonly number[] | null;
    from: string;
    to: string;
    targets?: TargetRef[];
}): ModelSlot {
    if (input.from === input.to) throw new Error("La fascia finisce quando comincia");
    const start = toMinutes(input.from);
    let end = toMinutes(input.to);
    if (end === 1439) end = 1440;
    if (end <= start) end += 1440;
    return {
        days_of_week:
            input.uiDays === null
                ? null
                : [...new Set(input.uiDays.map((day) => (day + 1) % 7))].sort(
                        (a, b) => a - b,
                    ),
        start_minute: start,
        end_minute: end,
        ...(input.targets && input.targets.length > 0
            ? { targets: input.targets }
            : {}),
    };
}
