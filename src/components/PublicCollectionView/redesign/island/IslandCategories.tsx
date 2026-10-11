import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FocusEvent as ReactFocusEvent,
    type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { CollectionViewSectionGroup } from "@components/PublicCollectionView/CollectionView/CollectionView";
import { categoryBoxes } from "../categories/categoryBoxes";
import { ALL_CATEGORIES_ID } from "./anchors";
import styles from "./IslandCategories.module.scss";

/** Sfumatura ai bordi della fila: una pill dentro questa fascia non è «in vista». */
const EDGE_PX = 28;
/** Scorrimento che il menu delle sottocategorie sopporta prima di chiudersi. */
const SCROLL_SLACK_PX = 8;
/** Distanza minima del menu dal bordo destro della finestra. */
const MENU_GUTTER_PX = 16;

type Props = {
    groups: CollectionViewSectionGroup[];
    activeId: string | null;
    onSelect: (sectionId: string) => void;
    onSelectSub: (sectionId: string) => void;
    onOpenAll: () => void;
    className?: string;
};

/**
 * Pill delle categorie nell'isola (spec §2, §4, §13), telefono e desktop: una
 * pill per categoria principale, la ⌄ solo dove ci sono sottocategorie e apre
 * un menu con le sole sottocategorie di quella. La fila scorre di lato, con la
 * sfumatura dove c'è altro; su desktop anche frecce e «Tutte le categorie».
 */
export default function IslandCategories({ groups, activeId, onSelect, onSelectSub, onOpenAll, className }: Props) {
    const { t } = useTranslation("public");
    const rootRef = useRef<HTMLElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const prevRef = useRef<HTMLButtonElement>(null);
    const nextRef = useRef<HTMLButtonElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });
    const [open, setOpen] = useState<{ id: string; left: number } | null>(null);
    const chevronRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const menuRef = useRef<HTMLDivElement>(null);

    const boxes = useMemo(() => categoryBoxes(groups), [groups]);
    // La pill accesa è la categoria principale della sezione in vista, anche se è una sottocategoria.
    const currentBoxId = useMemo(
        () => boxes.find(box => box.rows.some(row => row.id === activeId))?.id ?? null,
        [boxes, activeId]
    );

    // La categoria in vista resta in vista anche nella fila: scorre solo la fila, mai la pagina.
    const revealActive = useCallback((behavior: ScrollBehavior) => {
        const list = listRef.current;
        const active = list?.querySelector<HTMLElement>("[data-current]");
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
            // Una freccia che sparisce col fuoco sopra lo lascerebbe cadere sul body.
            const focused = document.activeElement;
            if (!start && focused === prevRef.current) list.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
            if (!end && focused === nextRef.current) {
                list.querySelector<HTMLElement>("[data-pill]:last-child button")?.focus({ preventScroll: true });
            }
            setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
        };
        update();
        list.addEventListener("scroll", update, { passive: true });
        // Anche le pill: il font del locale che arriva dopo cambia la loro misura, non quella della fila.
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
    }, [boxes, revealActive]);

    useEffect(() => {
        revealActive("smooth");
    }, [currentBoxId, boxes, revealActive]);

    // Menu delle sottocategorie: si chiude toccando fuori, con Esc (il fuoco torna alla ⌄)
    // e scorrendo la pagina o la fila (resterebbe staccato dalla sua pill). Qualche pixel
    // di scorrimento no: l'elastico di iOS e lo scroll che porta in vista non lo chiudono.
    useEffect(() => {
        if (!open) return;
        const list = listRef.current;
        const fromY = window.scrollY;
        const fromX = list?.scrollLeft ?? 0;
        const close = () => setOpen(null);
        const onScroll = () => {
            if (Math.abs(window.scrollY - fromY) > SCROLL_SLACK_PX) close();
        };
        const onListScroll = () => {
            if (list && Math.abs(list.scrollLeft - fromX) > SCROLL_SLACK_PX) close();
        };
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || chevronRefs.current[open.id]?.contains(target)) return;
            close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            close();
            chevronRefs.current[open.id]?.focus({ preventScroll: true });
        };
        document.addEventListener("pointerdown", onPointer, true);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, { passive: true });
        list?.addEventListener("scroll", onListScroll, { passive: true });
        menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
        return () => {
            document.removeEventListener("pointerdown", onPointer, true);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll);
            list?.removeEventListener("scroll", onListScroll);
        };
    }, [open]);

    // Una pill vicina al bordo destro: il menu si sposta a sinistra quanto basta per restare nella finestra.
    useLayoutEffect(() => {
        const menu = menuRef.current;
        const root = rootRef.current;
        if (!open || !menu || !root) return;
        const rootLeft = root.getBoundingClientRect().left;
        const max = document.documentElement.clientWidth - MENU_GUTTER_PX - menu.offsetWidth - rootLeft;
        menu.style.left = `${Math.max(MENU_GUTTER_PX - rootLeft, Math.min(open.left, max))}px`;
    }, [open]);

    // Sparita la categoria (filtri), sparisce anche il suo menu.
    const openBox = open ? boxes.find(box => box.id === open.id) ?? null : null;

    const toggleMenu = (boxId: string) => {
        if (open?.id === boxId) {
            setOpen(null);
            return;
        }
        const root = rootRef.current;
        const pill = chevronRefs.current[boxId]?.parentElement;
        if (!root || !pill) return;
        const left = pill.getBoundingClientRect().left - root.getBoundingClientRect().left;
        setOpen({ id: boxId, left: Math.max(0, left) });
    };

    const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const target =
            event.key === "ArrowDown"
                ? (index + 1) % items.length
                : event.key === "ArrowUp"
                  ? (index - 1 + items.length) % items.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : null;
        if (target === null) return;
        event.preventDefault();
        items[target]?.focus();
    };

    // Col Tab il fuoco esce dal menu: il menu si chiude (resterebbe aperto senza nessuno dentro).
    const closeOnFocusOut = (event: ReactFocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget as Node | null;
        if (next && (menuRef.current?.contains(next) || (open && chevronRefs.current[open.id]?.contains(next)))) return;
        if (next) setOpen(null);
    };

    // Scelta una sottocategoria il fuoco torna alla sua ⌄ (la voce sparisce col menu).
    const choose = (sectionId: string) => {
        if (open) chevronRefs.current[open.id]?.focus({ preventScroll: true });
        setOpen(null);
        onSelectSub(sectionId);
    };

    const page = (direction: 1 | -1) => {
        const list = listRef.current;
        if (list) list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: "smooth" });
    };

    if (boxes.length === 0) return null;

    return (
        <nav ref={rootRef} className={className ? `${styles.root} ${className}` : styles.root} aria-label={t("categories.sheet_title")}>
            <div className={styles.track} data-start={edges.start || undefined} data-end={edges.end || undefined}>
                <div ref={listRef} className={styles.list}>
                    {boxes.map(box => {
                        const [head, ...subs] = box.rows;
                        const current = box.id === currentBoxId;
                        const expanded = open?.id === box.id;
                        return (
                            <div key={box.id} className={styles.pill} data-pill data-current={current || undefined}>
                                <button
                                    type="button"
                                    className={styles.pillName}
                                    aria-current={current || undefined}
                                    onClick={() => onSelect(box.id)}
                                >
                                    {head.name}
                                </button>
                                {subs.length > 0 && (
                                    <button
                                        ref={el => {
                                            chevronRefs.current[box.id] = el;
                                        }}
                                        type="button"
                                        className={styles.pillMore}
                                        aria-haspopup="menu"
                                        aria-expanded={expanded}
                                        aria-label={t("nav.subcategories_aria", { name: head.name })}
                                        onClick={() => toggleMenu(box.id)}
                                    >
                                        <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
                                    </button>
                                )}
                            </div>
                        );
                    })}
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
            <button id={ALL_CATEGORIES_ID} type="button" className={styles.all} onClick={onOpenAll}>
                {t("header.all_categories")}
            </button>

            {open && openBox && (
                <div
                    ref={menuRef}
                    className={styles.menu}
                    role="menu"
                    aria-label={openBox.rows[0].name}
                    style={{ left: open.left }}
                    onKeyDown={moveFocus}
                    onBlur={closeOnFocusOut}
                >
                    <div className={styles.menuTitle} aria-hidden>
                        {openBox.rows[0].name}
                    </div>
                    {openBox.rows.slice(1).map(row => (
                        <button
                            key={row.id}
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className={styles.menuRow}
                            data-depth={row.depth}
                            aria-current={row.id === activeId ? "location" : undefined}
                            onClick={() => choose(row.id)}
                        >
                            <span className={styles.menuName}>{row.name}</span>
                            {row.count !== null && <span className={styles.menuCount}>{row.count}</span>}
                        </button>
                    ))}
                </div>
            )}
        </nav>
    );
}
