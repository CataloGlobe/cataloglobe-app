import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChevronRight, Lock } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import type { AppSidebarNavItem } from "./AppSidebar";
import { isItemActive } from "./isItemActive";
import styles from "./AppSidebar.module.scss";
import fly from "./SidebarFlyout.module.scss";

/** Fra la riga e il pannello; il pannello sta a destra della sidebar. */
const PANEL_GAP = 6;
/** La prima pagina del pannello sta accanto alla riga della sezione. Niente
 *  titolo, aperta e chiusa (Alex): la sezione la dice la riga, che resta accesa. */
const PANEL_PADDING = 4;
const VIEWPORT_MARGIN = 8;

interface SidebarSectionProps {
    title: string;
    icon: ReactNode;
    items: AppSidebarNavItem[];
    pathname: string;
    open: boolean;
    /** Il mouse entra nella riga o nel pannello: apre (con un attimo di ritardo) o tiene aperto. */
    onHoverStart: () => void;
    /** Il mouse esce: chiude dopo un attimo, se non rientra. */
    onHoverEnd: () => void;
    /** Apre subito (clic, tastiera). */
    onOpenNow: () => void;
    onClose: () => void;
    /** Sidebar aperta: la sezione si apre verso il basso, dentro la sidebar,
     *  solo col clic. Chiusa (64) resta il pannello a destra. */
    inline?: boolean;
    /** Solo con `inline`: le pagine si vedono sotto la riga. */
    expanded?: boolean;
    /** Solo con `inline`: il clic sulla riga apre o chiude. */
    onToggle?: () => void;
}

/**
 * Una sezione della sidebar (Officina, solo desktop): una riga con l'icona e
 * il nome, che non porta a una pagina. Sidebar aperta (`inline`): il clic apre
 * le pagine sotto la riga, rientrate (Alex, 2026-10-08). Sidebar chiusa: le
 * pagine stanno nel pannello a destra; il passaggio del mouse e il clic lo
 * aprono, si chiude uscendo, con Esc o toccando fuori. Da
 * tastiera: Invio, spazio o freccia a destra aprono e portano nel pannello;
 * Esc e freccia a sinistra tornano alla riga.
 */
export function SidebarSection({
    title,
    icon,
    items,
    pathname,
    open,
    onHoverStart,
    onHoverEnd,
    onOpenNow,
    onClose,
    inline = false,
    expanded = false,
    onToggle
}: SidebarSectionProps) {
    const panelId = useId();
    const rowRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const focusFirst = useRef(false);

    const current = items.find(item => isItemActive(item, pathname)) ?? null;

    const hasSignal = items.some(item => item.loading || item.badge !== undefined || item.showDot);

    // Il pannello è fuori dalla sidebar (che scorre e taglierebbe): posizione
    // fissa accanto alla riga, dentro la finestra.
    useLayoutEffect(() => {
        if (!open) return;
        const row = rowRef.current;
        const panel = panelRef.current;
        if (!row || !panel) return;
        const rowRect = row.getBoundingClientRect();
        const edge = row.closest("aside")?.getBoundingClientRect().right ?? rowRect.right;
        const maxTop = window.innerHeight - panel.offsetHeight - VIEWPORT_MARGIN;
        const top = Math.max(VIEWPORT_MARGIN, Math.min(rowRect.top - PANEL_PADDING, maxTop));
        panel.style.setProperty("--fly-top", `${top}px`);
        panel.style.setProperty("--fly-left", `${edge + PANEL_GAP}px`);
        if (focusFirst.current) {
            focusFirst.current = false;
            panel.querySelector<HTMLElement>("a")?.focus();
        }
    }, [open]);

    // Aperto col tocco o col clic: un tocco fuori lo chiude.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (rowRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open, onClose]);

    const backToRow = () => {
        onClose();
        rowRef.current?.focus();
    };

    const onRowKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            focusFirst.current = true;
            onOpenNow();
        } else if (event.key === "Escape" && open) {
            onClose();
        }
    };

    const onPanelKeyDown = (event: KeyboardEvent) => {
        const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a") ?? []);
        const at = links.indexOf(document.activeElement as HTMLElement);
        if (event.key === "Escape" || event.key === "ArrowLeft" || event.key === "Tab") {
            // Il pannello sta in fondo al documento: Tab da qui finirebbe
            // fuori dalla sidebar. Si torna alla riga e si riparte da lì.
            event.preventDefault();
            backToRow();
        } else if (event.key === "ArrowDown" && links.length > 0) {
            event.preventDefault();
            links[(at + 1) % links.length].focus();
        } else if (event.key === "ArrowUp" && links.length > 0) {
            event.preventDefault();
            links[(at - 1 + links.length) % links.length].focus();
        }
    };

    if (inline) {
        const listId = `${panelId}-list`;
        return (
            <li>
                <button
                    type="button"
                    className={[
                        styles.link,
                        styles.sectionRow,
                        current && !expanded ? styles.active : "",
                        expanded ? styles.sectionExpanded : ""
                    ].join(" ")}
                    aria-expanded={expanded}
                    aria-controls={expanded ? listId : undefined}
                    aria-current={current && !expanded ? "true" : undefined}
                    onClick={onToggle}
                >
                    <span className={styles.iconWrap}>
                        <span className={styles.icon}>{icon}</span>
                    </span>
                    <Text as="span" variant="body-sm" className={styles.label}>
                        {title}
                    </Text>
                    <span className={styles.trailing}>
                        {hasSignal && !expanded && <span className={styles.navDot} aria-hidden="true" />}
                        <ChevronRight size={16} className={styles.sectionChevron} aria-hidden="true" />
                    </span>
                </button>
                {expanded && (
                    <ul id={listId} className={styles.subList} aria-label={title}>
                        {items.map(item => {
                            const active = item === current;
                            const body = (
                                <>
                                    <Text as="span" variant="body-sm" className={styles.label}>
                                        {item.label}
                                    </Text>
                                    <span className={styles.trailing}>
                                        {item.locked && (
                                            <span className={styles.subLock} aria-label="Funzione del piano Pro">
                                                <Lock size={14} strokeWidth={1.5} />
                                            </span>
                                        )}
                                        {item.badge !== undefined ? (
                                            <Badge variant={item.badgeTone ?? "neutral"}>{item.badge}</Badge>
                                        ) : (
                                            (item.showDot || item.loading) && (
                                                <span
                                                    className={styles.navDot}
                                                    role="status"
                                                    aria-label={item.dotLabel ?? item.loadingLabel ?? "In corso"}
                                                />
                                            )
                                        )}
                                    </span>
                                </>
                            );
                            return (
                                <li key={item.to}>
                                    {item.disabled ? (
                                        <span className={`${styles.link} ${styles.subLink} ${styles.disabled}`} aria-disabled="true">
                                            {body}
                                        </span>
                                    ) : (
                                        <Link
                                            to={item.to}
                                            className={[styles.link, styles.subLink, active ? styles.active : ""].join(" ")}
                                            aria-current={active ? "page" : undefined}
                                        >
                                            {body}
                                        </Link>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </li>
        );
    }

    const panel = (
        <div
            ref={panelRef}
            id={panelId}
            className={fly.panel}
            role="group"
            aria-label={title}
            onPointerEnter={event => event.pointerType === "mouse" && onHoverStart()}
            onPointerLeave={event => event.pointerType === "mouse" && onHoverEnd()}
            onKeyDown={onPanelKeyDown}
        >
            <ul className={fly.list}>
                {items.map(item => {
                    const active = item === current;
                    const body = (
                        <>
                            <Text as="span" variant="body-sm" weight={active ? 600 : 400} className={fly.label}>
                                {item.label}
                            </Text>
                            {item.locked && (
                                <span className={fly.lock} aria-label="Funzione del piano Pro">
                                    <Lock size={14} strokeWidth={1.5} />
                                </span>
                            )}
                            {item.badge !== undefined ? (
                                <Badge variant={item.badgeTone ?? "neutral"}>{item.badge}</Badge>
                            ) : (
                                (item.showDot || item.loading) && (
                                    <span
                                        className={fly.dot}
                                        role="status"
                                        aria-label={item.dotLabel ?? item.loadingLabel ?? "In corso"}
                                    />
                                )
                            )}
                        </>
                    );
                    return (
                        <li key={item.to}>
                            {item.disabled ? (
                                <span className={`${fly.item} ${fly.disabled}`} aria-disabled="true">
                                    {body}
                                </span>
                            ) : (
                                <Link
                                    to={item.to}
                                    className={`${fly.item} ${active ? fly.active : ""}`}
                                    aria-current={active ? "page" : undefined}
                                    onClick={onClose}
                                >
                                    {body}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );

    return (
        <li>
            <button
                ref={rowRef}
                type="button"
                className={[styles.link, styles.sectionRow, current ? styles.active : "", open ? styles.sectionOpen : ""].join(
                    " "
                )}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-current={current ? "true" : undefined}
                onPointerEnter={event => event.pointerType === "mouse" && onHoverStart()}
                onPointerLeave={event => event.pointerType === "mouse" && onHoverEnd()}
                onKeyDown={onRowKeyDown}
                // Il clic da tastiera passa da onKeyDown (con il fuoco nel pannello).
                onClick={event => {
                    if (event.detail === 0 || open) return;
                    onOpenNow();
                }}
            >
                <span className={styles.iconWrap}>
                    <span className={styles.icon}>{icon}</span>
                    {hasSignal && (
                        <span className={styles.miniSignal} aria-hidden="true">
                            <span className={styles.navDot} />
                        </span>
                    )}
                </span>
                <Text as="span" variant="body-sm" className={styles.label}>
                    {title}
                </Text>
                <span className={styles.trailing}>
                    {hasSignal && <span className={styles.navDot} aria-hidden="true" />}
                    <ChevronRight size={16} className={styles.sectionChevron} aria-hidden="true" />
                </span>
            </button>
            {open && createPortal(panel, document.body)}
        </li>
    );
}
