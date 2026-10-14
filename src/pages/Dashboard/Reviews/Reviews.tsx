import { useParams } from "react-router-dom";
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { LOOK_D } from "@styles/lookD";
import { FilterFit } from "@/components/ui/FilterFit/FilterFit";
import { useTenantId } from "@/context/useTenantId";
import { listReviews } from "@/services/supabase/reviews";
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
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Rating } from "@/components/ui/Rating/Rating";
import { formatRelativeTime } from "@/utils/relativeTime";
import { PERIOD_OPTIONS, usePeriodParam } from "@/hooks/usePeriodParam";
import { periodToDateRange } from "@/pages/Dashboard/Analytics/utils/periodComparison";
import { VoteLine } from "./VoteLine";
import { VoteLineD } from "./VoteLineD";
import { weeklyAverages } from "./voteTrend";
import { useSediVista, useConfrontoQui } from "@/hooks/useSediVista";

import styles from "./Reviews.module.scss";

/* ── Types ───────────────────────────────────────────── */

type SortOption = "newest" | "oldest" | "ratingAsc" | "ratingDesc";
/** I filtri dell'elenco (D154): le basse sono quelle che restano a voi. */
type ListFilter = "all" | "low" | "text";

// Parole, non frecce: «Voto ↑» non diceva se in cima va il più alto (mockup).
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Dalle più recenti" },
  { value: "oldest", label: "Dalle meno recenti" },
  { value: "ratingDesc", label: "Dal voto più alto" },
  { value: "ratingAsc", label: "Dal voto più basso" },
];

/** Basse: 1-3 stelle. Non vanno mai su Google, il modulo le tiene per voi. */
const isLow = (r: Review) => r.rating <= 3;

/* ── Component ───────────────────────────────────────── */

/** L'elenco sta in una card; nella D ogni recensione è una card sua. */
export function ListShell({ children }: { children: ReactNode }) {
  return LOOK_D ? <>{children}</> : <Card flush>{children}</Card>;
}

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
  /* ── Confronto con altre sedi (D159) ─────────────── */
  // Dentro una sede, con «Confronta con» in alto: il voto di ogni sede in
  // una riga sua, sotto quello della sede. L'elenco resta della sede.
  useConfrontoQui();
  const vista = useSediVista(tenantId);
  const compareIds = useMemo(
    () =>
      // la sede è quella dell'indirizzo: lo store può non averla o averne un'altra
      vista.confrontoQui && selectedActivity
        ? readableActivities
            .filter(
              // solo le sedi di cui si possono leggere le recensioni: le altre darebbero zeri finti
              (a) =>
                a.id !== selectedActivity &&
                vista.confronta.has(a.id) &&
                permissions != null &&
                canDoOnActivity(permissions, "reviews.read", a.id),
            )
            .map((a) => a.id)
        : [],
    [
      vista.confrontoQui,
      vista.confronta,
      selectedActivity,
      readableActivities,
      permissions,
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

  /* ── Riga compatta (D, artifact v28 `.cz`) ──────────── */
  // Scorrendo oltre il segnaposto in cima la testata si stringe in una riga
  // attaccata in alto; torna intera solo di nuovo in cima. Il passaggio usa
  // le view transition, se ci sono e se il movimento non è ridotto.
  const [compact, setCompact] = useState(false);
  const [top, setTop] = useState<HTMLDivElement | null>(null);
  const compactRef = useRef(false);
  useEffect(() => {
        if (!LOOK_D || !top) return;
    const swap = (next: boolean) => {
      if (compactRef.current === next) return;
      compactRef.current = next;
      const apply = () => flushSync(() => setCompact(next));
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!still && typeof document.startViewTransition === "function")
        document.startViewTransition(apply);
      else apply();
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) swap(true);
        else if (e.intersectionRatio >= 0.99) swap(false);
      },
      { threshold: [0, 1] },
    );
    io.observe(top);
    return () => io.disconnect();
  }, [top]);
  const backToTop = () =>
    top?.scrollIntoView({ block: "start", behavior: "smooth" });

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

  // Il voto delle ultime sette settimane, sulla sede (o le sedi) di questa vista.
  const trend = useMemo(
    () =>
      LOOK_D
        ? weeklyAverages(
            selectedActivity
              ? reviews.filter((r) => r.activity_id === selectedActivity)
              : reviews,
          )
        : [],
    [reviews, selectedActivity],
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
      {() => (
        <div className={styles.page}>
          {/* In cima: quando esce dalla vista, la testata si compatta (D). */}
          {LOOK_D && <div ref={setTop} className={styles.top} aria-hidden />}
          <div
            className={styles.head}
            data-compact={compact ? "" : undefined}
          >
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
                variant={LOOK_D ? "secondary" : "ghost"}
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
              LOOK_D ? (
                <VoteLineD
                  average={average}
                  total={counts.all}
                  invited={counts.invited}
                  distribution={distribution}
                  stars={filterStars}
                  onStars={setFilterStars}
                  trend={trend}
                  compact={compact}
                  onExpand={backToTop}
                />
              ) : (
              <VoteLine
                average={average}
                total={counts.all}
                invited={counts.invited}
                distribution={distribution}
                stars={filterStars}
                onStars={setFilterStars}
              />
              )
            ) : (
              <div
                className={styles.votes}
                aria-label="Il voto delle sedi a confronto"
                role="group"
              >
                {LOOK_D ? (
                  <VoteLineD
                    name={activityNameMap.get(selectedActivity) ?? "Questa sede"}
                    average={average}
                    total={counts.all}
                    invited={counts.invited}
                    distribution={distribution}
                    stars={filterStars}
                    onStars={setFilterStars}
                    compact={compact}
                    onExpand={backToTop}
                  />
                ) : (
                <VoteLine
                  name={activityNameMap.get(selectedActivity) ?? "Questa sede"}
                  average={average}
                  total={counts.all}
                  invited={counts.invited}
                  distribution={distribution}
                  stars={filterStars}
                  onStars={setFilterStars}
                />
                )}
                {compareLines.map((line) =>
                  LOOK_D ? (
                    <VoteLineD
                      key={line.id}
                      name={line.name}
                      average={line.average}
                      total={line.total}
                      invited={line.invited}
                      distribution={line.distribution}
                      compact={compact}
                      onExpand={backToTop}
                    />
                  ) : (
                  <VoteLine
                    key={line.id}
                    name={line.name}
                    average={line.average}
                    total={line.total}
                    invited={line.invited}
                    distribution={line.distribution}
                  />
                  ),
                )}
              </div>
            ))
          )}

          {/* ── Le basse da leggere (D, artifact `#lowband`) ── */}
          {LOOK_D &&
            !loading &&
            !loadError &&
            counts.low > 0 &&
            listFilter !== "low" && (
              <div className={styles.band}>
                <b>
                  {counts.low === 1
                    ? "1 recensione bassa da leggere."
                    : `${counts.low} recensioni basse da leggere.`}
                </b>
                <span>Restano a voi: non vanno su Google.</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.bandBtn}
                  onClick={() => {
                    setListFilter("low");
                    setFilterStars(null);
                  }}
                >
                  Vedi quali
                </Button>
              </div>
            )}

          {/* ── Filtri e ordine ─────────────────────── */}
          {!loading && !loadError && counts.all > 0 && LOOK_D && (
            // Filtri e ordine della D: sotto un pulsante quando non ci stanno.
            <div className={styles.filters}>
              <FilterFit
                active={(listFilter !== "all" ? 1 : 0) + (filterStars !== null ? 1 : 0)}
                onClear={() => {
                  setListFilter("all");
                  setFilterStars(null);
                }}
                short={compact}
                sort={{
                  label: "Ordina",
                  value: sortBy,
                  options: SORT_OPTIONS,
                  onChange: setSortBy,
                }}
              >
                <ChipGroupSingle
                    ariaLabel="Quali recensioni"
                    layout="auto"
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
              </FilterFit>
            </div>
          )}
          {!loading && !loadError && counts.all > 0 && !LOOK_D && (
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
          </div>

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
            <ListShell>
              <ul
                className={LOOK_D ? styles.revs : styles.list}
                aria-label="Recensioni"
              >
                {displayedReviews.map((review, i) => (
                  <li
                    key={review.id}
                    className={LOOK_D ? styles.rev : styles.row}
                    data-low={LOOK_D && isLow(review) ? "" : undefined}
                    style={
                      LOOK_D
                        ? ({ "--i": Math.min(i, 10) } as CSSProperties)
                        : undefined
                    }
                  >
                    <div className={styles.rowTop}>
                      {LOOK_D ? (
                        <span
                          className={styles.stars}
                          role="img"
                          aria-label={`${review.rating} stelle su 5`}
                        >
                          <b>{"★".repeat(review.rating)}</b>
                          {"★".repeat(Math.max(0, 5 - review.rating))}
                        </span>
                      ) : (
                        <Rating value={review.rating} showValue={false} />
                      )}
                      <span
                        className={LOOK_D ? styles.meta : undefined}
                        title={
                          LOOK_D
                            ? `${formatRelativeTime(review.created_at)}, ore ${new Date(review.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                            : undefined
                        }
                      >
                        {reviewMeta(review)}
                      </span>
                      {LOOK_D ? (
                        // Etichette piatte della v28 (`.tag.w`, `.tag.g`), senza pallino.
                        isLow(review) ? (
                          <span className={`${styles.tag} ${styles.tagW}`}>Solo a voi</span>
                        ) : isInvited(review) ? (
                          <span className={`${styles.tag} ${styles.tagG}`}>Invitata su Google</span>
                        ) : null
                      ) : isLow(review) ? (
                        <StatusBadge variant="warning" label="Solo a voi" />
                      ) : isInvited(review) ? (
                        <StatusBadge
                          variant="success"
                          label="Invitata su Google"
                        />
                      ) : null}
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
            </ListShell>
          )}

        </div>
      )}
    </PageGate>
  );
}
