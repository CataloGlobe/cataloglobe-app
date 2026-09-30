import { supabase } from "@/services/supabase/client";
import type { Review } from "@/types/database";

/**
 * Recensioni dell'azienda sulle sedi indicate, dalla più recente: una query
 * sola invece di una per sede. `activityIds` vuoto = nessuna recensione.
 */
export async function listReviews(tenantId: string, activityIds: string[]): Promise<Review[]> {
    if (activityIds.length === 0) return [];
    const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("activity_id", activityIds)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function deleteReview(reviewId: string, tenantId: string) {
    const { data, error } = await supabase
        .from("reviews")
        .delete()
        .eq("id", reviewId)
        .eq("tenant_id", tenantId)
        .select("id");

    if (error) {
        console.error("Errore Supabase deleteReview:", error);
        throw error;
    }

    if (!data || data.length === 0) {
        throw new Error("Nessuna recensione trovata da eliminare.");
    }

    return data[0];
}

export type ReviewStatus = Review["status"];

/**
 * Cambia lo stato di una recensione (la coda di moderazione, §34.9/1).
 * Scrive **solo** `status`: dal 30/09/2026 chi modera ha il privilegio
 * UPDATE sulla sola colonna (mig `20260930120300`), qualunque altra colonna
 * nel corpo fa fallire la richiesta con 42501.
 *
 * Lancia a 0 righe, come `deleteReview`: senza `reviews.moderate` sulla sede,
 * o con la recensione già eliminata, la RLS non tocca niente ed `error` resta
 * nullo — prima la UI avrebbe detto «pubblicata» senza che cambiasse niente.
 */
export async function updateReviewStatus(
    reviewId: string,
    tenantId: string,
    status: ReviewStatus
): Promise<void> {
    const { data, error } = await supabase
        .from("reviews")
        .update({ status })
        .eq("id", reviewId)
        .eq("tenant_id", tenantId)
        .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error("Nessuna recensione aggiornata.");
    }
}

/**
 * Recensioni in attesa, per il badge della voce di sidebar. `activityIds`
 * `null` = tutte le sedi dell'azienda (owner, admin); vuoto = nessuna.
 * La RLS resta il confine: conta solo le sedi che il chiamante legge.
 */
export async function countPendingReviews(tenantId: string, activityIds: string[] | null): Promise<number> {
    if (activityIds && activityIds.length === 0) return 0;
    let query = supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending");
    if (activityIds) query = query.in("activity_id", activityIds);
    const { count, error } = await query;

    if (error) throw error;
    return count ?? 0;
}
