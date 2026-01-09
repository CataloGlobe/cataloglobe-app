import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import styles from "./PublicReview.module.scss";

const publicClient = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "" } }
    }
);

// Stesse categorie della dashboard
const TAG_OPTIONS = [
    "Qualità del cibo",
    "Servizio",
    "Tempi di attesa",
    "Prezzo",
    "Pulizia",
    "Atmosfera"
];

export default function PublicReview() {
    const { slug } = useParams();
    const [restaurant, setBusiness] = useState<{ id: string; name: string } | null>(null);

    const [rating, setRating] = useState<number>(0);
    const [comment, setComment] = useState<string>("");

    // 🔥 TAG MULTIPLI
    const [tags, setTags] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 🔹 Recupera ristorante dal DB
    useEffect(() => {
        async function fetchBusiness() {
            const { data, error } = await publicClient
                .from("businesses")
                .select("id, name")
                .eq("slug", slug)
                .single();

            if (error || !data) setError("Business non trovato");
            else setBusiness(data);
        }

        fetchBusiness();
    }, [slug]);

    // 🔥 Toggle tag multipli
    function toggleTag(tag: string) {
        setTags(prev => {
            if (prev.includes(tag)) {
                return prev.filter(t => t !== tag);
            }
            if (prev.length >= 3) return prev; // massimo 3 tag (opzionale)
            return [...prev, tag];
        });
    }

    // 🔹 Invia recensione a Supabase
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!restaurant) return;

        setSubmitting(true);

        const { error } = await publicClient.from("reviews").insert([
            {
                business_id: restaurant.id,
                rating,
                comment,
                tags, // 🔥 aggiunto
                source: "public"
            }
        ]);

        setSubmitting(false);

        if (error) {
            console.error("Errore invio recensione:", error.message);
            setError("Errore durante l'invio: " + (error.message || "Riprova più tardi."));
        } else {
            setSubmitted(true);
        }
    }

    // =======================
    // UI rendering
    // =======================
    if (error) {
        return (
            <div className={styles.container}>
                <p className={styles.error}>{error}</p>
            </div>
        );
    }

    if (!restaurant) {
        return <AppLoader message="Stiamo caricando il form" />;
    }

    if (submitted) {
        return (
            <div className={styles.container}>
                <h2>Grazie per la tua recensione! 🙏</h2>
                <p>
                    La tua opinione aiuta <strong>{restaurant.name}</strong> a migliorare ogni
                    giorno.
                </p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1>{restaurant.name}</h1>
            <p className={styles.subtitle}>Lascia la tua recensione</p>

            <form onSubmit={handleSubmit} className={styles.form}>
                {/* Voto */}
                <div className={styles.ratingGroup}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <span
                            key={star}
                            onClick={() => setRating(star)}
                            className={`${styles.star} ${rating >= star ? styles.active : ""}`}
                            role="button"
                            aria-label={`${star} stelle`}
                        >
                            ★
                        </span>
                    ))}
                </div>

                {/* 🔥 TAG MULTIPLI */}
                <div className={styles.tags}>
                    <label>Seleziona fino a 3 categorie:</label>
                    <div className={styles.tagList}>
                        {TAG_OPTIONS.map(tag => (
                            <button
                                type="button"
                                key={tag}
                                className={`${styles.tag} ${
                                    tags.includes(tag) ? styles.tagActive : ""
                                }`}
                                onClick={() => toggleTag(tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Commento */}
                <textarea
                    placeholder="Lascia un commento (facoltativo)..."
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={4}
                />

                {/* Submit */}
                <button
                    type="submit"
                    className={styles.submit}
                    disabled={rating === 0 || submitting}
                >
                    {submitting ? "Invio in corso..." : "Invia recensione"}
                </button>
            </form>
        </div>
    );
}
