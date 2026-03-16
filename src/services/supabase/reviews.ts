import { supabase } from "@/services/supabase/client";
import type { Review } from "@/types/database";

export type AnalyticsReview = Pick<Review, "id" | "rating" | "source" | "created_at">;

/** Se in futuro vuoi filtrare per singolo locale */
export async function getBusinessReviews(restaurantId: string): Promise<Review[]> {
    const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("activity_id", restaurantId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function addReview(userId: string, rating: number, comment: string) {
    const { error } = await supabase.from("reviews").insert([
        {
            user_id: userId,
            rating,
            comment
        }
    ]);

    if (error) {
        console.error("Errore durante l'inserimento recensione:", error.message);
        throw error;
    }
}

export async function deleteReview(reviewId: string) {
    const { data, error } = await supabase.from("reviews").delete().eq("id", reviewId).select("id");

    if (error) {
        console.error("Errore Supabase deleteReview:", error);
        throw error;
    }

    if (!data || data.length === 0) {
        // utile per capire se l'id non matcha nessuna riga
        throw new Error("Nessuna recensione trovata da eliminare.");
    }

    return data[0]; // opzionale, ma comodo se vuoi usarlo
}

export async function updateReviewResponse(reviewId: string, response: string) {
    const { error } = await supabase
        .from("reviews")
        .update({ response, response_date: new Date().toISOString() })
        .eq("id", reviewId);

    if (error) throw error;
}

/** Ottiene tutte le recensioni per un ristorante o globali */
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
            v2_activities:activity_id (
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
        const activity = r.v2_activities?.[0];

        return {
            ...r,
            restaurant_name: activity?.name ?? null,
            restaurant_owner_id: activity?.tenant_id ?? null
        };
    });
}
