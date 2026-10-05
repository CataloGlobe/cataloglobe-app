import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import Text from "@/components/ui/Text/Text";
import type { CrmAppointmentWithVenue } from "@/types/crm";
import { romeDayLabel, type HomeTodo, type SinceMorning } from "@/utils/crm/crmHome";
import { TileState } from "./TileState";
import styles from "../Home.module.scss";

const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" });

/**
 * La Home al telefono (canvas U8a): data e saluto, «Da stamattina» in una
 * riga, la bozza più urgente aperta con «Inviala così», poi un elenco solo
 * con il resto da fare e l'agenda di oggi, e l'obiettivo della settimana.
 */
export function HomePhone({
    now,
    name,
    morning,
    todos,
    firstDraftKey,
    agenda,
    nameOf,
    loading,
    error,
    onRetry,
    busyKey,
    actionError,
    onSend,
    goal
}: {
    now: Date;
    name: string | null;
    morning: SinceMorning | null;
    todos: HomeTodo[];
    firstDraftKey: string | null;
    agenda: CrmAppointmentWithVenue[];
    nameOf: (userId: string | null) => string | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    busyKey: string | null;
    actionError: string | null;
    onSend: (todo: HomeTodo) => void;
    goal: { done: number; target: number } | null;
}) {
    const navigate = useNavigate();
    const first = todos.find(t => t.key === firstDraftKey) ?? null;
    const rest = todos.filter(t => t.key !== firstDraftKey);

    return (
        <div className={styles.page}>
            <header className={styles.phoneHeader}>
                <Text as="span" variant="caption" colorVariant="muted">
                    {romeDayLabel(now)}
                </Text>
                <Text as="h1" variant="title-md" weight={700}>
                    {name ? `Ciao ${name}` : "Ciao"}
                </Text>
                {morning && (
                    <Text as="p" variant="caption" colorVariant="muted" className={styles.phoneMorning}>
                        Da stamattina: {morning.newLeads} {morning.newLeads === 1 ? "nuovo" : "nuovi"} · {morning.replied}{" "}
                        {morning.replied === 1 ? "risposta" : "risposte"} · {morning.calls.length}{" "}
                        {morning.calls.length === 1 ? "telefonata fissata" : "telefonate fissate"}
                    </Text>
                )}
            </header>

            <TileState loading={loading} error={error} onRetry={onRetry}>
                {actionError && (
                    <Text as="p" variant="body-sm" colorVariant="error" role="alert" className={styles.phoneEmpty}>
                        {actionError}
                    </Text>
                )}
                {first && (
                    <section className={styles.phoneDraft} data-level={first.level} aria-label={`Bozza per ${first.venueName}`}>
                        <div className={styles.phoneDraftHead}>
                            <Text as="span" variant="caption" weight={700} className={styles.phoneDraftTitle}>
                                Bozza per {first.venueName}
                            </Text>
                            {first.wait && (
                                <Text as="span" variant="caption" className={styles.wait} data-level={first.level}>
                                    {first.wait}
                                </Text>
                            )}
                        </div>
                        <Text as="p" variant="body">
                            {first.draftText}
                        </Text>
                        <div className={styles.phoneDraftActions}>
                            <Button
                                variant="primary"
                                loading={busyKey === first.key}
                                disabled={busyKey !== null && busyKey !== first.key}
                                onClick={() => onSend(first)}
                                className={styles.phoneGrow}
                            >
                                Inviala così
                            </Button>
                            <Button variant="secondary" onClick={() => navigate(`/admin/lead/${first.venueId}?bozza=modifica`)}>
                                Modifica
                            </Button>
                        </div>
                    </section>
                )}

                {(rest.length > 0 || agenda.length > 0) && (
                    <ul className={`${styles.rows} ${styles.phoneList}`}>
                        {rest.map(t => (
                            <li key={t.key}>
                                <Link to={`/admin/lead/${t.venueId}`} className={styles.phoneRow} data-level={t.level}>
                                    <Text as="span" variant="body-sm" className={styles.todoText}>
                                        {t.kind === "outcome" ? (
                                            <>
                                                Esito <strong>{t.venueName}</strong>
                                            </>
                                        ) : t.kind === "unassigned" ? (
                                            <>
                                                <strong>{t.venueName}</strong> senza nessuno
                                            </>
                                        ) : (
                                            <>
                                                Bozza per <strong>{t.venueName}</strong>
                                            </>
                                        )}
                                    </Text>
                                    {t.kind !== "outcome" && t.wait ? (
                                        <Text as="span" variant="caption" className={styles.wait} data-level={t.level}>
                                            {t.wait}
                                        </Text>
                                    ) : (
                                        <ChevronRight size={16} aria-hidden="true" className={styles.phoneChevron} />
                                    )}
                                </Link>
                            </li>
                        ))}
                        {agenda.map(a => (
                            <li key={a.id}>
                                <Link to={`/admin/lead/${a.venue_id}`} className={styles.phoneRow}>
                                    <Text as="span" variant="body-sm" weight={700} className={styles.agendaTime}>
                                        {HOUR.format(new Date(a.starts_at))}
                                    </Text>
                                    <span className={styles.agendaBody}>
                                        <Text as="span" variant="body-sm">
                                            {a.venue_name}
                                        </Text>
                                        {nameOf(a.caller_user_id) && (
                                            <Text as="span" variant="caption" colorVariant="muted">
                                                chiama {nameOf(a.caller_user_id)}
                                            </Text>
                                        )}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {!first && rest.length === 0 && agenda.length === 0 && (
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.phoneEmpty}>
                        Niente da fare adesso.
                    </Text>
                )}
            </TileState>

            {goal && (
                <div className={styles.phoneGoal}>
                    <Text as="span" variant="body-sm" colorVariant="muted">
                        Obiettivo della settimana
                    </Text>
                    <ProgressBar
                        value={Math.min(goal.done, goal.target)}
                        max={goal.target}
                        label={`${goal.done} di ${goal.target}`}
                        inline
                        aria-label={`${goal.done} telefonate fissate su ${goal.target}`}
                        className={styles.phoneGoalBar}
                    />
                </div>
            )}
        </div>
    );
}
