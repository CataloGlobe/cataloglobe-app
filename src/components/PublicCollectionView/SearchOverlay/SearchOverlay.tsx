import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { X, Search } from "lucide-react";
import type { CollectionViewSection, CollectionViewSectionItem } from "../CollectionView/CollectionView";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import styles from "./SearchOverlay.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    sections: CollectionViewSection[];
    /** Usato per scrollare al prodotto selezionato nel container corretto. */
    scrollContainerEl?: HTMLElement | null;
    mode: "public" | "preview";
    activityId?: string;
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

function formatPrice(item: CollectionViewSectionItem): string | null {
    if (item.from_price != null) return `da €${item.from_price.toFixed(2)}`;
    const p = item.effective_price ?? item.price;
    return p != null ? `€${p.toFixed(2)}` : null;
}

export default function SearchOverlay({ isOpen, onClose, sections, scrollContainerEl, mode, activityId }: Props) {
    const { t } = useTranslation("public");
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultRefsRef = useRef<(HTMLButtonElement | null)[]>([]);

    // Reset query e focus input all'apertura
    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setHighlightedIndex(-1);
        const t = setTimeout(() => inputRef.current?.focus(), 60);
        return () => clearTimeout(t);
    }, [isOpen]);

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
            onClose();
            setTimeout(() => {
                document
                    .getElementById(`product-${item.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 200);
        },
        [onClose, mode, activityId, query, totalCount]
    );

    // Escape + navigazione frecce + Invio
    useEffect(() => {
        if (!isOpen) return;
        const handle = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    onClose();
                    break;
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
    }, [isOpen, onClose, flatResults, highlightedIndex, handleSelect]);

    // Contatore per assegnare l'indice piatto a ogni risultato nel JSX
    let flatIdx = 0;

    const panel = (
        <div className={styles.panel} role="dialog" aria-modal aria-label={t("search.dialog_aria")}>
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
                    onClick={onClose}
                    aria-label={t("search.close_aria")}
                >
                    {t("search.close_label")}
                </button>
            </div>

            {/* Risultati */}
            <div className={styles.results}>
                {query.trim() === "" ? (
                    <p className={styles.hint}>{t("search.hint")}</p>
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
                                                    {price}
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
            className={styles.publicOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
        >
            <div className={styles.backdrop} onClick={onClose} aria-hidden />
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
