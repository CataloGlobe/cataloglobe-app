import i18next from "i18next";
import { trackEvent } from "@/services/analytics/publicAnalytics";

export type ReviewPayload = {
    supabaseUrl: string;
    activityId: string;
    sessionId: string;
    rating: number;
    comment: string;
    /** Campo trappola: lo compila solo un bot (vedi submit-review). */
    website: string;
};

function ratingCategory(rating: number): "positive" | "neutral" | "negative" {
    if (rating >= 4) return "positive";
    if (rating === 3) return "neutral";
    return "negative";
}

/**
 * Invia un voto a `submit-review` e traccia `review_submitted`. Comune al modulo
 * di oggi (ReviewsView) e a quello del redesign. In caso di errore restituisce il
 * messaggio da mostrare, già tradotto dal codice dell'edge.
 */
export async function submitReview(payload: ReviewPayload): Promise<{ ok: true } | { ok: false; message: string }> {
    const comment = payload.comment.trim();
    const generic = () => i18next.t("error_generic", { ns: "common" });
    try {
        const res = await fetch(`${payload.supabaseUrl}/functions/v1/submit-review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                activity_id: payload.activityId,
                rating: payload.rating,
                comment: comment || undefined,
                session_id: payload.sessionId,
                website: payload.website || undefined
            })
        });

        if (res.ok) {
            const body = await res.json();
            if (body.success) {
                trackEvent(payload.activityId, "review_submitted", {
                    rating: payload.rating,
                    rating_category: ratingCategory(payload.rating),
                    has_feedback_text: comment.length > 0
                });
                return { ok: true };
            }
        }

        // Errore strutturato dell'edge (Prompt 12: error_code + error legacy).
        let errorCode = "SERVER_ERROR";
        let legacyMessage: string | undefined;
        try {
            const errBody = await res.json();
            if (typeof errBody?.error_code === "string") errorCode = errBody.error_code;
            if (typeof errBody?.error === "string") legacyMessage = errBody.error;
        } catch {
            // body non JSON → valori di default
        }
        return {
            ok: false,
            message: i18next.t(`reviews.${errorCode}`, { ns: "errors", defaultValue: legacyMessage ?? generic() })
        };
    } catch {
        return { ok: false, message: generic() };
    }
}
