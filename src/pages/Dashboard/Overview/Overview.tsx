import { useEffect, useState, memo } from "react";
import { useAuth } from "@context/useAuth";
import { getUserBusinesses } from "@services/supabase/businesses";
import { supabase } from "@services/supabase/client";
import type { Review, Business } from "@/types/database";
import Text from "@components/ui/Text/Text";
import Skeleton from "@components/ui/Skeleton/Skeleton";
import { useNavigate } from "react-router-dom";
import styles from "./Overview.module.scss";

export default function Overview() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [average, setAverage] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    console.log("ENV", import.meta.env.VITE_ENV);
    console.log("SITE", import.meta.env.VITE_SITE_URL);

    useEffect(() => {
        if (!user?.id) return;
        loadOverview();
    }, [user?.id]);

    async function loadOverview() {
        setLoading(true);
        setError(null);

        try {
            const rest = await getUserBusinesses(user!.id);
            setBusinesses(rest);

            const results = await Promise.all(
                rest.map(r => supabase.from("reviews").select("*").eq("business_id", r.id))
            );

            const allReviews: Review[] = results
                .filter(r => !r.error && r.data)
                .flatMap(r => r.data as Review[]);

            setReviews(allReviews);

            if (allReviews.length > 0) {
                const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
                setAverage(parseFloat(avg.toFixed(1)));
            } else setAverage(null);
        } catch (err) {
            console.error(err);
            setError("Errore nel caricamento dei dati");
        } finally {
            setLoading(false);
        }
    }

    const recentReviews = [...reviews]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 4);

    const pending = reviews.filter(r => r.rating <= 3 && !r.response);

    // 🔹 Stato errore accessibile
    if (error) {
        return (
            <div className={styles.overview} role="alert" aria-live="assertive">
                <Text variant="body" colorVariant="error" align="center">
                    {error}
                </Text>
            </div>
        );
    }

    // 🔹 Stato caricamento — skeleton realistici
    if (loading) {
        return (
            <div className={styles.overview} aria-busy="true" aria-live="polite">
                <Skeleton height="36px" width="45%" radius="8px" className={styles.skeletonHero} />
                <div className={styles.kpiGrid}>
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} height="90px" radius="12px" />
                    ))}
                </div>
                <Skeleton height="180px" radius="12px" />
                <Skeleton height="100px" radius="12px" />
            </div>
        );
    }

    return (
        <main className={styles.overview} aria-label="Panoramica utente">
            {/* Header */}
            <header className={styles.header}>
                <Text variant="title-lg" weight={600}>
                    Ciao {user?.email?.split("@")[0]} 👋
                </Text>
                <Text variant="body" colorVariant="muted">
                    Ecco una panoramica aggiornata dei tuoi locali.
                </Text>
            </header>

            {/* KPI principali */}
            <section className={styles.kpiGrid} aria-label="Statistiche principali" role="group">
                <KPICard label="Recensioni totali" value={reviews.length.toString()} />
                <KPICard label="Valutazione media" value={average ? average.toString() : "–"} />
                <KPICard label="Locali gestiti" value={businesses.length.toString()} />
                {pending.length > 0 && (
                    <KPICard label="Da gestire" value={pending.length.toString()} type="alert" />
                )}
            </section>

            {/* Attività recenti */}
            <section className={styles.recent} aria-label="Attività recenti">
                <div className={styles.recentHeader}>
                    <Text variant="title-sm">Attività recenti</Text>
                    {recentReviews.length > 0 && (
                        <Text
                            as="a"
                            className={styles.linkBtn}
                            onClick={() => navigate("/dashboard/reviews")}
                        >
                            Vedi tutte
                        </Text>
                    )}
                </div>

                {recentReviews.length === 0 ? (
                    <Text variant="body" colorVariant="muted">
                        Nessuna recensione recente.
                    </Text>
                ) : (
                    <ul className={styles.reviewList} role="list">
                        {recentReviews.map(r => {
                            const rest = businesses.find(res => res.id === r.business_id);
                            const isNegative = r.rating <= 3;
                            return (
                                <li key={r.id} role="listitem" className={styles.reviewItem}>
                                    <span
                                        aria-label={`Recensione da ${r.rating} stelle`}
                                        className={`${styles.badge} ${
                                            isNegative ? styles.bad : styles.good
                                        }`}
                                    >
                                        {r.rating}★
                                    </span>
                                    <div className={styles.reviewText}>
                                        <Text variant="body" weight={500}>
                                            {rest?.name ?? "Locale sconosciuto"}
                                        </Text>
                                        <Text variant="body" colorVariant="muted">
                                            {r.comment || "Nessun commento"}
                                        </Text>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* CTA finale */}
            <section className={styles.analyticsCard} aria-label="Approfondisci i dati">
                <div>
                    <Text variant="title-sm" weight={500}>
                        📊 Vuoi analizzare le tue statistiche nel dettaglio?
                    </Text>
                    <Text variant="body" colorVariant="muted">
                        Esplora grafici, trend e confronti nella sezione Analytics.
                    </Text>
                </div>
                <Text
                    as="a"
                    className={styles.linkBtn}
                    onClick={() => navigate("/dashboard/analytics")}
                >
                    Vai a Analytics
                </Text>
            </section>
        </main>
    );
}

// 🔸 Componente memoizzato per performance
const KPICard = memo(function KPICard({
    label,
    value,
    type = "default"
}: {
    label: string;
    value: string;
    type?: "default" | "alert";
}) {
    return (
        <div
            className={`${styles.kpiCard} ${type === "alert" ? styles.alertCard : ""}`}
            role="group"
            aria-label={`${label}: ${value}`}
        >
            <Text variant="caption" colorVariant="muted">
                {label}
            </Text>
            <Text variant="title-md" weight={600}>
                {value}
            </Text>
        </div>
    );
});
