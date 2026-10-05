import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Check } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { relativeAgo } from "@/utils/crm/crmHome";
import { contactLine, shortDayAndTime, waitSentence } from "@/utils/crm/leadViews";
import { swipeOutcome, type LeadSwipe } from "@/utils/crm/leadSwipe";
import { CRM_STAGE_LABEL, CRM_STAGE_VARIANT } from "@/utils/crm/stages";
import styles from "../Leads.module.scss";

/**
 * L'elenco dei lead al telefono (T8a): una riga per locale con il tempo a
 * destra, la frase di cosa succede e la fase. Le righe che aspettano voi
 * prendono il colore dell'urgenza. Con le dita (U8b): verso destra si invia
 * la bozza, verso sinistra si rimanda a domani; la scheda resta il posto per
 * fare le stesse cose da tastiera.
 */
export function LeadPhoneList({
    venues,
    waits,
    next,
    nameOf,
    now,
    drafts,
    onSwipe
}: {
    venues: CrmVenueListItem[];
    waits: Map<string, VenueWait>;
    next: Map<string, CrmAppointmentWithVenue>;
    nameOf: (userId: string | null) => string | null;
    now: Date;
    /** La bozza aperta di ogni locale: senza, verso destra non succede niente. */
    drafts: Map<string, string>;
    onSwipe: (venue: CrmVenueListItem, swipe: LeadSwipe) => void;
}) {
    return (
        <ul className={styles.phoneList} aria-label="Lead">
            {venues.map(v => {
                const wait = waits.get(v.id);
                const appointment = next.get(v.id);
                const level = wait && wait.level !== "normale" ? wait.level : undefined;
                const when = wait
                    ? wait.wait
                    : appointment
                      ? shortDayAndTime(appointment.starts_at, now)
                      : relativeAgo(v.last_activity_at, now);
                const caller = appointment ? nameOf(appointment.caller_user_id) : null;
                const sentence = wait
                    ? waitSentence(wait.text)
                    : appointment
                      ? `${v.stage === "demo_fissata" ? "Demo" : "Telefonata"}${caller ? `, chiama ${caller}` : ""}`
                      : contactLine({ venue: v, wait: undefined, next: undefined, now }).text;
                return (
                    <li key={v.id}>
                        <SwipeRow canSend={drafts.has(v.id)} onSwipe={swipe => onSwipe(v, swipe)}>
                            <Link to={`/admin/lead/${v.id}`} className={styles.phoneRow} data-level={level} draggable={false}>
                                <span className={styles.phoneRowTop}>
                                    <Text as="span" variant="body" weight={700}>
                                        {v.name}
                                    </Text>
                                    <Text as="span" variant="caption" className={styles.phoneWhen} data-level={level}>
                                        {when}
                                    </Text>
                                </span>
                                {/* «Ieri» a destra e «Ieri» sotto: la frase si toglie. */}
                                {sentence.toLowerCase() !== when.toLowerCase() && (
                                    <Text as="span" variant="body-sm" colorVariant="muted">
                                        {sentence}
                                    </Text>
                                )}
                                <StatusBadge
                                    variant={CRM_STAGE_VARIANT[v.stage]}
                                    label={CRM_STAGE_LABEL[v.stage]}
                                    className={styles.phoneBadge}
                                />
                            </Link>
                        </SwipeRow>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Una riga che si trascina in orizzontale. Solo dita e penna: col mouse la
 * riga resta un link. Lo spostamento passa da una variabile CSS (niente stile
 * in JSX); un trascinamento non apre la scheda.
 */
export function SwipeRow({ canSend, onSwipe, children }: { canSend: boolean; onSwipe: (swipe: LeadSwipe) => void; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const dx = useRef(0);
    const dragged = useRef(false);
    const [dir, setDir] = useState<LeadSwipe | null>(null);

    const move = (x: number) => {
        dx.current = x;
        ref.current?.style.setProperty("--swipe-x", `${x}px`);
        setDir(x > 0 ? "send" : x < 0 ? "snooze" : null);
    };
    const end = () => {
        const width = ref.current?.offsetWidth ?? 0;
        const outcome = dragged.current ? swipeOutcome(dx.current, width, canSend) : null;
        start.current = null;
        ref.current?.removeAttribute("data-dragging");
        move(0);
        if (outcome) onSwipe(outcome);
    };

    return (
        <div
            ref={ref}
            className={styles.swipe}
            data-dir={dir ?? undefined}
            onPointerDown={e => {
                if (e.pointerType === "mouse") return;
                start.current = { x: e.clientX, y: e.clientY };
                dragged.current = false;
            }}
            onPointerMove={e => {
                const s = start.current;
                if (!s) return;
                let x = e.clientX - s.x;
                if (!dragged.current) {
                    if (Math.abs(x) < 10 || Math.abs(x) < Math.abs(e.clientY - s.y) * 1.5) return;
                    dragged.current = true;
                    ref.current?.setAttribute("data-dragging", "");
                    try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                        // Il dito è già andato via: il trascinamento finisce col pointerup.
                    }
                }
                if (!canSend) x = Math.min(x, 0);
                move(x);
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onClickCapture={e => {
                if (dragged.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    dragged.current = false;
                }
            }}
        >
            <div className={styles.swipeBack} aria-hidden="true">
                {dir === "send" && (
                    <span className={styles.swipeSend}>
                        <Check size={16} />
                        <Text as="span" variant="body-sm" weight={700} color="inherit">
                            Inviala così
                        </Text>
                    </span>
                )}
                {dir === "snooze" && (
                    <span className={styles.swipeSnooze}>
                        <Text as="span" variant="body-sm" weight={700} color="inherit">
                            Domani
                        </Text>
                        <AlarmClock size={16} />
                    </span>
                )}
            </div>
            <div className={styles.swipeFront}>{children}</div>
        </div>
    );
}
