import { supabase } from "./client";
import type { Review } from "@/types/database";

export type AnalyticsReview = Pick<Review, "id" | "rating" | "source" | "created_at">;

export async function getUserReviews(userId: string): Promise<Review[]> {
    // 1) prendo gli id dei locali dell'utente
    const { data: businesses, error: restError } = await supabase
        .from("businesses")
        .select("id")
        .eq("user_id", userId);

    if (restError) throw restError;
    if (!businesses || businesses.length === 0) return [];

    const restaurantIds = businesses.map(r => r.id);

    // 2) prendo le recensioni di quei locali
    const { data: reviews, error: revError } = await supabase
        .from("reviews")
        .select("*")
        .in("business_id", restaurantIds)
        .order("created_at", { ascending: false });

    if (revError) throw revError;
    return reviews ?? [];
}

export async function getReviewsByUser(userId: string) {
    const { data, error } = await supabase
        .from("reviews")
        .select("*, businesses!inner(user_id)")
        .eq("businesses.user_id", userId);
    if (error) throw error;
    return data;
}

/** Se in futuro vuoi filtrare per singolo locale */
export async function getBusinessReviews(restaurantId: string): Promise<Review[]> {
    const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("business_id", restaurantId)
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
            business_id,
            businesses:business_id (
                name,
                user_id
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
        const business = r.businesses?.[0];

        return {
            ...r,
            restaurant_name: business?.name ?? null,
            restaurant_owner_id: business?.user_id ?? null
        };
    });
}
