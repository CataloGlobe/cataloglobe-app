import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { todayIsoDate } from "@/utils/dateLocal";
import { PENDING_QUEUE_LIMIT } from "@/services/supabase/reservations";
import {
    TableAssignmentBadge,
    type TableAssignmentView
} from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

interface Props {
    /** Pending reservations within the current scope (already filtered). */
    pendingItems: V2Reservation[];
    /**
     * True se il server ha più pending del tetto (`PENDING_QUEUE_LIMIT`): la
     * coda mostrata è la più vecchia, non tutta. Si dice, non si tace.
     */
    truncated?: boolean;
    /** Tavoli assegnati per prenotazione: aiuta a decidere se confermare. */
    tableViews: ReadonlyMap<string, TableAssignmentView>;
    /** Per-row gate: action buttons only render if the caller has manage on that activity. */
    canManageActivity: (activityId: string) => boolean;
    /** Click row → open detail drawer. */
    onOpenDetail: (r: V2Reservation) => void;
    /** Inline action — caller schedules deferred commit + shows undo toast. */
    onAction: (r: V2Reservation, action: DeferredAction) => void;
}

function formatRowDate(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = todayIsoDate();
    if (isoDate === today) return "Oggi";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    if (isoDate === tIso) return "Domani";
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
    }).format(dt);
}

// Il numero è la costante del service, non una cifra scritta a mano: se il
// tetto cambia, il banner lo segue.
const PENDING_TRUNCATED_TEXT = `Queste sono le ${PENDING_QUEUE_LIMIT} richieste in attesa da più tempo. Ce ne sono altre, che compaiono man mano che gestisci queste.`;

export default function ReservationsInbox({
    pendingItems,
    truncated = false,
    tableViews,
    canManageActivity,
    onOpenDetail,
    onAction
}: Props) {
    const today = todayIsoDate();

    const { live, stale } = useMemo(() => {
        const liveItems: V2Reservation[] = [];
        const staleItems: V2Reservation[] = [];
        for (const r of pendingItems) {
            if (r.reservation_date >= today) liveItems.push(r);
            else staleItems.push(r);
        }
        const ascend = (a: V2Reservation, b: V2Reservation) => {
            if (a.reservation_date !== b.reservation_date) {
                return a.reservation_date.localeCompare(b.reservation_date);
            }
            return a.reservation_time.localeCompare(b.reservation_time);
        };
        liveItems.sort(ascend);
        staleItems.sort(ascend);
        return { live: liveItems, stale: staleItems };
    }, [pendingItems, today]);

    // Il tetto vale per la coda della sede: l'avviso dice che non è tutta.
    const truncatedNotice = truncated ? (
        <div className={styles.inboxNotice}>
            <InlineBanner variant="warning">{PENDING_TRUNCATED_TEXT}</InlineBanner>
        </div>
    ) : null;

    // Riga di sistema a 56 (la coda si legge una per una, non a colpo
    // d'occhio). I due bottoni sono controlli del trailing: il clic si ferma
    // lì, e ListRow ignora i tasti che non arrivano dalla riga stessa — Invio
    // su «Conferma» conferma, non apre il dettaglio.
    // Le scadute non sono `muted`: una riga muta non si apre, e il dettaglio
    // di una richiesta scaduta serve. Le separa l'intestazione «Scadute».
    const renderRow = (r: V2Reservation, isStale: boolean) => {
        const canManage = canManageActivity(r.activity_id);
        const tableView = tableViews.get(r.id);
        const when = `${formatRowDate(r.reservation_date)} · ${r.reservation_time.slice(0, 5)} · ${r.party_size} ${r.party_size === 1 ? "persona" : "persone"}`;
        return (
            <ListRow
                key={r.id}
                onClick={() => onOpenDetail(r)}
                muted={isStale}
                leading={<ChannelMark source={r.source} />}
                title={r.customer_name}
                subtitle={
                    <>
                        {when}
                        {r.notes && (
                            <>
                                <br />
                                <MessageSquare
                                    size={12}
                                    strokeWidth={2}
                                    aria-hidden
                                    className={styles.rowNoteIconInline}
                                />{" "}
                                {r.notes}
                            </>
                        )}
                    </>
                }
                wrapSubtitle={Boolean(r.notes)}
                meta={tableView ? <TableAssignmentBadge view={tableView} /> : undefined}
                trailing={
                    canManage ? (
                        <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" onClick={() => onAction(r, "decline")}>
                                Rifiuta
                            </Button>
                            {!isStale && (
                                <Button variant="primary" size="sm" onClick={() => onAction(r, "confirm")}>
                                    Conferma
                                </Button>
                            )}
                        </div>
                    ) : undefined
                }
            />
        );
    };

    return (
        <>
            {truncatedNotice}
            {live.map(r => renderRow(r, false))}
            {stale.length > 0 && (
                <>
                    <div className={styles.inboxStaleHeader}>
                        <Text as="h3" variant="caption-xs" weight={600} className={styles.sectionLabel}>
                            Scadute · {stale.length}
                        </Text>
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.sectionHint}>
                            Richieste per date già passate, mai gestite.
                        </Text>
                    </div>
                    {stale.map(r => renderRow(r, true))}
                </>
            )}
        </>
    );
}
