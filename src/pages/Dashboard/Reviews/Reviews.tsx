import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { getActivities } from "@/services/supabase/activities";
import { getBusinessReviews, deleteReview } from "@/services/supabase/reviews";
import type { Review } from "@/types/database";
import { Trash2, MessageSquare } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Select } from "@/components/ui/Select/Select";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { PillGroupSingle } from "@/components/ui/PillGroup/PillGroupSingle";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";

import styles from "./Reviews.module.scss";

/* ── Types ───────────────────────────────────────────── */

type ActivityItem = { id: string; name: string };
type PeriodFilter = "all" | "7d" | "30d" | "90d" | "custom";
type SortOption = "newest" | "oldest" | "ratingAsc" | "ratingDesc";

const RATING_OPTIONS = [
    { value: "all", label: "Tutte" },
    { value: "5", label: "5 \u2605" },
    { value: "4", label: "4 \u2605" },
    { value: "3", label: "3 \u2605" },
    { value: "2", label: "2 \u2605" },
    { value: "1", label: "1 \u2605" },
] as const;

const PERIOD_OPTIONS = [
    { value: "all", label: "Tutto il periodo" },
    { value: "7d", label: "Ultimi 7 giorni" },
    { value: "30d", label: "Ultimi 30 giorni" },
    { value: "90d", label: "Ultimi 90 giorni" },
    { value: "custom", label: "Periodo personalizzato" },
];

const SORT_OPTIONS = [
    { value: "newest", label: "Più recenti" },
    { value: "oldest", label: "Meno recenti" },
    { value: "ratingDesc", label: "Voto \u2191" },
    { value: "ratingAsc", label: "Voto \u2193" },
];

/* ── Helpers ─────────────────────────────────────────── */

function relativeDate(iso: string): string {
    const now = new Date();
    const date = new Date(iso);
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);

    if (mins < 1) return "Adesso";
    if (mins < 60) return `${mins}m fa`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h fa`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Ieri";

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} giorni fa`;

    return date.toLocaleDateString("it-IT");
}

function ratingColorClass(rating: number): string {
    if (rating >= 4) return styles.ratingGreen;
    if (rating === 3) return styles.ratingYellow;
    return styles.ratingRed;
}

function distOpacityClass(star: number): string {
    switch (star) {
        case 5: return styles.distOpacity5;
        case 4: return styles.distOpacity4;
        case 3: return styles.distOpacity3;
        case 2: return styles.distOpacity2;
        default: return styles.distOpacity1;
    }
}

/* ── Star SVG row ────────────────────────────────────── */

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
    return (
        <div className={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
                <svg key={n} viewBox="0 0 24 24" width={size} height={size}>
                    <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        fill={n <= Math.round(rating) ? "#1E293B" : "none"}
                        stroke={n <= Math.round(rating) ? "#1E293B" : "#CBD5E1"}
                        strokeWidth="1.5"
                    />
                </svg>
            ))}
        </div>
    );
}

/* ── Component ───────────────────────────────────────── */

export default function Reviews() {
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const location = useLocation();
    const { showToast } = useToast();

    /* ── State ──────────────────────────────────────── */
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [selectedActivity, setSelectedActivity] = useState("");
    const [loading, setLoading] = useState(true);

    const [filterRating, setFilterRating] = useState<string>("all");
    const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>("all");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [searchQuery, setSearchQuery] = useState("");

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const preselectedId: string | null =
        (location.state as { restaurantId?: string } | null)?.restaurantId ?? null;

    /* ── Fetch reviews ──────────────────────────────── */
    const fetchReviews = useCallback(
        async (activityId: string, allIds: string[]) => {
            if (activityId) {
                return getBusinessReviews(activityId);
            }
            if (allIds.length === 0) return [];
            const results = await Promise.all(
                allIds.map((id) => getBusinessReviews(id)),
            );
            return results.flat();
        },
        [],
    );

    /* ── Initial load ───────────────────────────────── */
    useEffect(() => {
        if (!tenantId) return;
        const tid = tenantId;
        let cancelled = false;

        async function init() {
            setLoading(true);
            try {
                const acts = await getActivities(tid);
                if (cancelled) return;

                const items = acts.map((a) => ({ id: a.id, name: a.name }));
                setActivities(items);

                const initial = preselectedId ?? "";
                setSelectedActivity(initial);

                const data = await fetchReviews(
                    initial,
                    items.map((a) => a.id),
                );
                if (cancelled) return;
                setReviews(data);
            } catch {
                showToast({ message: "Errore nel caricamento", type: "error" });
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void init();
        return () => {
            cancelled = true;
        };
    }, [tenantId, preselectedId, fetchReviews, showToast]);

    /* ── Activity options for Select ─────────────────── */
    const activityOptions = useMemo(
        () => [
            { value: "", label: "Tutte le sedi" },
            ...activities.map((a) => ({ value: a.id, label: a.name })),
        ],
        [activities],
    );

    /* ── Activity name map ──────────────────────────── */
    const activityNameMap = useMemo(() => {
        const map = new Map<string, string>();
        activities.forEach((a) => map.set(a.id, a.name));
        return map;
    }, [activities]);

    /* ── Period filtering (base for stats) ──────────── */
    const periodFilteredReviews = useMemo(() => {
        const now = Date.now();

        if (filterPeriod === "7d") {
            const t = now - 7 * 86_400_000;
            return reviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "30d") {
            const t = now - 30 * 86_400_000;
            return reviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "90d") {
            const t = now - 90 * 86_400_000;
            return reviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "custom") {
            return reviews.filter((r) => {
                const ts = new Date(r.created_at).getTime();
                if (customFrom && ts < new Date(customFrom).getTime()) return false;
                if (customTo && ts > new Date(customTo).getTime() + 86_400_000 - 1)
                    return false;
                return true;
            });
        }
        return reviews;
    }, [reviews, filterPeriod, customFrom, customTo]);

    /* ── Stats ──────────────────────────────────────── */
    const stats = useMemo(() => {
        const total = periodFilteredReviews.length;
        if (total === 0)
            return { average: null, total: 0, positive: 0, negative: 0 };

        const sum = periodFilteredReviews.reduce((s, r) => s + r.rating, 0);
        return {
            average: Math.round((sum / total) * 10) / 10,
            total,
            positive: periodFilteredReviews.filter((r) => r.rating >= 4).length,
            negative: periodFilteredReviews.filter((r) => r.rating <= 2).length,
        };
    }, [periodFilteredReviews]);

    const distribution = useMemo(() => {
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of periodFilteredReviews) {
            dist[r.rating] = (dist[r.rating] ?? 0) + 1;
        }
        return dist;
    }, [periodFilteredReviews]);

    const maxDistCount = useMemo(
        () => Math.max(...Object.values(distribution), 1),
        [distribution],
    );

    /* ── Final filtered + sorted reviews ────────────── */
    const displayedReviews = useMemo(() => {
        let result = [...periodFilteredReviews];

        if (filterRating !== "all") {
            const rating = Number(filterRating);
            result = result.filter((r) => r.rating === rating);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((r) =>
                (r.comment?.toLowerCase() ?? "").includes(q),
            );
        }

        result.sort((a, b) => {
            switch (sortBy) {
                case "newest":
                    return (
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    );
                case "oldest":
                    return (
                        new Date(a.created_at).getTime() -
                        new Date(b.created_at).getTime()
                    );
                case "ratingDesc":
                    return b.rating - a.rating;
                case "ratingAsc":
                    return a.rating - b.rating;
                default:
                    return 0;
            }
        });

        return result;
    }, [periodFilteredReviews, filterRating, searchQuery, sortBy]);

    /* ── Handlers ───────────────────────────────────── */
    async function handleActivityChange(activityId: string) {
        setSelectedActivity(activityId);
        setLoading(true);
        try {
            const data = await fetchReviews(
                activityId,
                activities.map((a) => a.id),
            );
            setReviews(data);
        } catch {
            showToast({ message: "Errore nel caricamento", type: "error" });
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(reviewId: string) {
        try {
            await deleteReview(reviewId);
            setReviews((prev) => prev.filter((r) => r.id !== reviewId));
            setDeletingId(null);
            showToast({ message: "Recensione eliminata", type: "success" });
        } catch {
            showToast({
                message: "Errore durante l'eliminazione",
                type: "error",
            });
            setDeletingId(null);
        }
    }

    /* ── Render ──────────────────────────────────────── */
    return (
        <div className={styles.page}>
            {/* ── Header ──────────────────────────────── */}
            <PageHeader
                title="Recensioni"
                businessName={selectedTenant?.name}
                subtitle="Monitora il feedback ricevuto dai tuoi clienti."
                actions={
                    <Select
                        value={selectedActivity}
                        disabled={loading}
                        onChange={(e) => void handleActivityChange(e.target.value)}
                        options={activityOptions}
                        containerClassName={styles.activitySelectContainer}
                    />
                }
            />

            {/* ── Stats block ─────────────────────────── */}
            <div className={styles.statsBlock}>
                {/* Media */}
                <div className={styles.statCell}>
                    <Text variant="caption" colorVariant="muted" weight={600} className={styles.statLabel}>
                        MEDIA
                    </Text>
                    <div className={styles.statBigNumber}>
                        <span>
                            {stats.average !== null ? stats.average.toFixed(1) : "-"}
                        </span>
                        <span className={styles.statBigNumberSuffix}>/ 5</span>
                    </div>
                    {stats.average !== null && (
                        <StarRow rating={stats.average} size={14} />
                    )}
                </div>

                <div className={styles.statDivider} />

                {/* Totale */}
                <div className={styles.statCell}>
                    <Text variant="caption" colorVariant="muted" weight={600} className={styles.statLabel}>
                        TOTALE
                    </Text>
                    <div className={styles.statBigNumber}>
                        <span>{stats.total}</span>
                    </div>
                    <div className={styles.indicators}>
                        <div className={styles.indicator}>
                            <span
                                className={`${styles.indicatorDot} ${styles.indicatorDotPositive}`}
                            />
                            <Text variant="caption" colorVariant="muted">
                                {stats.positive} positive
                            </Text>
                        </div>
                        <div className={styles.indicator}>
                            <span
                                className={`${styles.indicatorDot} ${styles.indicatorDotNegative}`}
                            />
                            <Text variant="caption" colorVariant="muted">
                                {stats.negative} negative
                            </Text>
                        </div>
                    </div>
                </div>

                <div className={styles.statDivider} />

                {/* Distribuzione */}
                <div className={styles.statCell}>
                    <Text variant="caption" colorVariant="muted" weight={600} className={styles.statLabel}>
                        DISTRIBUZIONE
                    </Text>
                    <div className={styles.distRows}>
                        {([5, 4, 3, 2, 1] as const).map((star) => {
                            const count = distribution[star];
                            const pct =
                                maxDistCount > 0
                                    ? (count / maxDistCount) * 100
                                    : 0;
                            return (
                                <div key={star} className={styles.distRow}>
                                    <Text variant="caption" weight={600} colorVariant="muted" className={styles.distStar}>
                                        {star}
                                    </Text>
                                    <div className={styles.distBarTrack}>
                                        <div
                                            className={`${styles.distBarFill} ${distOpacityClass(star)}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <Text variant="caption-xs" colorVariant="muted" className={styles.distCount}>
                                        {count}
                                    </Text>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Toolbar ─────────────────────────────── */}
            <div className={styles.toolbar}>
                <PillGroupSingle
                    options={RATING_OPTIONS}
                    value={filterRating}
                    onChange={setFilterRating}
                    ariaLabel="Filtra per voto"
                />

                <div className={styles.toolbarRight}>
                    <Select
                        value={filterPeriod}
                        onChange={(e) => {
                            const val = e.target.value as PeriodFilter;
                            setFilterPeriod(val);
                            if (val !== "custom") {
                                setCustomFrom("");
                                setCustomTo("");
                            }
                        }}
                        options={PERIOD_OPTIONS}
                        containerClassName={styles.toolbarSelect}
                    />

                    <SearchInput
                        placeholder="Cerca..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        containerClassName={styles.toolbarSearch}
                    />

                    <Select
                        value={sortBy}
                        onChange={(e) =>
                            setSortBy(e.target.value as SortOption)
                        }
                        options={SORT_OPTIONS}
                        containerClassName={styles.toolbarSelectNarrow}
                    />
                </div>
            </div>

            {/* ── Custom date range ───────────────────── */}
            {filterPeriod === "custom" && (
                <div className={styles.dateRange}>
                    <DateInput
                        label="Da"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        containerClassName={styles.dateField}
                    />
                    <DateInput
                        label="A"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        containerClassName={styles.dateField}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setCustomFrom("");
                            setCustomTo("");
                        }}
                    >
                        Azzera
                    </Button>
                </div>
            )}

            {/* ── Review list ─────────────────────────── */}
            {loading ? (
                <div className={styles.reviewList}>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className={styles.skeletonRow}>
                            <div className={styles.skeletonRating}>
                                <Skeleton width="48px" height="28px" />
                                <Skeleton width="56px" height="10px" />
                            </div>
                            <div className={styles.skeletonBody}>
                                <Skeleton width="80%" height="14px" />
                                <Skeleton width="60%" height="14px" />
                                <Skeleton width="30%" height="10px" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : displayedReviews.length === 0 ? (
                <div className={styles.reviewList}>
                    <EmptyState
                        icon={<MessageSquare size={40} strokeWidth={1.5} />}
                        title="Nessuna recensione trovata"
                        description="Prova a modificare i filtri."
                    />
                </div>
            ) : (
                <div className={styles.reviewList}>
                    {displayedReviews.map((review) => (
                        <article key={review.id} className={styles.reviewRow}>
                            {/* Rating */}
                            <div className={styles.reviewRating}>
                                <span
                                    className={`${styles.ratingNumber} ${ratingColorClass(review.rating)}`}
                                >
                                    {review.rating.toFixed(1)}
                                </span>
                                <StarRow rating={review.rating} size={10} />
                            </div>

                            {/* Body */}
                            <div className={styles.reviewBody}>
                                {review.comment ? (
                                    <Text variant="body-sm" className={styles.reviewComment}>
                                        {review.comment}
                                    </Text>
                                ) : (
                                    <Text variant="body-sm" colorVariant="muted" className={styles.noComment}>
                                        Nessun commento
                                    </Text>
                                )}
                                <div className={styles.reviewMeta}>
                                    <Text variant="caption" colorVariant="muted">
                                        {relativeDate(review.created_at)}
                                    </Text>
                                    {!selectedActivity && (
                                        <>
                                            <span className={styles.metaDot} />
                                            <Text variant="caption" colorVariant="muted">
                                                {activityNameMap.get(
                                                    review.activity_id,
                                                ) ?? ""}
                                            </Text>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className={styles.reviewActions}>
                                {deletingId === review.id ? (
                                    <div className={styles.deleteConfirm}>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() =>
                                                void handleDelete(review.id)
                                            }
                                        >
                                            Elimina
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setDeletingId(null)}
                                        >
                                            Annulla
                                        </Button>
                                    </div>
                                ) : (
                                    <IconButton
                                        icon={<Trash2 size={16} />}
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Elimina recensione"
                                        onClick={() =>
                                            setDeletingId(review.id)
                                        }
                                        className={styles.deleteIconBtn}
                                    />
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {/* ── Footer ──────────────────────────────── */}
            {!loading && displayedReviews.length > 0 && (
                <Text variant="caption" colorVariant="muted" align="center">
                    {displayedReviews.length} di {periodFilteredReviews.length}{" "}
                    recensioni
                </Text>
            )}
        </div>
    );
}
