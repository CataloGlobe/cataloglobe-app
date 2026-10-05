/**
 * Post-vendita del CRM (pagina /admin/clienti, migration 20261006090000-090200).
 * Segnali d'uso da `crm_post_sale_accounts()`, gesti del team in
 * `crm_post_sale_actions`, «Presentato da» su `crm_venues.referred_by`.
 */
import { supabase } from "@/services/supabase/client";
import type { CrmPostSaleAccountRow, CrmPostSaleActionRow } from "@/types/crm";
import type { PostSaleKind } from "@shared/crmPostSale";

export async function listCrmPostSaleAccounts(): Promise<CrmPostSaleAccountRow[]> {
    const { data, error } = await supabase.rpc("crm_post_sale_accounts");
    if (error) throw error;
    return (data ?? []) as CrmPostSaleAccountRow[];
}

export async function listCrmPostSaleActions(): Promise<CrmPostSaleActionRow[]> {
    const { data, error } = await supabase
        .from("crm_post_sale_actions")
        .select("venue_id, kind, alerted_at, done_at, done_by, snoozed_until");
    if (error) throw error;
    return (data ?? []) as CrmPostSaleActionRow[];
}

/** «Fatto»: il gesto non torna più per questo cliente. */
export async function markCrmPostSaleDone(venueId: string, kind: PostSaleKind, userId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from("crm_post_sale_actions")
        .upsert(
            { venue_id: venueId, kind, done_at: now, done_by: userId, snoozed_until: null, updated_at: now },
            { onConflict: "venue_id,kind" }
        );
    if (error) throw error;
}

/** «Non ora»: torna fra i gesti da fare a `until`. */
export async function snoozeCrmPostSale(venueId: string, kind: PostSaleKind, until: string): Promise<void> {
    const { error } = await supabase
        .from("crm_post_sale_actions")
        .upsert(
            { venue_id: venueId, kind, snoozed_until: until, updated_at: new Date().toISOString() },
            { onConflict: "venue_id,kind" }
        );
    if (error) throw error;
}

/** «Presentato da»: testo libero (fino a 160 caratteri), vuoto = nessuno. */
export async function setCrmVenueReferredBy(venueId: string, referredBy: string): Promise<void> {
    const value = referredBy.trim();
    const { error } = await supabase
        .from("crm_venues")
        .update({ referred_by: value === "" ? null : value.slice(0, 160) })
        .eq("id", venueId);
    if (error) throw error;
}
