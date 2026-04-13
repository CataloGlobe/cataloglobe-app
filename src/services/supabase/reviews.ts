import { supabase } from "@/services/supabase/client";
import type { Review } from "@/types/database";

export type AnalyticsReview = Pick<Review, "id" | "rating" | "source" | "created_at">;

/** Recensioni per una singola attività */
export async function getBusinessReviews(activityId: string): Promise<Review[]> {
    const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function deleteReview(reviewId: string) {
    const { data, error } = await supabase.from("reviews").delete().eq("id", reviewId).select("id");

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

/** Ottiene tutte le recensioni per analytics */
export async function getAnalyticsReviews() {
    const { data, error } = await supabase
        .from("reviews")
        .select(
            `
            id,
            rating,
            created_at,
            source,
            activity_id,
            activities:activity_id (
                name,
                tenant_id
            )
        `
        )
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Errore caricamento analytics reviews:", error);
        return [];
    }

    // Normalizzazione
    return data.map(r => {
        const activity = r.activities?.[0];

        return {
            ...r,
            restaurant_name: activity?.name ?? null,
            restaurant_owner_id: activity?.tenant_id ?? null
        };
    });
}
