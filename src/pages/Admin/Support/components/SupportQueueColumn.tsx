import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { relativeAgo } from "@/utils/crm/crmHome";
import { crmShortcutLabel, isCrmShortcut, useCrmShortcutsOn } from "@/utils/crm/crmShortcuts";
import {
    groupSupportQueue,
    matchesSupportFilter,
    supportWaitIsLate,
    waitsForUs,
    type SupportQueueFilter
} from "@/utils/supportQueue";
import type { V2SupportTicketWithContext } from "@/types/support";
import styles from "../SupportTicketAdminPage.module.scss";

/**
 * La colonna a sinistra della richiesta (D39): le richieste del filtro scelto,
 * «Aspettano voi» sopra. Alt+J e Alt+K passano alla prossima e alla
 * precedente dentro il filtro (spente dalle Impostazioni, `crmShortcuts.ts`).
 */
export function SupportQueueColumn({
    tickets,
    filter,
    currentId,
    now,
    hrefOf
}: {
    tickets: V2SupportTicketWithContext[];
    filter: SupportQueueFilter;
    currentId: string;
    now: Date;
    hrefOf: (ticketId: string) => string;
}) {
    const navigate = useNavigate();
    const navRef = useRef<HTMLElement>(null);
    const shortcutsOn = useCrmShortcutsOn();

    const groups = useMemo(
        () => groupSupportQueue(tickets.filter(t => matchesSupportFilter(t, filter)), filter),
        [tickets, filter]
    );
    const ordered = useMemo(() => groups.flatMap(g => g.tickets), [groups]);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            const step = isCrmShortcut(event, "j") ? 1 : isCrmShortcut(event, "k") ? -1 : 0;
            if (step === 0 || ordered.length === 0) return;
            if (!navRef.current?.offsetParent) return;
            const at = ordered.findIndex(t => t.id === currentId);
            const target = ordered[at === -1 ? 0 : Math.min(ordered.length - 1, Math.max(0, at + step))];
            if (target && target.id !== currentId) {
                event.preventDefault();
                navigate(hrefOf(target.id));
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [ordered, currentId, navigate, hrefOf]);

    return (
        <nav ref={navRef} className={styles.list} aria-label="Richieste del filtro">
            {shortcutsOn && ordered.length > 1 && (
                <div className={styles.listHead}>
                    <Text as="span" variant="caption" colorVariant="muted">
                        Passa alla prossima
                    </Text>
                    <span
                        className={styles.keys}
                        aria-label={`${crmShortcutLabel("j")} e ${crmShortcutLabel("k")} per passare alla prossima`}
                    >
                        <kbd>{crmShortcutLabel("j")}</kbd>
                        <kbd>{crmShortcutLabel("k")}</kbd>
                    </span>
                </div>
            )}
            {ordered.length === 0 && (
                <Text variant="body-sm" colorVariant="muted" className={styles.listEmpty}>
                    Nessuna richiesta con questo filtro.
                </Text>
            )}
            <div className={styles.listRows}>
                {groups.map(group => (
                    <section key={group.title} aria-label={group.title}>
                        <h2 className={styles.groupHead}>
                            <Text as="span" variant="caption" weight={600} colorVariant="muted">
                                {group.title} · {group.tickets.length}
                            </Text>
                        </h2>
                        <ul className={styles.rows}>
                            {group.tickets.map(t => {
                                const late = supportWaitIsLate(t, now);
                                const ours = waitsForUs(t);
                                return (
                                    <li key={t.id}>
                                        <Link
                                            to={hrefOf(t.id)}
                                            className={styles.listRow}
                                            data-ours={ours || undefined}
                                            data-late={late || undefined}
                                            aria-current={t.id === currentId ? "page" : undefined}
                                        >
                                            <span className={styles.listRowTop}>
                                                <Text as="span" variant="body-sm" weight={700} className={styles.ellipsis}>
                                                    {t.tenants?.name ?? "Azienda sconosciuta"}
                                                </Text>
                                                <Text as="span" variant="caption" weight={late ? 700 : undefined} className={styles.listWhen} data-late={late || undefined}>
                                                    {t.status === "closed" ? "chiusa" : relativeAgo(t.last_message_at, now)}
                                                </Text>
                                            </span>
                                            <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                                {t.subject}
                                            </Text>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </nav>
    );
}
