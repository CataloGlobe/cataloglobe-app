import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, Search } from "lucide-react";
import type { CollectionViewSection, CollectionViewSectionItem } from "../CollectionView/CollectionView";
import styles from "./SearchOverlay.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    sections: CollectionViewSection[];
    /** Usato per scrollare al prodotto selezionato nel container corretto. */
    scrollContainerEl?: HTMLElement | null;
    mode: "public" | "preview";
};

function formatPrice(item: CollectionViewSectionItem): string | null {
    if (item.from_price != null) return `da €${item.from_price.toFixed(2)}`;
    const p = item.effective_price ?? item.price;
    return p != null ? `€${p.toFixed(2)}` : null;
}

export default function SearchOverlay({ isOpen, onClose, sections, scrollContainerEl, mode }: Props) {
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

    // Risultati raggruppati per sezione
    const groupedResults = useMemo(
        () =>
            query.trim().length > 0
                ? sections
                      .map(s => ({
                          sectionId: s.id,
                          sectionName: s.name,
                          items: s.items.filter(
                              item =>
                                  item.name.toLowerCase().includes(query.toLowerCase()) ||
                                  (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
                          )
                      }))
                      .filter(g => g.items.length > 0)
                : [],
        [query, sections]
    );

    // Lista piatta per la navigazione da tastiera
    const flatResults = useMemo(
        () => groupedResults.flatMap(g => g.items),
        [groupedResults]
    );

    const totalCount = flatResults.length;

    // Reset highlight quando la query cambia
    useEffect(() => {
        setHighlightedIndex(-1);
        resultRefsRef.current = [];
    }, [query]);

    const handleSelect = useCallback(
        (item: CollectionViewSectionItem) => {
            onClose();
            setTimeout(() => {
                document
                    .getElementById(`product-${item.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 200);
        },
        [onClose]
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

    if (!isOpen) return null;

    // Contatore per assegnare l'indice piatto a ogni risultato nel JSX
    let flatIdx = 0;

    const panel = (
        <div className={styles.panel} role="dialog" aria-modal aria-label="Ricerca nel catalogo">
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
                        placeholder="Cerca prodotto…"
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
                            aria-label="Cancella testo"
                        >
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={onClose}
                    aria-label="Chiudi ricerca"
                >
                    Annulla
                </button>
            </div>

            {/* Risultati */}
            <div className={styles.results}>
                {query.trim() === "" ? (
                    <p className={styles.hint}>Cerca per nome o descrizione</p>
                ) : groupedResults.length === 0 ? (
                    <p className={styles.hint}>
                        Nessun risultato per{" "}
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
                            {totalCount}{" "}
                            {totalCount === 1 ? "risultato" : "risultati"}
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
                <div
                    className={styles.previewBackdrop}
                    onClick={onClose}
                    aria-hidden
                />
                <div className={styles.previewPanelWrap}>{panel}</div>
            </div>
        );
    }

    // ── PUBLIC: position:fixed su tutto il viewport ─────────────────────────
    return (
        <div className={styles.publicOverlay}>
            <div className={styles.backdrop} onClick={onClose} aria-hidden />
            <div className={styles.publicPanelWrap}>{panel}</div>
        </div>
    );
}
