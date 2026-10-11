import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./IslandCategories.module.scss";

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
    const [edges, setEdges] = useState({ start: false, end: false });

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const update = () => {
            const start = list.scrollLeft > 1;
            const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
            setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
        };
        update();
        list.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(list);
        return () => {
            list.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [sections]);

    // La categoria in vista resta in vista anche nella fila: scorre solo la fila, mai la pagina.
    useEffect(() => {
        const list = listRef.current;
        const active = list?.querySelector<HTMLElement>("[aria-current]");
        if (!list || !active) return;
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        if (left < list.scrollLeft) list.scrollTo({ left: left - 8, behavior: "smooth" });
        else if (right > list.scrollLeft + list.clientWidth) {
            list.scrollTo({ left: right - list.clientWidth + 8, behavior: "smooth" });
        }
    }, [activeId]);

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
