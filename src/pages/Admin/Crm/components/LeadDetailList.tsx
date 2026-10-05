import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import Text from "@/components/ui/Text/Text";
import type { CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { relativeAgo } from "@/utils/crm/crmHome";
import { contactLine, LEAD_VIEWS, matchesView, shortDayAndTime, waitSentence, type LeadView } from "@/utils/crm/leadViews";
import styles from "../LeadDetail.module.scss";

const LEVEL_ORDER = { rosso: 0, arancio: 1, normale: 2 } as const;

/** Un tasto senza modificatori, fuori dai campi di testo e dai dialoghi aperti. */
function isPlainKey(event: KeyboardEvent, key: string): boolean {
    if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
    if (event.repeat || event.isComposing) return false;
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return false;
    const target = event.target as HTMLElement | null;
    return !target?.closest("input, textarea, select, [contenteditable='true']");
}

/**
 * La colonna a sinistra della scheda (V5): la vista da cui si è arrivati
 * («Da lavorare ▾» si cambia), quanti sono, J e K per passare al prossimo.
 * Prima chi aspetta voi (rosso, arancio), poi gli altri dal più recente.
 * Le righe che aspettano prendono il filo del colore dell'attesa.
 */
export function LeadDetailList({
    currentVenueId,
    view,
    venues,
    waits,
    next,
    userId,
    now,
    hrefOf,
    viewHref
}: {
    currentVenueId: string;
    view: LeadView;
    venues: CrmVenueListItem[] | null;
    waits: Map<string, VenueWait>;
    next: Map<string, CrmAppointmentWithVenue>;
    userId: string | null;
    now: Date;
    hrefOf: (venueId: string) => string;
    viewHref: (view: LeadView) => string;
}) {
    const navigate = useNavigate();
    const navRef = useRef<HTMLElement>(null);
    const listView: LeadView = view === "riepilogo" ? "da-lavorare" : view;
    const label = LEAD_VIEWS.find(m => m.view === listView)?.label ?? "Da lavorare";

    const rows = useMemo(() => {
        if (!venues) return [];
        return venues
            .filter(v => matchesView(v, listView, { userId, now }))
            .sort((a, b) => {
                const wa = waits.get(a.id);
                const wb = waits.get(b.id);
                if (wa && !wb) return -1;
                if (wb && !wa) return 1;
                if (wa && wb && wa.level !== wb.level) return LEVEL_ORDER[wa.level] - LEVEL_ORDER[wb.level];
                return b.last_activity_at.localeCompare(a.last_activity_at);
            });
    }, [venues, listView, userId, now, waits]);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            const step = isPlainKey(event, "j") ? 1 : isPlainKey(event, "k") ? -1 : 0;
            if (step === 0 || rows.length === 0) return;
            // Nascosta (display: none) non ha offsetParent: niente scorciatoie.
            if (!navRef.current?.offsetParent) return;
            const at = rows.findIndex(v => v.id === currentVenueId);
            const target = rows[at === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step))];
            if (target && target.id !== currentVenueId) {
                event.preventDefault();
                navigate(hrefOf(target.id));
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [rows, currentVenueId, navigate, hrefOf]);

    return (
        <nav ref={navRef} className={styles.list} aria-label={`Lead: ${label}`}>
            <div className={styles.listHead}>
                <Menu
                    trigger={
                        <button type="button" className={styles.viewPicker}>
                            <Text as="span" variant="body-sm" weight={600} color="inherit">
                                {label}
                            </Text>
                            <ChevronDown size={14} aria-hidden="true" />
                        </button>
                    }
                >
                    {LEAD_VIEWS.map(m => (
                        <Menu.Item key={m.view} onSelect={() => navigate(viewHref(m.view))}>
                            {m.label}
                        </Menu.Item>
                    ))}
                </Menu>
                <Text as="span" variant="caption" colorVariant="muted" className={styles.listCount}>
                    {venues ? rows.length : ""}
                </Text>
                <span className={styles.keys} aria-label="J e K per passare al prossimo">
                    <kbd>J</kbd>
                    <kbd>K</kbd>
                </span>
            </div>
            {venues && rows.length === 0 && (
                <Text variant="body-sm" colorVariant="muted" className={styles.listEmpty}>
                    Nessun lead in questa vista.
                </Text>
            )}
            <ul className={styles.listRows}>
                {rows.map(v => {
                    const wait = waits.get(v.id);
                    const appointment = next.get(v.id);
                    const level = wait && wait.level !== "normale" ? wait.level : undefined;
                    const when = wait ? wait.wait : appointment ? shortDayAndTime(appointment.starts_at, now) : relativeAgo(v.last_activity_at, now);
                    const sentence = wait ? waitSentence(wait.text) : contactLine({ venue: v, wait: undefined, next: appointment, now }).text;
                    return (
                        <li key={v.id}>
                            <Link
                                to={hrefOf(v.id)}
                                className={styles.listRow}
                                data-level={level}
                                aria-current={v.id === currentVenueId ? "page" : undefined}
                            >
                                <span className={styles.listRowTop}>
                                    <Text as="span" variant="body-sm" weight={700} className={styles.ellipsis}>
                                        {v.name}
                                    </Text>
                                    <Text as="span" variant="caption" weight={level ? 700 : undefined} className={styles.listWhen} data-level={level}>
                                        {when.replace(/ giorni$/, " gg")}
                                    </Text>
                                </span>
                                <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                    {sentence}
                                </Text>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
