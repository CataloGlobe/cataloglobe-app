import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./IslandCategories.module.scss";

/** Larghezza della sfumatura sotto le frecce: una pill dentro questa fascia non è «in vista». */
const EDGE_PX = 48;

type Props = {
    sections: { id: string; name: string }[];
    activeId: string | null;
    onSelect: (sectionId: string) => void;
    onOpenAll: () => void;
};

/**
 * Categorie dentro l'isola, solo desktop (spec §13): a tutta larghezza in
 * seconda riga, nella riga unica da compatta. Scorrono di lato; le frecce ci
 * sono solo se non ci stanno, «Tutte le categorie» sempre in fondo.
 */
export default function IslandCategories({ sections, activeId, onSelect, onOpenAll }: Props) {
    const { t } = useTranslation("public");
    const listRef = useRef<HTMLDivElement>(null);
    const prevRef = useRef<HTMLButtonElement>(null);
    const nextRef = useRef<HTMLButtonElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });

    // La categoria in vista resta in vista anche nella fila (fuori dalle sfumature):
    // scorre solo la fila, mai la pagina.
    const revealActive = useCallback((behavior: ScrollBehavior) => {
        const list = listRef.current;
        const active = list?.querySelector<HTMLElement>("[aria-current]");
        if (!list || !active) return;
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        if (left < list.scrollLeft + EDGE_PX) list.scrollTo({ left: left - EDGE_PX, behavior });
        else if (right > list.scrollLeft + list.clientWidth - EDGE_PX) {
            list.scrollTo({ left: right - list.clientWidth + EDGE_PX, behavior });
        }
    }, []);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const update = () => {
            const start = list.scrollLeft > 1;
            const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
            // Una freccia che sparisce col fuoco sopra lo lascerebbe cadere sul body:
            // passa alla pill di quel bordo.
            const focused = document.activeElement;
            if (!start && focused === prevRef.current) list.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
            if (!end && focused === nextRef.current) {
                list.querySelector<HTMLElement>("button:last-child")?.focus({ preventScroll: true });
            }
            setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
        };
        update();
        list.addEventListener("scroll", update, { passive: true });
        // Anche le pill: il font del locale che arriva dopo cambia la loro misura, non quella della fila.
        // Al cambio di misura (isola estesa ↔ compatta) la categoria in vista torna in vista.
        const ro = new ResizeObserver(() => {
            update();
            revealActive("auto");
        });
        ro.observe(list);
        for (const pill of Array.from(list.children)) ro.observe(pill);
        return () => {
            list.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [sections, revealActive]);

    useEffect(() => {
        revealActive("smooth");
    }, [activeId, sections, revealActive]);

    const page = (direction: 1 | -1) => {
        const list = listRef.current;
        if (list) list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: "smooth" });
    };

    if (sections.length === 0) return null;

    return (
        <nav className={styles.root} aria-label={t("categories.sheet_title")}>
            <div className={styles.track} data-start={edges.start || undefined} data-end={edges.end || undefined}>
                <div ref={listRef} className={styles.list}>
                    {sections.map(section => (
                        <button
                            key={section.id}
                            type="button"
                            className={styles.pill}
                            aria-current={section.id === activeId || undefined}
                            onClick={() => onSelect(section.id)}
                        >
                            {section.name}
                        </button>
                    ))}
                </div>
                {edges.start && (
                    <button
                        ref={prevRef}
                        type="button"
                        className={styles.arrow}
                        data-side="start"
                        onClick={() => page(-1)}
                        aria-label={t("header.categories_prev")}
                    >
                        <ChevronLeft size={16} strokeWidth={2} />
                    </button>
                )}
                {edges.end && (
                    <button
                        ref={nextRef}
                        type="button"
                        className={styles.arrow}
                        data-side="end"
                        onClick={() => page(1)}
                        aria-label={t("header.categories_next")}
                    >
                        <ChevronRight size={16} strokeWidth={2} />
                    </button>
                )}
            </div>
            <button type="button" className={styles.all} onClick={onOpenAll}>
                {t("header.all_categories")}
            </button>
        </nav>
    );
}
