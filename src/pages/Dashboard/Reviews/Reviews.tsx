import { useParams } from "react-router-dom";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { listReviews, deleteReview } from "@/services/supabase/reviews";
import { useSedeScope } from "@/hooks/useSedeScope";
import type { Review } from "@/types/database";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { Search, Star } from "lucide-react";

import { Select } from "@/components/ui/Select/Select";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Chip } from "@/components/ui/Chip/Chip";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Rating } from "@/components/ui/Rating/Rating";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { formatRelativeTime } from "@/utils/relativeTime";
import { PERIOD_OPTIONS, usePeriodParam } from "@/hooks/usePeriodParam";
import { periodToDateRange } from "@/pages/Dashboard/Analytics/utils/periodComparison";
import { VoteLine } from "./VoteLine";
import { useSediVista, useConfrontoQui } from "@/hooks/useSediVista";

import styles from "./Reviews.module.scss";

/* ── Types ───────────────────────────────────────────── */

type SortOption = "newest" | "oldest" | "ratingAsc" | "ratingDesc";
/** I filtri dell'elenco (D154): le basse sono quelle che restano a voi. */
type ListFilter = "all" | "low" | "text";

// Parole, non frecce: «Voto ↑» non diceva se in cima va il più alto (mockup).
const SORT_OPTIONS = [
  { value: "newest", label: "Dalle più recenti" },
  { value: "oldest", label: "Dalle meno recenti" },
  { value: "ratingDesc", label: "Dal voto più alto" },
  { value: "ratingAsc", label: "Dal voto più basso" },
];

/** Basse: 1-3 stelle. Non vanno mai su Google, il modulo le tiene per voi. */
const isLow = (r: Review) => r.rating <= 3;

/* ── Component ───────────────────────────────────────── */

/** La media (a un decimale) e il conteggio per stelle di un gruppo di voti. */
function voteStats(list: readonly Review[]): {
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
} {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const r of list) {
    if (r.rating >= 1 && r.rating <= 5)
      distribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }
  const average =
    list.length === 0
      ? null
      : Math.round(
          (list.reduce((s, r) => s + r.rating, 0) / list.length) * 10,
        ) / 10;
  return { average, distribution };
}

export default function Reviews() {
  const tenantId = useTenantId();
  const { showToast } = useToast();

  /* ── Due livelli (§51.10) ───────────────────────── */
  // Dentro la sede (`/locations/:activityId/recensioni`) la sede è nel path;
  // fuori, stringa vuota = tutte le sedi leggibili, con la sede su ogni riga.
  const { activityId: routeActivityId } = useParams<{ activityId?: string }>();
  const { readableActivities } = useSedeScope();
  const selectedActivity = routeActivityId ?? "";

  const { permissions } = usePermissions();
  // Gate di lettura prima di ogni fetch (#646): lo stesso che rende `PageGate`.
  const canRead =
    permissions != null &&
    (selectedActivity
      ? canDoOnActivity(permissions, "reviews.read", selectedActivity)
      : canDoOnAnyActivity(permissions, "reviews.read"));
  // Eliminare resta di owner e admin (`reviews.delete`, per sede).
  const canDelete = (review: Review) =>
    permissions
      ? canDoOnActivity(permissions, "reviews.delete", review.activity_id)
      : false;

  /* ── Confronto con altre sedi (D159) ─────────────── */
  // Dentro una sede, con «Confronta con» in alto: il voto di ogni sede in
  // una riga sua, sotto quello della sede. L'elenco resta della sede.
  useConfrontoQui();
  const vista = useSediVista(tenantId);
  const compareIds = useMemo(
    () =>
      vista.confrontoAttivo && selectedActivity
        ? readableActivities
            .filter(
              (a) => a.id !== selectedActivity && vista.confronta.has(a.id),
            )
            .map((a) => a.id)
        : [],
    [
      vista.confrontoAttivo,
      vista.confronta,
      selectedActivity,
      readableActivities,
    ],
  );
  const compareKey = compareIds.join(",");

  /* ── State ──────────────────────────────────────── */
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [period, setPeriod] = usePeriodParam();
  const [filterStars, setFilterStars] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

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
        const ids = selectedActivity
          ? [selectedActivity, ...(compareKey ? compareKey.split(",") : [])]
          : readableActivities.map((a) => a.id);
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
  }, [
    tenantId,
    canRead,
    selectedActivity,
    readableActivities,
    reloadKey,
    compareKey,
  ]);

  /* ── Activity name map ──────────────────────────── */
  const activityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    readableActivities.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [readableActivities]);
  // Il modulo pubblico invita su Google chi dà 4-5 stelle solo se la sede ha
  // il link: senza, anche quelle restano a voi.
  const googleSedi = useMemo(
    () =>
      new Set(
        readableActivities.filter((a) => a.google_review_url).map((a) => a.id),
      ),
    [readableActivities],
  );
  const isInvited = useCallback(
    (r: Review) => r.rating >= 4 && googleSedi.has(r.activity_id),
    [googleSedi],
  );

  /* ── Period filtering (base for stats) ──────────── */
  // Feedback privato (R1): nessuna coda né stato, conta ogni recensione.
  // Col confronto ci sono anche le altre sedi: l'elenco tiene solo questa.
  const periodAllReviews = useMemo(() => {
    if (period === "all") return reviews;
    const from = periodToDateRange(period).from.getTime();
    return reviews.filter((r) => new Date(r.created_at).getTime() >= from);
  }, [reviews, period]);
  const periodFilteredReviews = useMemo(
    () =>
      selectedActivity
        ? periodAllReviews.filter((r) => r.activity_id === selectedActivity)
        : periodAllReviews,
    [periodAllReviews, selectedActivity],
  );

  /* ── Stats: su tutti i voti del periodo ─────────── */
  const { average, distribution } = useMemo(
    () => voteStats(periodFilteredReviews),
    [periodFilteredReviews],
  );
  const compareLines = useMemo(
    () =>
      compareIds.map((id) => {
        const own = periodAllReviews.filter((r) => r.activity_id === id);
        return {
          id,
          name: activityNameMap.get(id) ?? "Sede",
          total: own.length,
          invited: own.filter(isInvited).length,
          ...voteStats(own),
        };
      }),
    [compareIds, periodAllReviews, activityNameMap, isInvited],
  );

  const counts = useMemo(
    () => ({
      all: periodFilteredReviews.length,
      low: periodFilteredReviews.filter(isLow).length,
      text: periodFilteredReviews.filter((r) => Boolean(r.comment?.trim()))
        .length,
      invited: periodFilteredReviews.filter(isInvited).length,
    }),
    [periodFilteredReviews, isInvited],
  );

  /* ── Final filtered + sorted reviews ────────────── */
  const displayedReviews = useMemo(() => {
    let result = [...periodFilteredReviews];

    if (filterStars !== null)
      result = result.filter((r) => r.rating === filterStars);
    if (listFilter === "low") result = result.filter(isLow);
    if (listFilter === "text")
      result = result.filter((r) => Boolean(r.comment?.trim()));

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
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
  }, [periodFilteredReviews, filterStars, listFilter, searchQuery, sortBy]);

  const isFiltered =
    filterStars !== null || listFilter !== "all" || searchQuery.trim() !== "";
  const clearFilters = useCallback(() => {
    setFilterStars(null);
    setListFilter("all");
    setSearchQuery("");
  }, []);

  // «oggi», «negli ultimi 7 giorni»: per il vuoto del periodo.
  const periodLabel =
    period === "today"
      ? "oggi"
      : `negli ultimi ${PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? ""}`;

  /* ── Handlers ───────────────────────────────────── */
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

  /* ── Riga: «quando · sede» sopra il commento ──────── */
  const reviewMeta = (review: Review) =>
    [
      formatRelativeTime(review.created_at),
      !selectedActivity ? activityNameMap.get(review.activity_id) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const listOptions = [
    { value: "all" as const, label: "Tutte", count: counts.all },
    {
      value: "low" as const,
      label: "Da leggere: le basse",
      count: counts.low,
      tone: "warning" as const,
    },
    { value: "text" as const, label: "Con un commento", count: counts.text },
  ];

  /* ── Render ──────────────────────────────────────── */
  return (
    <PageGate
      readPermission="reviews.read"
      activityId={selectedActivity || null}
    >
      {({ canEdit }) => (
        <div className={styles.page}>
          {/* ── Periodo a sinistra, Cerca a destra (D154) ─── */}
          <div className={styles.bar}>
            <SegmentedControl
              size="sm"
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
            />
            {searchOpen || searchQuery ? (
              // Si richiude da sola uscendo, se è rimasta vuota.
              <div
                className={styles.search}
                onBlur={() => setSearchOpen(false)}
              >
                <ToolbarSearch
                  ref={searchRef}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Cerca nei commenti"
                  width="min"
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className={styles.searchButton}
                leftIcon={<Search size={15} aria-hidden />}
                onClick={() => setSearchOpen(true)}
              >
                Cerca
              </Button>
            )}
          </div>

          {/* ── Il voto in una riga ─────────────────── */}
          {loading ? (
            <div
              className={styles.voteLoading}
              aria-busy="true"
              aria-label="Caricamento del voto"
            />
          ) : (
            !loadError &&
            (compareLines.length === 0 ? (
              <VoteLine
                average={average}
                total={counts.all}
                invited={counts.invited}
                distribution={distribution}
                stars={filterStars}
                onStars={setFilterStars}
              />
            ) : (
              <div
                className={styles.votes}
                aria-label="Il voto delle sedi a confronto"
                role="group"
              >
                <VoteLine
                  name={activityNameMap.get(selectedActivity) ?? "Questa sede"}
                  average={average}
                  total={counts.all}
                  invited={counts.invited}
                  distribution={distribution}
                  stars={filterStars}
                  onStars={setFilterStars}
                />
                {compareLines.map((line) => (
                  <VoteLine
                    key={line.id}
                    name={line.name}
                    average={line.average}
                    total={line.total}
                    invited={line.invited}
                    distribution={line.distribution}
                  />
                ))}
              </div>
            ))
          )}

          {/* ── Filtri e ordine ─────────────────────── */}
          {!loading && !loadError && counts.all > 0 && (
            <div className={styles.filters}>
              <ChipGroupSingle
                ariaLabel="Quali recensioni"
                value={listFilter}
                onChange={setListFilter}
                options={listOptions}
              />
              {filterStars !== null && (
                <Chip
                  label={`${filterStars} ★`}
                  selected
                  onRemove={() => setFilterStars(null)}
                  removeLabel="Togli il filtro delle stelle"
                />
              )}
              <Select
                aria-label="Ordine"
                containerClassName={styles.sort}
                selectClassName={styles.sortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                options={SORT_OPTIONS}
              />
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
              icon={<Star />}
              title="Non è stato possibile caricare le recensioni"
              description="Controlla la connessione e riprova."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Riprova
                </Button>
              }
            />
          ) : displayedReviews.length === 0 ? (
            isFiltered && counts.all > 0 ? (
              <EmptyState
                variant="filtered"
                title="Nessuna recensione con questi filtri"
                onClearFilters={clearFilters}
              />
            ) : reviews.length > 0 && period !== "all" ? (
              // Il periodo è vuoto ma ce ne sono di prima: lo si dice.
              <EmptyState
                variant="inline"
                icon={<Star />}
                title={`Nessuna recensione ${periodLabel}`}
                description={`Ce ne sono ${reviews.length} in tutto.`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPeriod("all")}
                  >
                    Vedi da sempre
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="inline"
                icon={<Star />}
                title="Nessuna recensione"
                description="Le recensioni arrivano dal modulo sulla pagina pubblica delle sedi."
              />
            )
          ) : (
            // Stelle, quando e dove sono andate sopra; il commento sotto,
            // largo come un testo da leggere.
            <Card flush>
              <ul className={styles.list} aria-label="Recensioni">
                {displayedReviews.map((review) => (
                  <li key={review.id} className={styles.row}>
                    <div className={styles.rowTop}>
                      <Rating value={review.rating} showValue={false} />
                      <span>{reviewMeta(review)}</span>
                      {isLow(review) ? (
                        <StatusBadge variant="warning" label="Solo a voi" />
                      ) : isInvited(review) ? (
                        <StatusBadge
                          variant="success"
                          label="Invitata su Google"
                        />
                      ) : null}
                      {canDelete(review) && (
                        <div className={styles.rowActions}>
                          <TableRowActions
                            ariaLabel="Azioni recensione"
                            actions={[
                              rowAction.remove(() => requestDelete(review), {
                                disabled: !canEdit,
                                description: !canEdit
                                  ? "L'abbonamento non è attivo."
                                  : undefined,
                              }),
                            ]}
                          />
                        </div>
                      )}
                    </div>
                    {review.comment?.trim() ? (
                      <p className={styles.comment}>{review.comment}</p>
                    ) : (
                      <p className={styles.noComment}>
                        Nessun commento, solo le stelle.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
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
