import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/context/useAuth";
import type { CrmVenueListItem } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { relativeAgo } from "@/utils/crm/crmHome";
import { CRM_SEARCH_SCOPES, searchActions, searchLeads, type CrmSearchAction, type CrmSearchScope } from "@/utils/crm/crmSearch";
import { CRM_STAGE_LABEL, CRM_STAGE_VARIANT } from "@/utils/crm/stages";
import styles from "./CrmSearch.module.scss";

interface CrmSearchProps {
    collapsed: boolean;
    venues: CrmVenueListItem[];
    waits: Map<string, VenueWait>;
    /** Le cose che aspettano voi (contatore di Home), a destra di «Bozze che aspettano te». */
    homeCount: number;
    onAskGea: (question: string) => void;
}

type Item = { kind: "lead"; venue: CrmVenueListItem } | { kind: "action"; action: CrmSearchAction } | { kind: "gea" };

/** Apertura come Gea (G4): cresce dal campo con un piccolo rimbalzo. */
const EASE_OPEN = [0.2, 0.9, 0.25, 1.12] as const;
const CLOSED = { opacity: 0, x: -24, scale: 0.12 };

function stageTone(venue: CrmVenueListItem): "new" | "conv" | "gray" {
    const variant = CRM_STAGE_VARIANT[venue.stage];
    return variant === "pending" ? "new" : variant === "info" ? "conv" : "gray";
}

/**
 * Cerca del CRM (canvas C4, deciso da Alex il 2026-10-05): il campo sta nella
 * barra e i risultati escono di lato, legati al campo da una freccina, senza
 * scurire la pagina. Dentro: tre filtri, i lead (Chiama, Scrivi, Apri), le
 * azioni veloci e, appena si scrive, «Chiedi a Gea». ⌘K apre e chiude.
 * Con la barra chiusa il campo sta dentro il riquadro.
 */
export function CrmSearch({ collapsed, venues, waits, homeCount, onAskGea }: CrmSearchProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const reduceMotion = useReducedMotion();
    const listId = useId();
    const anchorRef = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<HTMLInputElement>(null);
    const innerFieldRef = useRef<HTMLInputElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState<CrmSearchScope>("tutto");
    const [active, setActive] = useState(0);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    const waiting = useMemo(() => new Set(waits.keys()), [waits]);
    const leads = useMemo(() => searchLeads(venues, { query, scope, userId, waiting }), [venues, query, scope, userId, waiting]);
    const actions = useMemo(() => searchActions(query, scope), [query, scope]);
    const hasQuery = query.trim() !== "";
    const items = useMemo<Item[]>(
        () => [
            ...leads.map(venue => ({ kind: "lead" as const, venue })),
            ...actions.map(action => ({ kind: "action" as const, action })),
            ...(hasQuery ? [{ kind: "gea" as const }] : [])
        ],
        [leads, actions, hasQuery]
    );
    const geaIndex = hasQuery ? items.length - 1 : -1;

    // Senza lead trovati, Invio chiede a Gea; altrimenti si parte dal primo.
    useEffect(() => {
        setActive(hasQuery && leads.length === 0 ? items.length - 1 : 0);
    }, [query, scope, hasQuery, leads.length, items.length]);

    const close = useCallback(() => {
        setOpen(false);
        setQuery("");
        setScope("tutto");
    }, []);

    // Il riquadro si posiziona accanto al campo, alla sua altezza.
    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const place = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (rect) setPosition({ left: rect.right + 16, top: Math.max(8, rect.top + rect.height / 2 - 24) });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [open, collapsed]);

    // Il campo dentro il riquadro (barra chiusa) esiste solo quando il
    // riquadro ha la sua posizione: si aspetta quella, altrimenti i tasti
    // finirebbero alle scorciatoie della pagina.
    const placed = position !== null;
    useEffect(() => {
        if (!open || !placed) return;
        (collapsed ? innerFieldRef : fieldRef).current?.focus();
    }, [open, collapsed, placed]);

    // ⌘K apre e chiude; un clic fuori dal campo e dal riquadro chiude.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(v => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (anchorRef.current?.contains(target) || dropRef.current?.contains(target)) return;
            close();
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open, close]);

    const go = (to: string) => {
        close();
        navigate(to);
    };
    const openLead = (venue: CrmVenueListItem) => go(`/admin/lead/${venue.id}`);
    const writeLead = (venue: CrmVenueListItem) => go(`/admin/lead/${venue.id}?scrivi=1`);
    const callLead = (venue: CrmVenueListItem) => {
        const phone = venue.crm_contacts.find(c => c.phone_e164)?.phone_e164;
        if (phone) window.location.href = `tel:${phone}`;
    };
    const askGea = () => {
        const q = query.trim();
        close();
        onAskGea(q);
    };
    const run = (item: Item | undefined, write = false) => {
        if (!item) return;
        if (item.kind === "lead") (write ? writeLead : openLead)(item.venue);
        else if (item.kind === "action") go(item.action.to);
        else askGea();
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (!open && e.key !== "Escape" && e.key !== "Tab") setOpen(true);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(i => Math.min(i + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            run(items[active], e.metaKey || e.ctrlKey);
        } else if (e.key === "Tab" && !e.shiftKey && open && geaIndex >= 0 && active !== geaIndex) {
            e.preventDefault();
            setActive(geaIndex);
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
            e.currentTarget.blur();
        }
    };

    const optionId = (i: number) => `${listId}-${i}`;
    const fieldProps = {
        role: "combobox" as const,
        "aria-label": "Cerca nel CRM",
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-activedescendant": open && items[active] ? optionId(active) : undefined,
        "aria-autocomplete": "list" as const,
        autoComplete: "off",
        placeholder: "Cerca…",
        value: query,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(e.target.value);
            setOpen(true);
        },
        onKeyDown
    };

    const now = new Date();
    let index = 0;
    const leadCaption = hasQuery ? `LEAD · ${leads.length}` : scope === "tutto" ? "APERTI DI RECENTE" : `LEAD · ${leads.length}`;

    const drop = (
        <AnimatePresence>
            {open && position && (
                <motion.div
                    ref={dropRef}
                    className={styles.drop}
                    style={{ left: position.left, top: position.top }}
                    initial={reduceMotion ? { opacity: 0 } : CLOSED}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : CLOSED}
                    transition={{ duration: 0.38, ease: EASE_OPEN, opacity: { duration: 0.2 } }}
                >
                    {collapsed && (
                        <label className={styles.innerField}>
                            <Search size={16} aria-hidden="true" />
                            <input ref={innerFieldRef} {...fieldProps} />
                        </label>
                    )}
                    <div className={styles.scopes} role="group" aria-label="Filtra i lead">
                        {CRM_SEARCH_SCOPES.map(s => (
                            <button
                                key={s.value}
                                type="button"
                                className={styles.scope}
                                aria-pressed={scope === s.value}
                                onClick={() => {
                                    setScope(s.value);
                                    (collapsed ? innerFieldRef : fieldRef).current?.focus();
                                }}
                            >
                                <Text as="span" variant="caption" color="inherit">
                                    {s.label}
                                </Text>
                            </button>
                        ))}
                    </div>
                    <div id={listId} className={styles.list} role="listbox" aria-label="Risultati">
                        {leads.length > 0 && (
                            <div role="group" aria-label="Lead" className={styles.group}>
                                <Text as="div" variant="caption-xs" weight={600} colorVariant="muted" className={styles.caption}>
                                    {leadCaption}
                                </Text>
                                {leads.map(venue => {
                                    const i = index++;
                                    const wait = waits.get(venue.id);
                                    const person = venue.crm_contacts[0]?.name;
                                    const phone = venue.crm_contacts.find(c => c.phone_e164)?.phone_e164;
                                    return (
                                        <div
                                            key={venue.id}
                                            id={optionId(i)}
                                            role="option"
                                            aria-selected={i === active}
                                            className={styles.res}
                                            onMouseEnter={() => setActive(i)}
                                            onClick={() => openLead(venue)}
                                        >
                                            <span className={styles.leadName}>
                                                <Text as="span" variant="body-sm" weight={600}>
                                                    {venue.name}
                                                </Text>
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    {[venue.city, person].filter(Boolean).map(t => ` · ${t}`)}
                                                </Text>
                                            </span>
                                            <Text
                                                as="span"
                                                variant="caption-xs"
                                                weight={500}
                                                className={styles.pill}
                                                data-tone={stageTone(venue)}
                                            >
                                                {CRM_STAGE_LABEL[venue.stage]}
                                            </Text>
                                            <Text
                                                as="span"
                                                variant="caption"
                                                className={styles.wait}
                                                data-level={wait?.level !== "normale" ? wait?.level : undefined}
                                            >
                                                {wait?.wait ?? relativeAgo(venue.last_activity_at, now)}
                                            </Text>
                                            <span className={styles.acts} onClick={e => e.stopPropagation()}>
                                                {phone && (
                                                    <Button variant="secondary" size="sm" tabIndex={-1} onClick={() => callLead(venue)}>
                                                        Chiama
                                                    </Button>
                                                )}
                                                <Button variant="secondary" size="sm" tabIndex={-1} onClick={() => writeLead(venue)}>
                                                    Scrivi
                                                </Button>
                                                <Button variant="primary" size="sm" tabIndex={-1} onClick={() => openLead(venue)}>
                                                    Apri
                                                </Button>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {actions.length > 0 && (
                            <div role="group" aria-label="Azioni" className={styles.group}>
                                <Text as="div" variant="caption-xs" weight={600} colorVariant="muted" className={styles.caption}>
                                    {hasQuery ? "AZIONI" : "AZIONI VELOCI"}
                                </Text>
                                {actions.map(action => {
                                    const i = index++;
                                    return (
                                        <div
                                            key={action.id}
                                            id={optionId(i)}
                                            role="option"
                                            aria-selected={i === active}
                                            className={styles.res}
                                            onMouseEnter={() => setActive(i)}
                                            onClick={() => go(action.to)}
                                        >
                                            <span className={styles.ico} aria-hidden="true">
                                                <ChevronRight size={14} />
                                            </span>
                                            <Text as="span" variant="body-sm" className={styles.grow}>
                                                {action.label}
                                            </Text>
                                            {action.id === "bozze" && homeCount > 0 && (
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    {homeCount}
                                                </Text>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {hasQuery && (
                            <div role="group" aria-label="Gea" className={styles.group}>
                                <Text as="div" variant="caption-xs" weight={600} colorVariant="muted" className={styles.caption}>
                                    GEA
                                </Text>
                                <div
                                    id={optionId(geaIndex)}
                                    role="option"
                                    aria-selected={active === geaIndex}
                                    className={styles.res}
                                    onMouseEnter={() => setActive(geaIndex)}
                                    onClick={askGea}
                                >
                                    <span className={styles.gav} aria-hidden="true">
                                        G
                                    </span>
                                    <Text as="span" variant="body-sm" className={styles.grow}>
                                        Chiedi a Gea: «{query.trim()}»
                                    </Text>
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        {leads.length === 0 ? "Invio" : "Tab"}
                                    </Text>
                                </div>
                            </div>
                        )}
                        {items.length === 0 && (
                            <Text as="p" variant="body-sm" colorVariant="muted" className={styles.empty}>
                                Nessun lead in questo filtro.
                            </Text>
                        )}
                    </div>
                    <div className={styles.foot} aria-hidden="true">
                        <Text as="span" variant="caption" colorVariant="muted">
                            <kbd>↑</kbd> <kbd>↓</kbd> scegli
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            <kbd>Invio</kbd> apre
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            <kbd>⌘</kbd> <kbd>Invio</kbd> scrive al lead
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.footEnd}>
                            <kbd>Esc</kbd> chiude
                        </Text>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const trigger = collapsed ? (
        <Tooltip content="Cerca (⌘K)" side="right" sideOffset={12}>
            <span>
                <button type="button" className={styles.iconTrigger} onClick={() => setOpen(v => !v)} aria-label="Cerca nel CRM (⌘K)">
                    <Search size={16} aria-hidden="true" />
                </button>
            </span>
        </Tooltip>
    ) : (
        <label className={styles.field} data-open={open || undefined}>
            <Search size={15} aria-hidden="true" />
            <input ref={fieldRef} {...fieldProps} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} />
            {!open && <kbd className={styles.kbd}>⌘K</kbd>}
        </label>
    );

    return (
        <div ref={anchorRef} className={styles.anchor}>
            {trigger}
            {createPortal(drop, document.body)}
        </div>
    );
}
