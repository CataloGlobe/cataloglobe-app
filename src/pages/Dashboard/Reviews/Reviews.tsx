import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { getUserBusinesses } from "@services/supabase/businesses";
import { getBusinessReviews, deleteReview } from "@services/supabase/reviews";
import type { Review, Business } from "@/types/database";
import Text from "@components/ui/Text/Text";
import { DateInput } from "@/components/ui/Input/DateInput";
import { Globe, ShieldCheck, Trash2, Star } from "lucide-react";
import { SearchInput } from "@/components/ui/Input/SearchInput";

import styles from "./Reviews.module.scss";
import { Select } from "@/components/ui/Select/Select";

const TAG_OPTIONS = [
    "Qualità del cibo",
    "Servizio",
    "Tempi di attesa",
    "Prezzo",
    "Pulizia",
    "Atmosfera"
];

export default function Reviews() {
    const { user } = useAuth();
    const location = useLocation();

    /** ------------------------ STATE ------------------------ */
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);

    const [filterRating, setFilterRating] = useState<number | null>(null);
    const [filterPeriod, setFilterPeriod] = useState<"all" | "7d" | "30d" | "custom">("all");
    const [filterDate, setFilterDate] = useState<string | null>(null);
    const [filterTag, setFilterTag] = useState<string>("");

    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
    const [searchQuery, setSearchQuery] = useState<string>("");

    const [showModal, setShowModal] = useState(false);
    const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);

    const preselectedBusinessId: string | null = location.state?.restaurantId ?? null;

    /** ------------------------ FETCH REVIEW ------------------------ */
    const fetchReviews = useCallback(async (restaurantId: string | null) => {
        if (!restaurantId) {
            setReviews([]);
            return;
        }

        const data = await getBusinessReviews(restaurantId);
        setReviews(data);
    }, []);

    /** ------------------------ FETCH INITIAL ------------------------ */
    useEffect(() => {
        async function init() {
            if (!user) return;
            setLoading(true);

            const userBusinesses = await getUserBusinesses(user.id);
            setBusinesses(userBusinesses);

            const first = preselectedBusinessId ?? userBusinesses[0]?.id ?? null;
            setSelectedBusiness(first);

            await fetchReviews(first);

            setLoading(false);
        }

        void init();
    }, [user, preselectedBusinessId, fetchReviews]);

    /** ------------------------ STATISTICHE ------------------------ */
    const stats = useMemo(() => {
        if (!reviews.length) {
            return {
                average: null,
                total: 0
            };
        }

        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        return {
            average: Number(avg.toFixed(1)),
            total: reviews.length
        };
    }, [reviews]);

    /** ------------------------ FILTRI & SEARCH ------------------------ */
    const filteredAndSortedReviews = useMemo(() => {
        let result = [...reviews];

        // voto
        if (filterRating) {
            result = result.filter(r => r.rating === filterRating);
        }

        // periodo
        const now = Date.now();
        if (filterPeriod === "7d" || filterPeriod === "30d") {
            const days = filterPeriod === "7d" ? 7 : 30;
            const threshold = now - days * 24 * 60 * 60 * 1000;
            result = result.filter(r => new Date(r.created_at).getTime() >= threshold);
        } else if (filterPeriod === "custom" && filterDate) {
            result = result.filter(
                r => new Date(r.created_at).toLocaleDateString("it-IT") === filterDate
            );
        }

        // tag
        if (filterTag) {
            result = result.filter(r => (r.tags ?? []).includes(filterTag));
        }

        // search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(r => {
                const comment = r.comment?.toLowerCase() ?? "";
                const tags = (r.tags ?? []).join(" ").toLowerCase();
                return comment.includes(q) || tags.includes(q);
            });
        }

        // ordinamento
        result.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();

            switch (sortBy) {
                case "newest":
                    return dateB - dateA;
                case "oldest":
                    return dateA - dateB;
                case "highest":
                    return b.rating - a.rating;
                case "lowest":
                    return a.rating - b.rating;
                default:
                    return 0;
            }
        });

        return result;
    }, [reviews, filterRating, filterPeriod, filterDate, filterTag, searchQuery, sortBy]);

    /** ------------------------ DELETE ------------------------ */
    async function handleDelete() {
        if (!reviewToDelete) return;

        try {
            // elimina lato Supabase (con controlli)
            await deleteReview(reviewToDelete);

            // update ottimistico dello state locale
            setReviews(prev => prev.filter(r => r.id !== reviewToDelete));

            // se vuoi essere ultra-sicuro di allineare tutto con il backend,
            // puoi comunque fare un refetch (opzionale):
            // await fetchReviews(selectedBusiness);
        } catch (err) {
            console.error("Errore eliminazione recensione:", err);
        } finally {
            setReviewToDelete(null);
            setShowModal(false);
        }
    }

    /** ------------------------ REVIEW CARD ------------------------ */
    const ReviewCard = ({ review, index }: { review: Review; index: number }) => {
        const [expanded, setExpanded] = useState(false);

        const MAX_LEN = 220;
        const comment = review.comment ?? "";
        const isLong = comment.length > MAX_LEN;
        const displayed = !expanded && isLong ? comment.slice(0, MAX_LEN) + "…" : comment;

        const tags = review.tags ?? [];

        return (
            <article className={styles.review} style={{ animationDelay: `${index * 50}ms` }}>
                <header className={styles.headerRow}>
                    <div className={styles.ratingBox}>
                        <Text variant="caption" className={styles.stars}>
                            {review.rating}
                        </Text>
                        <Star fill="currentColor" width={18} className={styles.stars} />
                    </div>

                    <div
                        className={`${styles.badge} ${
                            review.source === "public" ? styles.public : styles.verified
                        }`}
                    >
                        {review.source === "public" ? (
                            <Globe size={14} />
                        ) : (
                            <ShieldCheck size={14} />
                        )}

                        <Text
                            variant="caption"
                            className={`${
                                review.source === "public" ? styles.public : styles.verified
                            }`}
                        >
                            {review.source === "public" ? " Pubblica " : " Verificata"}-{" "}
                            {new Date(review.created_at).toLocaleDateString("it-IT")}
                        </Text>
                    </div>
                </header>

                {/* TAG PILLS */}
                {tags && tags.length > 0 && (
                    <div className={styles.tagPills}>
                        {tags.map(tag => (
                            <div key={tag} className={styles.tagPill}>
                                {tag}
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.commentContainer}>
                    <div className={styles.commentContent}>
                        <div className={styles.comment}>
                            {comment ? (
                                <Text variant="body">{displayed}</Text>
                            ) : (
                                <Text variant="caption" className={styles.noComment}>
                                    Nessun commento
                                </Text>
                            )}
                        </div>

                        {isLong && (
                            <button
                                type="button"
                                onClick={() => setExpanded(prev => !prev)}
                                className={styles.collapseToggle}
                            >
                                {expanded ? "Mostra meno" : "Mostra tutto"}
                            </button>
                        )}
                    </div>

                    {/* DELETE BUTTON */}
                    <button
                        className={styles.deleteReviewBtn}
                        onClick={() => {
                            setShowModal(true);
                            setReviewToDelete(review.id);
                        }}
                    >
                        <Trash2 />
                    </button>
                </div>
            </article>
        );
    };

    /** -------------------------------------------------
     * RENDER
     -------------------------------------------------- */
    return (
        <div className={styles.reviews}>
            {/* HEADER */}
            <header className={styles.header}>
                <div className={styles.selectBusiness}>
                    <Select
                        label="Attività"
                        value={selectedBusiness ?? ""}
                        disabled={loading}
                        onChange={async e => {
                            const id = e.target.value || null;
                            setSelectedBusiness(id);
                            setLoading(true);
                            await fetchReviews(id);
                            setLoading(false);
                        }}
                        options={[
                            { value: "", label: "Tutte le attività" },
                            ...businesses.map(b => ({
                                value: b.id,
                                label: b.name
                            }))
                        ]}
                    />
                </div>

                <div className={styles.stats}>
                    <div className={styles.statBox}>
                        <Text variant="title-sm">
                            {stats.average !== null ? stats.average : "-"}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Valutazione media
                        </Text>
                    </div>

                    <div className={styles.statBox}>
                        <Text variant="title-sm">{stats.total}</Text>
                        <Text variant="caption" colorVariant="muted">
                            Totale recensioni
                        </Text>
                    </div>
                </div>
            </header>

            {/* FILTRI */}
            <section className={styles.filters}>
                <div className={styles.filterGroup}>
                    <SearchInput
                        placeholder="Cerca per testo o tag…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                <div className={styles.selects}>
                    <div className={styles.filterGroup}>
                        <Select
                            label="Voto"
                            value={filterRating ?? ""}
                            onChange={e =>
                                setFilterRating(e.target.value ? Number(e.target.value) : null)
                            }
                            options={[
                                { value: "", label: "Tutti" },
                                ...["5", "4", "3", "2", "1"].map(v => ({
                                    value: v,
                                    label: `${v} ★`
                                }))
                            ]}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <Select
                            label="Periodo"
                            value={filterPeriod}
                            onChange={e => {
                                const val = e.target.value as "all" | "7d" | "30d" | "custom";
                                setFilterPeriod(val);
                                if (val !== "custom") setFilterDate(null);
                            }}
                        >
                            <option value="all">Tutto</option>
                            <option value="7d">Ultimi 7 giorni</option>
                            <option value="30d">Ultimi 30 giorni</option>
                            <option value="custom">Data specifica</option>
                        </Select>
                    </div>

                    {filterPeriod === "custom" && (
                        <div className={styles.filterGroup}>
                            <DateInput
                                label="Data:"
                                onChange={e =>
                                    setFilterDate(
                                        e.target.value
                                            ? new Date(e.target.value).toLocaleDateString("it-IT")
                                            : null
                                    )
                                }
                            />
                        </div>
                    )}

                    <div className={styles.filterGroup}>
                        <Select
                            label="Tag"
                            value={filterTag}
                            onChange={e => setFilterTag(e.target.value)}
                            options={[
                                { value: "", label: "Tutti" },
                                ...TAG_OPTIONS.map(t => ({
                                    value: t,
                                    label: t
                                }))
                            ]}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <Select
                            label="Ordina"
                            value={sortBy}
                            onChange={e =>
                                setSortBy(
                                    e.target.value as "newest" | "oldest" | "highest" | "lowest"
                                )
                            }
                        >
                            <option value="newest">Più recenti</option>
                            <option value="oldest">Più vecchie</option>
                            <option value="highest">Voto più alto</option>
                            <option value="lowest">Voto più basso</option>
                        </Select>
                    </div>
                </div>
            </section>

            {/* LISTA RECENSIONI / SKELETON */}
            {loading ? (
                <section className={styles.list} aria-label="Lista recensioni in caricamento">
                    <div className={styles.skeletonWrapper}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className={styles.reviewSkeleton}>
                                <div className="skeleton sm" style={{ width: "30%" }} />
                                <div className="skeleton" />
                                <div className="skeleton" style={{ width: "80%" }} />
                            </div>
                        ))}
                    </div>
                </section>
            ) : (
                <section className={styles.list} aria-label="Lista recensioni">
                    {filteredAndSortedReviews.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Text variant="title-sm">Nessuna recensione trovata</Text>
                            <Text variant="body" colorVariant="muted">
                                Prova a cambiare i filtri o la ricerca.
                            </Text>
                        </div>
                    ) : (
                        filteredAndSortedReviews.map((review, i) => (
                            <ReviewCard key={review.id} review={review} index={i} />
                        ))
                    )}
                </section>
            )}

            {/* MODALE ELIMINAZIONE */}
            {showModal && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                    <div className={styles.modal}>
                        <Text variant="body">Sei sicuro di voler eliminare questa recensione?</Text>

                        <div className={styles.modalActions}>
                            <button onClick={handleDelete} className={styles.confirm}>
                                Elimina
                            </button>
                            <button onClick={() => setShowModal(false)} className={styles.cancel}>
                                Annulla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
