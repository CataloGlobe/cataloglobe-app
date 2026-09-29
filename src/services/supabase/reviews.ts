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

export async function updateReviewStatus(
    reviewId: string,
    status: "pending" | "approved" | "hidden"
): Promise<void> {
    const { error } = await supabase
        .from("reviews")
        .update({ status })
        .eq("id", reviewId);

    if (error) throw error;
}
