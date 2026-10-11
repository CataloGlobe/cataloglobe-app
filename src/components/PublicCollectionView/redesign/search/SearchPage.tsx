import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Clock, SlidersHorizontal } from "lucide-react";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import { formatDecimal } from "@/utils/formatCurrency";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { SheetsSlotContext } from "../slots";
import CategoryList from "../categories/CategoryList";
import { closeSheet } from "../sheets/sheetStack";
import { pushVenueSheet } from "../sheets/venueSheetPages";
import { countHits, highlightParts, normalizeForSearch, searchSections } from "./searchMatch";
import { readRecentSearches, saveRecentSearch } from "./recentSearches";
import { useKeyboardInset } from "./useKeyboardInset";
import styles from "./Search.module.scss";

/** Come la ricerca di oggi: si conta una ricerca ferma da 900 ms, di almeno 2 lettere, una volta. */
const TRACK_DEBOUNCE_MS = 900;
const TRACK_MIN_QUERY_LEN = 2;

type Props = {
    query: string;
    onQueryChange: (query: string) => void;
    search: SheetsSlotContext["search"];
    categories: SheetsSlotContext["categories"];
};

/**
 * Corpo della pagina «Cerca» (spec §4). A campo vuoto: recenti, la riga
 * «Filtri», poi «Categorie» con l'elenco intero. Con una ricerca: risultati per
 * sezione con miniatura e testo trovato evidenziato; il tocco chiude e porta al piatto.
 */
export default function SearchPage({ query, onQueryChange, search, categories }: Props) {
    const { t } = useTranslation("public");
    const { activityId } = search;
    const deferredQuery = useDeferredValue(query);
    const groups = useMemo(() => searchSections(search.sections, deferredQuery), [search.sections, deferredQuery]);
    const total = countHits(groups);
    const [recent] = useState(() => readRecentSearches(activityId));
    const rootRef = useRef<HTMLDivElement>(null);
    useKeyboardInset(rootRef);

    const totalRef = useRef(total);
    totalRef.current = total;
    const tracked = useRef(new Set<string>());
    useEffect(() => {
        if (!activityId) return;
        const timer = window.setTimeout(() => {
            const normalized = normalizeForSearch(query);
            if (normalized.length < TRACK_MIN_QUERY_LEN || tracked.current.has(normalized)) return;
            tracked.current.add(normalized);
            trackEvent(activityId, "search_performed", { query, results_count: totalRef.current });
        }, TRACK_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [query, activityId]);

    const filterCount = search.appliedFilterIds.length;
    const select = (item: CollectionViewSectionItem) => {
        saveRecentSearch(activityId, query);
        closeSheet();
        // Lo scorrimento al frame dopo: il blocco della pagina si toglie nel commit della chiusura.
        requestAnimationFrame(() => search.onSelectProduct(item.id));
    };

    if (!query.trim()) {
        return (
            <div ref={rootRef} className={styles.page}>
                {recent.length > 0 ? (
                    <section aria-labelledby="pub-search-recent">
                        <h3 id="pub-search-recent" className={styles.sectionTitle}>
                            {t("search.recent_title")}
                        </h3>
                        <ul className={styles.list}>
                            {recent.map(text => (
                                <li key={text}>
                                    <button type="button" className={styles.recent} onClick={() => onQueryChange(text)}>
                                        <Clock size={16} strokeWidth={2} aria-hidden className={styles.muted} />
                                        <span className={styles.recentText}>{text}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
                {search.allergens.length > 0 ? (
                    <button type="button" className={styles.filtersRow} onClick={() => pushVenueSheet("filters")}>
                        <SlidersHorizontal size={18} strokeWidth={2} aria-hidden />
                        <span className={styles.filtersText}>
                            <span className={styles.filtersLabel}>{t("search.filters_label")}</span>
                            <span className={styles.muted}>
                                {filterCount > 0
                                    ? t("more.filters_subtitle_active", { count: filterCount })
                                    : t("more.filters_subtitle_inactive")}
                            </span>
                        </span>
                        <ChevronRight size={16} strokeWidth={2} aria-hidden className={styles.muted} />
                    </button>
                ) : null}
                {categories.groups.length > 0 ? (
                    <nav aria-labelledby="pub-search-categories">
                        <h3 id="pub-search-categories" className={styles.sectionTitle}>
                            {t("categories.sheet_title")}
                        </h3>
                        <CategoryList
                            groups={categories.groups}
                            activeSectionId={categories.activeSectionId}
                            onSelect={(id, depth) => {
                                closeSheet();
                                requestAnimationFrame(() =>
                                    depth === 0 ? categories.onSelectSection(id) : categories.onSelectSubSection(id)
                                );
                            }}
                        />
                    </nav>
                ) : null}
            </div>
        );
    }

    return (
        <div ref={rootRef} className={styles.page}>
            {/* Una regione sola, sempre montata: annuncia il numero e anche «nessun risultato». */}
            <p className={total > 0 ? styles.count : styles.emptyTitle} role="status">
                {total > 0
                    ? t("search.results_count", { count: total })
                    : filterCount > 0
                      ? t("search.no_results_filtered", { query: query.trim() })
                      : `${t("search.no_results")} «${query.trim()}»`}
            </p>
            {total === 0 ? (
                filterCount > 0 ? (
                    <div className={styles.empty}>
                        <p className={styles.muted}>{t("search.no_results_filtered_hint")}</p>
                        <button type="button" className={styles.clearFilters} onClick={() => search.onApplyFilters([])}>
                            {t("search.clear_filters")}
                        </button>
                    </div>
                ) : null
            ) : (
                groups.map(group => (
                    <section key={group.section.id} aria-label={group.section.name}>
                        <h3 className={styles.sectionTitle}>{group.section.name}</h3>
                        <ul className={styles.list}>
                            {group.hits.map(({ item }) => (
                                <li key={item.id}>
                                    <button type="button" className={styles.result} onClick={() => select(item)}>
                                        {item.image ? (
                                            <img
                                                className={styles.thumb}
                                                src={item.image}
                                                alt=""
                                                width={44}
                                                height={44}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <span className={styles.thumb} aria-hidden />
                                        )}
                                        <span className={styles.resultText}>
                                            <span className={styles.resultName}>
                                                {highlightParts(item.name, deferredQuery).map((part, i) =>
                                                    part.match ? (
                                                        <mark key={i} className={styles.mark}>
                                                            {part.text}
                                                        </mark>
                                                    ) : (
                                                        part.text
                                                    )
                                                )}
                                            </span>
                                            {item.description ? (
                                                <span className={styles.resultDescription}>{item.description}</span>
                                            ) : null}
                                        </span>
                                        <Price item={item} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))
            )}
        </div>
    );
}

/** Prezzo come nella ricerca di oggi: «da» coi formati. La virgola e il simbolo dopo arrivano con la scheda (PR 5). */
function Price({ item }: { item: CollectionViewSectionItem }) {
    const { t } = useTranslation("public");
    const value = item.from_price ?? item.effective_price ?? item.price;
    if (value == null) return null;
    const price = `€${formatDecimal(value)}`;
    return <span className={styles.price}>{item.from_price != null ? t("product.price_from", { price }) : price}</span>;
}
