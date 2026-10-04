/**
 * Riepilogo del giro in /admin (F1-9): `crm_summary(da, a)` (migration
 * 20261004020000), numeri dai dati che il CRM raccoglie già.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmSummary } from "@/types/crm";

export async function getCrmSummary(from: Date, to: Date): Promise<CrmSummary> {
    const { data, error } = await supabase.rpc("crm_summary", { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error) throw error;
    const s = data as CrmSummary;
    return {
        ...s,
        first_contact_minutes_median:
            s.first_contact_minutes_median === null ? null : Number(s.first_contact_minutes_median)
    };
}
