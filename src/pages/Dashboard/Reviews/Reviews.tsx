import { useEffect, useId, useState, useMemo, useCallback, type ReactNode } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { listReviews, deleteReview, updateReviewStatus } from "@/services/supabase/reviews";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import type { Review } from "@/types/database";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { ArrowUpDown, CalendarRange, MessageSquare, Star } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Select } from "@/components/ui/Select/Select";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DateInput } from "@/components/ui/Input/DateInput";
import { Button } from "@/components/ui/Button/Button";
import { BarList } from "@/components/ui/BarList/BarList";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Rating } from "@/components/ui/Rating/Rating";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { formatRelativeTime } from "@/utils/relativeTime";
import {
    ACTION_STATUS,
    QUEUE_EXPLANATION,
    REVIEW_STATUS_META,
    STATUS_CHANGE_TOAST,
    queueTitle,
    rowActions,
    splitByStatus,
    waitingDays,
    type ListFilter,
    type ModerationAction
} from "./reviewModeration";

import styles from "./Reviews.module.scss";

/* ── Types ───────────────────────────────────────────── */

type PeriodFilter = "all" | "7d" | "30d" | "90d" | "custom";
type SortOption = "newest" | "oldest" | "ratingAsc" | "ratingDesc";

// Filtro stelle via SegmentedControl: stella accanto al numero, "Tutte"
// senza icona. `value` come stringa per coerenza con lo stato `filterRating`.
const STAR_ICON = <Star size={12} fill="currentColor" />;
const RATING_OPTIONS: { value: string; label: string; icon?: ReactNode }[] = [
    { value: "all", label: "Tutte" },
    { value: "5", label: "5", icon: STAR_ICON },
    { value: "4", label: "4", icon: STAR_ICON },
    { value: "3", label: "3", icon: STAR_ICON },
    { value: "2", label: "2", icon: STAR_ICON },
    { value: "1", label: "1", icon: STAR_ICON },
];

const PERIOD_OPTIONS = [
    { value: "all", label: "Tutto il periodo" },
    { value: "7d", label: "Ultimi 7 giorni" },
    { value: "30d", label: "Ultimi 30 giorni" },
    { value: "90d", label: "Ultimi 90 giorni" },
    { value: "custom", label: "Periodo personalizzato" },
];

// Parole, non frecce: «Voto ↑» non diceva se in cima va il più alto (mockup).
const SORT_OPTIONS = [
    { value: "newest", label: "Più recenti" },
    { value: "oldest", label: "Meno recenti" },
    { value: "ratingDesc", label: "Voto più alto" },
    { value: "ratingAsc", label: "Voto più basso" },
];

/* ── Component ───────────────────────────────────────── */

export default function Reviews() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const refreshReviewsPending = useBusinessOutletContext()?.refreshReviewsPending;

    /* ── Sede scope condivisa via navbar ────────────── */
    const { value: scopeValue, readableActivities } = useSedeScope();
    // SCOPE_ALL → stringa vuota = "tutte"
    const selectedActivity = scopeValue === SCOPE_ALL ? "" : scopeValue;

    const { permissions } = usePermissions();
    // Gate di lettura prima di ogni fetch (#646): lo stesso che rende `PageGate`.
    const canRead =
        permissions != null &&
        (selectedActivity
            ? canDoOnActivity(permissions, "reviews.read", selectedActivity)
            : canDoOnAnyActivity(permissions, "reviews.read"));
    const canDelete = (review: Review) =>
        permissions ? canDoOnActivity(permissions, "reviews.delete", review.activity_id) : false;
    // Pubblica · Tieni nascosta · Nascondi: reversibili, per sede (§34.9/2).
    const canModerate = (review: Review) =>
        permissions ? canDoOnActivity(permissions, "reviews.moderate", review.activity_id) : false;

    /* ── State ──────────────────────────────────────── */
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [filterRating, setFilterRating] = useState<string>("all");
    const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>("all");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [searchQuery, setSearchQuery] = useState("");
    const [listFilter, setListFilter] = useState<ListFilter>("all");

    // Le recensioni col cambio di stato in volo: i loro bottoni aspettano.
    const [updatingIds, setUpdatingIds] = useState<ReadonlySet<string>>(new Set());
    // L'ultimo cambio di stato fallito: in pagina, sopra la coda, finché il
    // gesto successivo non lo sostituisce (regola 10, niente toast d'errore).
    const [actionError, setActionError] = useState<string | null>(null);
    const queueTitleId = useId();

    // La recensione da eliminare: il DELETE è secco e l'ha scritta un
    // cliente, quindi passa da un ConfirmDialog (regola delle azioni
    // irreversibili), non da una conferma nella riga.
    const [pendingDelete, setPendingDelete] = useState<Review | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    /* ── Fetch reviews quando cambia tenant o scope ────── */
    useEffect(() => {
        if (!tenantId || !canRead) return;
        const tenant = tenantId;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setLoadError(false);
            try {
                const ids = selectedActivity ? [selectedActivity] : readableActivities.map(a => a.id);
                const data = await listReviews(tenant, ids);
                if (cancelled) return;
                setReviews(data);
            } catch (error) {
                if (cancelled) return;
                // Un errore non è «nessuna recensione»: la pagina lo dice, con «Riprova».
                console.error("Caricamento recensioni:", error);
                setLoadError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [tenantId, canRead, selectedActivity, readableActivities, reloadKey]);

    /* ── Activity name map ──────────────────────────── */
    const activityNameMap = useMemo(() => {
        const map = new Map<string, string>();
        readableActivities.forEach((a) => map.set(a.id, a.name));
        return map;
    }, [readableActivities]);

    /* ── Coda (in attesa) ed elenco (le altre) ─────── */
    // La coda non segue i filtri della testata: è quello che resta da fare.
    const { pending: pendingReviews, others: moderatedReviews } = useMemo(() => splitByStatus(reviews), [reviews]);

    /* ── Period filtering (base for stats) ──────────── */
    const periodFilteredReviews = useMemo(() => {
        const now = Date.now();

        if (filterPeriod === "7d") {
            const t = now - 7 * 86_400_000;
            return moderatedReviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "30d") {
            const t = now - 30 * 86_400_000;
            return moderatedReviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "90d") {
            const t = now - 90 * 86_400_000;
            return moderatedReviews.filter((r) => new Date(r.created_at).getTime() >= t);
        }
        if (filterPeriod === "custom") {
            return moderatedReviews.filter((r) => {
                const ts = new Date(r.created_at).getTime();
                if (customFrom && ts < new Date(customFrom).getTime()) return false;
                if (customTo && ts > new Date(customTo).getTime() + 86_400_000 - 1)
                    return false;
                return true;
            });
        }
        return moderatedReviews;
    }, [moderatedReviews, filterPeriod, customFrom, customTo]);

    // Il riepilogo conta solo le pubblicate (R2, mockup «Riepilogo dei voti pubblicati»).
    const publishedInPeriod = useMemo(
        () => periodFilteredReviews.filter(r => r.status === "approved"),
        [periodFilteredReviews]
    );

    /* ── Stats ──────────────────────────────────────── */
    const average = useMemo(() => {
        const total = publishedInPeriod.length;
        if (total === 0) return null;
        const sum = publishedInPeriod.reduce((s, r) => s + r.rating, 0);
        return Math.round((sum / total) * 10) / 10;
    }, [publishedInPeriod]);

    // Distribuzione 5→1 a una serie sola (§34.9/4, §34.10): la lunghezza fa
    // il lavoro, tinta unica, il livello di stelle è l'etichetta.
    const distributionItems = useMemo(() => {
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of publishedInPeriod) dist[r.rating] = (dist[r.rating] ?? 0) + 1;
        return ([5, 4, 3, 2, 1] as const).map(star => ({
            id: String(star),
            label: <Rating value={star} showValue={false} />,
            value: dist[star]
        }));
    }, [publishedInPeriod]);

    /* ── Filtro di stato dell'elenco, coi conteggi ─── */
    const hiddenCount = useMemo(() => periodFilteredReviews.filter(r => r.status === "hidden").length, [periodFilteredReviews]);
    const listFilterOptions = useMemo(
        () => [
            { value: "all" as const, label: "Tutte", count: periodFilteredReviews.length },
            { value: "approved" as const, label: "Pubblicate", count: publishedInPeriod.length, disabled: publishedInPeriod.length === 0 },
            { value: "hidden" as const, label: "Nascoste", count: hiddenCount, disabled: hiddenCount === 0 }
        ],
        [periodFilteredReviews.length, publishedInPeriod.length, hiddenCount]
    );

    /* ── Final filtered + sorted reviews ────────────── */
    const displayedReviews = useMemo(() => {
        let result = [...periodFilteredReviews];

        if (listFilter !== "all") {
            result = result.filter((r) => r.status === listFilter);
        }

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
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                case "oldest":
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                case "ratingDesc":
                    return b.rating - a.rating;
                case "ratingAsc":
                    return a.rating - b.rating;
                default:
                    return 0;
            }
        });

        return result;
    }, [periodFilteredReviews, listFilter, filterRating, searchQuery, sortBy]);

    const isFiltered =
        filterRating !== "all" || searchQuery.trim() !== "" || filterPeriod !== "all" || listFilter !== "all";
    const clearFilters = useCallback(() => {
        setListFilter("all");
        setFilterRating("all");
        setSearchQuery("");
        setFilterPeriod("all");
        setCustomFrom("");
        setCustomTo("");
    }, []);

    // ── Header band: leading (filtro stelle) + actions (search + periodo + sort) ──
    const leading = useMemo(() => (
        <SegmentedControl<string>
            value={filterRating}
            onChange={setFilterRating}
            options={RATING_OPTIONS}
        />
    ), [filterRating]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Cerca commenti..."
            />
            <Select
                aria-label="Filtra per periodo"
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
                containerClassName={styles.toolbarPeriod}
            />
            <Select
                aria-label="Ordina recensioni"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                options={SORT_OPTIONS}
                containerClassName={styles.toolbarSort}
            />
        </>
    ), [searchQuery, filterPeriod, sortBy]);

    // Selettore sede nella navbar (SedeScopeSelect), titolo nel breadcrumb.
    // In compatto la valutazione prende il posto del picker sezione (la pagina
    // non ha sezioni); periodo e ordinamento restano icone con overlay e chip,
    // diverse perché due bottoni identici non direbbero quale filtro aprono.
    // Qui le opzioni valutazione portano la stella nel testo: in una lista il
    // solo "5" non si capirebbe.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        leadingFilter: {
            label: "Valutazione",
            options: [
                { value: "all", label: "Tutte" },
                { value: "5", label: "5 stelle" },
                { value: "4", label: "4 stelle" },
                { value: "3", label: "3 stelle" },
                { value: "2", label: "2 stelle" },
                { value: "1", label: "1 stella" }
            ],
            value: filterRating,
            defaultValue: "all",
            onChange: setFilterRating
        },
        filterControls: [
            {
                label: "Periodo",
                icon: <CalendarRange size={18} />,
                options: PERIOD_OPTIONS,
                value: filterPeriod,
                defaultValue: "all",
                onChange: value => {
                    const next = value as PeriodFilter;
                    setFilterPeriod(next);
                    if (next !== "custom") {
                        setCustomFrom("");
                        setCustomTo("");
                    }
                }
            },
            {
                label: "Ordinamento",
                icon: <ArrowUpDown size={18} />,
                options: SORT_OPTIONS,
                value: sortBy,
                defaultValue: "newest",
                onChange: value => setSortBy(value as SortOption)
            }
        ],
        search: {
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: "Cerca commenti..."
        }
    }), [filterRating, filterPeriod, sortBy, searchQuery]);

    usePageHeader({
        subtitle: "Quello che i clienti scrivono dopo essere stati da voi.",
        leading,
        actions: headerActions,
        compact: headerCompact,
    });

    /* ── Handlers ───────────────────────────────────── */
    // Pubblica · Tieni nascosta · Nascondi: reversibili, niente conferma. Un
    // errore lo dice il banner in cima: la recensione resta dov'era.
    async function handleStatusChange(review: Review, action: Exclude<ModerationAction, "delete">) {
        if (!tenantId) return;
        const status = ACTION_STATUS[action];
        setUpdatingIds(prev => new Set(prev).add(review.id));
        setActionError(null);
        try {
            await updateReviewStatus(review.id, tenantId, status);
            setReviews(prev => prev.map(r => (r.id === review.id ? { ...r, status } : r)));
            showToast({ message: STATUS_CHANGE_TOAST[status].success, type: "success" });
            refreshReviewsPending?.();
        } catch (error) {
            console.error("Cambio di stato della recensione:", error);
            setActionError(STATUS_CHANGE_TOAST[status].error);
        } finally {
            setUpdatingIds(prev => {
                const next = new Set(prev);
                next.delete(review.id);
                return next;
            });
        }
    }

    const requestDelete = (review: Review) => {
        setDeleteError(null);
        setPendingDelete(review);
    };
    async function handleConfirmDelete(): Promise<boolean> {
        if (!tenantId || !pendingDelete) return false;
        const target = pendingDelete;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteReview(target.id, tenantId);
            setReviews((prev) => prev.filter((r) => r.id !== target.id));
            setPendingDelete(null);
            showToast({ message: "Recensione eliminata", type: "success" });
            return true;
        } catch (error) {
            console.error("Eliminazione recensione:", error);
            setDeleteError("Non è stato possibile eliminare la recensione. Riprova.");
            return false;
        } finally {
            setIsDeleting(false);
        }
    }

    /* ── Riga: commento e «quando · sede» ─────────────── */
    const reviewTitle = (review: Review) =>
        review.comment ? (
            // Il commento è il contenuto della riga: va a capo intero, non
            // si tronca come un nome.
            <span className={styles.comment}>{review.comment}</span>
        ) : (
            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.noComment}>
                Nessun commento
            </Text>
        );
    const reviewSubtitle = (review: Review) =>
        [formatRelativeTime(review.created_at), !selectedActivity ? activityNameMap.get(review.activity_id) : null]
            .filter(Boolean)
            .join(" · ");

    /* ── Render ──────────────────────────────────────── */
    return (
        <PageGate readPermission="reviews.read" activityId={selectedActivity || null}>
            {({ canEdit }) => (
                <div className={styles.page}>
                    {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}

                    {/* ── Coda di moderazione (§34.9/1): in cima, finché ce n'è ── */}
                    {!loading && !loadError && pendingReviews.length > 0 && (
                        <div role="region" aria-labelledby={queueTitleId}>
                            <Card
                                title={queueTitle(pendingReviews.length, waitingDays(pendingReviews[0].created_at, Date.now()))}
                                titleId={queueTitleId}
                                subtitle={QUEUE_EXPLANATION}
                                flush
                            >
                                {pendingReviews.map(review => {
                                    const actions = rowActions(review.status, {
                                        canModerate: canModerate(review),
                                        canDelete: canDelete(review)
                                    });
                                    const busy = updatingIds.has(review.id);
                                    return (
                                        <ListRow
                                            key={review.id}
                                            title={reviewTitle(review)}
                                            wrapSubtitle
                                            subtitle={reviewSubtitle(review)}
                                            // Niente metaInline: sul telefono il voto scende
                                            // sotto il commento, che resta a tutta larghezza
                                            // (con un commento lungo, accanto al voto andava a
                                            // capo in una colonna di 187 px su 341).
                                            meta={<Rating value={review.rating} />}
                                            trailingWrap
                                            trailing={
                                                actions.length > 0 ? (
                                                    <div className={styles.queueActions}>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={!canEdit || busy}
                                                            title={!canEdit ? "L'abbonamento non è attivo." : undefined}
                                                            onClick={() => void handleStatusChange(review, "hide")}
                                                        >
                                                            Tieni nascosta
                                                        </Button>
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            disabled={!canEdit || busy}
                                                            title={!canEdit ? "L'abbonamento non è attivo." : undefined}
                                                            onClick={() => void handleStatusChange(review, "publish")}
                                                        >
                                                            Pubblica
                                                        </Button>
                                                    </div>
                                                ) : undefined
                                            }
                                        />
                                    );
                                })}
                            </Card>
                        </div>
                    )}

                    {/* ── Riepilogo: numero eroe + distribuzione, sulle pubblicate ─── */}
                    <Card title="Riepilogo dei voti pubblicati">
                        <div className={styles.summary}>
                            {loading ? (
                                <BarList className={styles.summaryFull} items={[]} loading />
                            ) : (
                                <>
                                    <div className={styles.average}>
                                        {average !== null ? (
                                            <Rating
                                                value={average}
                                                size="hero"
                                                countLabel={`${publishedInPeriod.length} ${publishedInPeriod.length === 1 ? "recensione pubblicata" : "recensioni pubblicate"}`}
                                            />
                                        ) : (
                                            <Text variant="body-sm" colorVariant="muted">
                                                Nessun voto pubblicato nel periodo.
                                            </Text>
                                        )}
                                    </div>
                                    <BarList
                                        className={styles.distribution}
                                        labelColumn="fit"
                                        aria-label="Distribuzione dei voti"
                                        items={distributionItems}
                                    />
                                </>
                            )}
                        </div>
                    </Card>

                    {/* ── Periodo personalizzato ──────────────── */}
                    {filterPeriod === "custom" && (
                        <div className={styles.dateRange}>
                            <DateInput
                                label="Da"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                            />
                            <DateInput
                                label="A"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
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

                    {/* ── Elenco ──────────────────────────────── */}
                    {loading ? (
                        <Card flush>
                            <div aria-busy="true" aria-label="Caricamento recensioni">
                                <ListRow loading />
                                <ListRow loading />
                                <ListRow loading />
                            </div>
                        </Card>
                    ) : loadError ? (
                        <EmptyState
                            variant="page"
                            icon={<MessageSquare />}
                            title="Non è stato possibile caricare le recensioni"
                            description="Controlla la connessione e riprova."
                            action={
                                <Button variant="secondary" onClick={() => setReloadKey(k => k + 1)}>
                                    Riprova
                                </Button>
                            }
                        />
                    ) : moderatedReviews.length === 0 && pendingReviews.length > 0 ? null /* tutto nella coda */ : (
                        <>
                        {periodFilteredReviews.length > 0 && (
                            <ChipGroupSingle<ListFilter>
                                ariaLabel="Stato delle recensioni"
                                layout="auto"
                                shape="pill"
                                value={listFilter}
                                onChange={setListFilter}
                                options={listFilterOptions}
                            />
                        )}
                        {displayedReviews.length === 0 ? (
                            isFiltered && moderatedReviews.length > 0 ? (
                                <EmptyState variant="filtered" title="Nessuna recensione trovata" onClearFilters={clearFilters} />
                            ) : (
                                <EmptyState
                                    variant="inline"
                                    icon={<MessageSquare />}
                                    title="Nessuna recensione"
                                    description="Le recensioni arrivano dal modulo sulla pagina pubblica delle sedi."
                                />
                            )
                        ) : (
                            <Card flush>
                                {displayedReviews.map((review) => {
                                    const actions = rowActions(review.status, {
                                        canModerate: canModerate(review),
                                        canDelete: canDelete(review)
                                    });
                                    const busy = updatingIds.has(review.id);
                                    const menu: TableRowAction[] = actions.map(action =>
                                        action === "delete"
                                            ? {
                                                  label: "Elimina",
                                                  variant: "destructive",
                                                  separator: true,
                                                  disabled: !canEdit,
                                                  description: !canEdit ? "L'abbonamento non è attivo." : undefined,
                                                  onClick: () => requestDelete(review)
                                              }
                                            : {
                                                  label: action === "publish" ? "Pubblica" : "Nascondi",
                                                  disabled: !canEdit || busy,
                                                  description: !canEdit ? "L'abbonamento non è attivo." : undefined,
                                                  onClick: () => void handleStatusChange(review, action)
                                              }
                                    );
                                    const meta = REVIEW_STATUS_META[review.status];
                                    return (
                                        <ListRow
                                            key={review.id}
                                            title={reviewTitle(review)}
                                            wrapSubtitle
                                            subtitle={reviewSubtitle(review)}
                                            // Voto e stato nel meta: sul telefono scendono sotto il
                                            // commento, che resta largo quanto la riga.
                                            meta={
                                                <>
                                                    <Rating value={review.rating} />
                                                    <StatusBadge variant={meta.variant} label={meta.label} />
                                                </>
                                            }
                                            trailing={
                                                menu.length > 0 ? (
                                                    <TableRowActions ariaLabel="Azioni recensione" actions={menu} />
                                                ) : undefined
                                            }
                                        />
                                    );
                                })}
                            </Card>
                        )}
                        </>
                    )}

                    {/* ── Piede ────────────────────────────────── */}
                    {!loading && !loadError && displayedReviews.length > 0 && (
                        <Text variant="caption" colorVariant="muted" align="center">
                            {displayedReviews.length} di {periodFilteredReviews.length}{" "}
                            recensioni
                        </Text>
                    )}

                    <ConfirmDialog
                        isOpen={pendingDelete !== null}
                        onClose={() => {
                            setPendingDelete(null);
                            setDeleteError(null);
                        }}
                        onConfirm={handleConfirmDelete}
                        title="Eliminare la recensione?"
                        message="L'ha scritta un cliente: eliminata non torna, e non si recupera."
                        confirmLabel="Elimina"
                        confirmVariant="danger"
                        isLoading={isDeleting}
                        error={deleteError}
                    />
                </div>
            )}
        </PageGate>
    );
}
