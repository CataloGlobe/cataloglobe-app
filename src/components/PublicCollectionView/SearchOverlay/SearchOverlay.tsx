import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { X, Search } from "lucide-react";
import type { CollectionViewSection, CollectionViewSectionItem } from "../CollectionView/CollectionView";
import { useSheetBodyLock } from "../hooks/useSheetBodyLock";
import { SEARCH_TRIGGER_ID } from "../PublicCollectionHeader/PublicCollectionHeader";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import styles from "./SearchOverlay.module.scss";

// Ripristino dei pointer-events dopo l'uscita (220ms del fade + margine).
// Serve solo nel caso limite in cui il pannello venga riaperto PRIMA che
// AnimatePresence lo smonti: lì l'istanza React è riusata e le mutazioni DOM
// di handleClose resterebbero appiccicate, lasciando il pannello inerte.
// Nel caso normale il timer muore col cleanup di unmount.
const POINTER_EVENTS_RESTORE_MS = 260;

// Elementi che il focus trap considera fermabili dentro il pannello.
const FOCUSABLE_SELECTOR =
    'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    sections: CollectionViewSection[];
    /** Usato per scrollare al prodotto selezionato nel container corretto. */
    scrollContainerEl?: HTMLElement | null;
    mode: "public" | "preview";
    activityId?: string;
    /** Notifica il parent del prodotto scelto. Lo scroll + l'evidenziazione
     *  vivono in CollectionView (che resta montato dopo la chiusura overlay e
     *  può ospitare il detector di scroll-end). */
    onSelectProduct?: (productId: string) => void;
    /** Quanti allergeni sono attualmente esclusi dal filtro. `sections` arriva
     *  già filtrato: serve solo a spiegare lo zero-risultati. Default 0. */
    activeFilterCount?: number;
    /** Azzera il filtro allergeni senza chiudere il pannello né svuotare la
     *  query. Undefined ⇒ l'azione non viene renderizzata. */
    onClearFilters?: () => void;
};

// ── Helpers di normalizzazione e scoring ─────────────────────────────────────

const normalizeForSearch = (s: string): string =>
    s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();

const escapeRegex = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function computeScore(item: CollectionViewSectionItem, q: string): number {
    if (!q) return 0;
    const escaped = escapeRegex(q);
    const wordRe = new RegExp(`\\b${escaped}\\b`);

    const name = normalizeForSearch(item.name ?? "");
    const desc = normalizeForSearch(item.description ?? "");

    let score = 0;

    // Nome: match parola-iniziale > word-boundary > substring
    if (name.startsWith(q) && wordRe.test(name)) score = Math.max(score, 100);
    else if (wordRe.test(name)) score = Math.max(score, 50);
    else if (name.includes(q)) score = Math.max(score, 20);

    // Varianti: contribuiscono al parent con score ridotto
    const variants = Array.isArray(item.variants) ? item.variants : [];
    let variantScore = 0;
    for (const v of variants) {
        const vname = normalizeForSearch(v?.name ?? "");
        if (wordRe.test(vname)) variantScore = Math.max(variantScore, 40);
        else if (vname.includes(q)) variantScore = Math.max(variantScore, 15);
    }
    score = Math.max(score, variantScore);

    // Description: solo se nessun match più forte
    if (score === 0 && desc.includes(q)) score = 5;

    return score;
}

// ─────────────────────────────────────────────────────────────────────────────

function formatPrice(item: CollectionViewSectionItem): { price: string; isFrom: boolean } | null {
    if (item.from_price != null) return { price: `€${item.from_price.toFixed(2)}`, isFrom: true };
    const p = item.effective_price ?? item.price;
    return p != null ? { price: `€${p.toFixed(2)}`, isFrom: false } : null;
}

export default function SearchOverlay({ isOpen, onClose, sections, scrollContainerEl, mode, activityId, onSelectProduct, activeFilterCount = 0, onClearFilters }: Props) {
    const { t } = useTranslation("public");
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultRefsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const pointerEventsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Body lock — stessa meccanica delle PublicSheet (hook condiviso) ──────
    // Gate su mode: in preview il pannello vive dentro il device frame dello
    // StyleEditor, bloccare il body bloccherebbe lo scroll dell'editor.
    const isLockActive = isOpen && mode === "public";
    const { releaseBodyLock } = useSheetBodyLock(isLockActive);

    // ── Chiusura — rilascio del lock a INIZIO uscita, non a fine ────────────
    // Il pannello sta dentro AnimatePresence: resta montato per tutta l'uscita,
    // quindi il cleanup dell'hook scatterebbe solo a fade concluso (~220ms di
    // input bloccato). Stesso vincolo di interattività di animateOutMobile in
    // PublicSheet: si rilascia subito e il cleanup resta rete di sicurezza.
    // I pointer-events off evitano che overlay e backdrop, ancora montati e in
    // dissolvenza, si mangino il tap successivo (al tavolo si nota).
    const handleClose = useCallback(() => {
        if (overlayRef.current) overlayRef.current.style.pointerEvents = "none";
        if (backdropRef.current) backdropRef.current.style.pointerEvents = "none";
        if (panelRef.current) panelRef.current.style.pointerEvents = "none";
        if (pointerEventsTimerRef.current !== null) clearTimeout(pointerEventsTimerRef.current);
        pointerEventsTimerRef.current = setTimeout(() => {
            if (overlayRef.current) overlayRef.current.style.pointerEvents = "";
            if (backdropRef.current) backdropRef.current.style.pointerEvents = "";
            if (panelRef.current) panelRef.current.style.pointerEvents = "";
        }, POINTER_EVENTS_RESTORE_MS);

        releaseBodyLock();

        // Restore del focus sulla lente (mai sul ghost input, che è off-screen
        // e tabIndex=-1). preventScroll: il focus non deve competere con lo
        // scroll-to-product innescato da onExitComplete nel parent.
        if (mode === "public") {
            document.getElementById(SEARCH_TRIGGER_ID)?.focus({ preventScroll: true });
        }

        onClose();
    }, [onClose, releaseBodyLock, mode]);

    useEffect(() => () => {
        if (pointerEventsTimerRef.current !== null) clearTimeout(pointerEventsTimerRef.current);
    }, []);

    // Reset query/highlight all'apertura
    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setHighlightedIndex(-1);
    }, [isOpen]);

    // Focus sincrono al mount/apertura (useLayoutEffect: prima del paint, più
    // vicino al gesto). Su iOS la tastiera è già su dal ghost input dell'header
    // (vedi PublicCollectionHeader): qui trasferiamo il focus al vero input senza
    // dismiss intermedio. Solo runtime/public — in preview niente focus.
    useLayoutEffect(() => {
        if (!isOpen || mode !== "public") return;
        inputRef.current?.focus();
    }, [isOpen, mode]);

    // Debounce 100ms: l'input resta reattivo, il filtro si aggiorna con ritardo
    const [debouncedQuery, setDebouncedQuery] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 100);
        return () => clearTimeout(t);
    }, [query]);

    const normalizedQuery = useMemo(
        () => normalizeForSearch(debouncedQuery),
        [debouncedQuery]
    );

    // Risultati raggruppati per sezione, ordinati per score DESC
    const groupedResults = useMemo(() => {
        if (!normalizedQuery) return [];

        return sections
            .map(s => {
                const scored = s.items
                    .map((item, originalIndex) => ({
                        item,
                        score: computeScore(item, normalizedQuery),
                        originalIndex,
                    }))
                    .filter(r => r.score > 0)
                    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

                return scored.length > 0
                    ? { sectionId: s.id, sectionName: s.name, items: scored.map(r => r.item) }
                    : null;
            })
            .filter((g): g is NonNullable<typeof g> => g !== null);
    }, [sections, normalizedQuery]);

    // Lista piatta per la navigazione da tastiera
    const flatResults = useMemo(
        () => groupedResults.flatMap(g => g.items),
        [groupedResults]
    );

    const totalCount = flatResults.length;

    // Reset highlight quando la query cambia (immediato, non debounced)
    useEffect(() => {
        setHighlightedIndex(-1);
        resultRefsRef.current = [];
    }, [query]);

    const handleSelect = useCallback(
        (item: CollectionViewSectionItem) => {
            if (mode === "public" && activityId) {
                trackEvent(activityId, "search_performed", {
                    query,
                    results_count: totalCount,
                    selected_product_id: item.id
                });
            }
            // Lo scroll + l'evidenziazione avvengono in CollectionView, innescati
            // a overlay completamente uscito (onExitComplete) — niente setTimeout
            // magico qui. Segnaliamo il target prima di chiudere.
            onSelectProduct?.(item.id);
            handleClose();
        },
        [handleClose, onSelectProduct, mode, activityId, query, totalCount]
    );

    // Escape + navigazione frecce + Invio + focus trap
    useEffect(() => {
        if (!isOpen) return;
        const handle = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    handleClose();
                    break;
                case "Tab": {
                    // Focus trap: il pannello è aria-modal, il Tab non deve
                    // scendere nel menù sottostante. Solo runtime — in preview
                    // il pannello è inerte e non riceve focus.
                    if (mode !== "public") break;
                    const panel = panelRef.current;
                    if (!panel) break;
                    const focusables = Array.from(
                        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
                    );
                    if (focusables.length === 0) break;
                    const first = focusables[0];
                    const last = focusables[focusables.length - 1];
                    const active = document.activeElement;
                    if (!panel.contains(active)) {
                        // Focus sfuggito fuori (click sul backdrop, ecc.):
                        // riportalo dentro invece di lasciarlo nel menù.
                        e.preventDefault();
                        (e.shiftKey ? last : first).focus();
                        break;
                    }
                    if (e.shiftKey && active === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && active === last) {
                        e.preventDefault();
                        first.focus();
                    }
                    break;
                }
                case "ArrowDown":
                    if (flatResults.length === 0) break;
                    e.preventDefault();
                    setHighlightedIndex(prev => {
                        const next = prev < flatResults.length - 1 ? prev + 1 : 0;
                        resultRefsRef.current[next]?.scrollIntoView({ block: "nearest" });
                        return next;
                    });
                    break;
                case "ArrowUp":
                    if (flatResults.length === 0) break;
                    e.preventDefault();
                    setHighlightedIndex(prev => {
                        const next = prev > 0 ? prev - 1 : flatResults.length - 1;
                        resultRefsRef.current[next]?.scrollIntoView({ block: "nearest" });
                        return next;
                    });
                    break;
                case "Enter":
                    if (highlightedIndex >= 0 && flatResults[highlightedIndex]) {
                        e.preventDefault();
                        handleSelect(flatResults[highlightedIndex]);
                    }
                    break;
            }
        };
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [isOpen, handleClose, flatResults, highlightedIndex, handleSelect, mode]);

    // Contatore per assegnare l'indice piatto a ogni risultato nel JSX
    let flatIdx = 0;

    const panel = (
        <div ref={panelRef} className={styles.panel} role="dialog" aria-modal aria-label={t("search.dialog_aria")}>
            {/* Riga di ricerca */}
            <div className={styles.searchRow}>
                <div className={styles.inputWrapper}>
                    <Search
                        className={styles.searchIcon}
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                    />
                    <input
                        ref={inputRef}
                        type="search"
                        className={styles.input}
                        placeholder={t("search.placeholder")}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            type="button"
                            className={styles.clearBtn}
                            onClick={() => {
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            aria-label={t("search.clear_aria")}
                        >
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={handleClose}
                    aria-label={t("search.close_aria")}
                >
                    <X size={18} strokeWidth={2} />
                </button>
            </div>

            {/* Risultati */}
            {/* La catena si decide su debouncedQuery, NON su query: groupedResults
                deriva dal debounce, quindi scegliere il ramo sul valore immediato
                aprirebbe una finestra di ~100ms in cui si mostra un vuoto pur
                avendo risultati validi (sfarfallio + salto di layout, marcato sul
                vuoto filtrato che è alto). Allineate le due fonti, durante il
                debounce resta visibile il risultato precedente. L'input resta
                legato a `query`: la digitazione non deve avere lag. */}
            <div className={styles.results}>
                {debouncedQuery.trim() === "" ? (
                    <p className={styles.hint}>{t("search.hint")}</p>
                ) : groupedResults.length === 0 && activeFilterCount > 0 ? (
                    // Zero risultati CON filtro attivo: `sections` arriva già
                    // filtrato, quindi il vuoto può dipendere dai filtri e non
                    // dalla query. Lo diciamo, e offriamo l'uscita senza perdere
                    // la query digitata.
                    <div className={styles.filteredEmpty}>
                        <p className={styles.filteredEmptyTitle}>
                            {t("search.no_results_filtered", { query })}
                        </p>
                        <p className={styles.filteredEmptyHint}>
                            {t("search.no_results_filtered_hint")}
                        </p>
                        {onClearFilters && (
                            <button
                                type="button"
                                className={styles.clearFiltersBtn}
                                onClick={onClearFilters}
                            >
                                {t("search.clear_filters")}
                            </button>
                        )}
                    </div>
                ) : groupedResults.length === 0 ? (
                    <p className={styles.hint}>
                        {t("search.no_results")}{" "}
                        <em className={styles.hintQuery}>"{query}"</em>
                    </p>
                ) : (
                    <>
                        {groupedResults.map(group => (
                            <div key={group.sectionId} className={styles.group}>
                                <div className={styles.groupLabel}>{group.sectionName}</div>
                                {group.items.map(item => {
                                    const price = formatPrice(item);
                                    const idx = flatIdx++;
                                    const isHighlighted = idx === highlightedIndex;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            ref={el => {
                                                resultRefsRef.current[idx] = el;
                                            }}
                                            className={
                                                styles.resultBtn +
                                                (isHighlighted
                                                    ? " " + styles.resultBtnHighlighted
                                                    : "")
                                            }
                                            onClick={() => handleSelect(item)}
                                            aria-selected={isHighlighted}
                                        >
                                            <div className={styles.resultMain}>
                                                <span className={styles.resultName}>
                                                    {item.name}
                                                </span>
                                                {item.description && (
                                                    <span className={styles.resultDesc}>
                                                        {item.description}
                                                    </span>
                                                )}
                                            </div>
                                            {price && (
                                                <span className={styles.resultPrice}>
                                                    {price.isFrom
                                                        ? t("product.price_from", { price: price.price })
                                                        : price.price}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        <p className={styles.countNote}>
                            {t("search.results_count", { count: totalCount })}
                        </p>
                    </>
                )}
            </div>
        </div>
    );

    // ── PREVIEW: sticky shell con altezza reale del container ──────────────
    // Il previewShell usa height = clientHeight del deviceScreen così copre
    // l'intero device frame. overflow:hidden clippa il contenuto dentro i bordi.
    if (mode === "preview") {
        const shellHeight = scrollContainerEl?.clientHeight ?? 0;
        return (
            <div
                className={styles.previewShell}
                style={{ height: shellHeight, marginBottom: -shellHeight }}
            >
                <motion.div
                    className={styles.previewBackdrop}
                    onClick={onClose}
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "linear" }}
                />
                <div className={styles.previewPanelWrap}>
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {panel}
                    </motion.div>
                </div>
            </div>
        );
    }

    // ── PUBLIC: position:fixed su tutto il viewport ─────────────────────────
    // Root motion.div = anchor di AnimatePresence: porta il fade (opacity)
    // dell'intero overlay (backdrop incluso). Panel motion.div = "tendina":
    // solo slide Y dall'alto (opacity ereditata dal root, no scale).
    // box-shadow statico (non animato) per non costare repaint su WebKit.
    const overlayTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;
    return (
        <motion.div
            ref={overlayRef}
            className={styles.publicOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
        >
            <div ref={backdropRef} className={styles.backdrop} onClick={handleClose} aria-hidden />
            <div className={styles.publicPanelWrap}>
                <motion.div
                    initial={{ y: -14 }}
                    animate={{ y: 0 }}
                    exit={{ y: -14 }}
                    transition={overlayTransition}
                >
                    {panel}
                </motion.div>
            </div>
        </motion.div>
    );
}
