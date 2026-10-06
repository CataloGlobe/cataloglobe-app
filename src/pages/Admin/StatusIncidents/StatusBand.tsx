import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import {
    deriveOverallStatus,
    fetchStatusOverview,
    formatIncidentStatus,
    SERVICE_KEYS,
    SERVICE_LABELS,
    type StatusOverview
} from "@/services/status/statusPage";
import { STATUS_BANNER_TITLE, STATUS_SERVICE_LABEL } from "@/utils/statusIncidentPreview";
import styles from "./StatusIncidentsPage.module.scss";

/**
 * Banda dello stato in cima a Incidenti (D40, b2): lo stato dei quattro
 * servizi come lo vedono i clienti, dagli stessi dati di /status
 * (`/api/status`). «Ingrandisci» la apre sul posto con il resto della pagina:
 * ultimo controllo per servizio, incidenti in corso e recenti.
 * `refreshKey` cambia quando la pagina pubblica o risolve qualcosa.
 */
export function StatusBand({ refreshKey }: { refreshKey: number }) {
    const [overview, setOverview] = useState<StatusOverview | null>(null);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setOverview(await fetchStatusOverview());
            setFailed(false);
        } catch {
            // In locale /api risponde solo con `vercel dev`: la banda lo dice
            // e il resto della pagina funziona.
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        void load();
        // Scheda nascosta: niente richieste; tornando visibile si rilegge subito.
        const id = window.setInterval(() => {
            if (!document.hidden) void load();
        }, 60_000);
        const onVisible = () => {
            if (!document.hidden) void load();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [load, refreshKey]);

    const overall = overview ? deriveOverallStatus(overview.latest) : "unknown";
    const title = failed && !overview ? "Stato non leggibile adesso" : STATUS_BANNER_TITLE[overall];

    return (
        <section className={styles.band} data-overall={failed && !overview ? "unknown" : overall} aria-label="Stato come lo vedono i clienti">
            <div className={styles.bandRow}>
                <span className={styles.bandDot} aria-hidden="true" />
                <Text as="span" variant="body-sm" weight={700} className={styles.bandTitle}>
                    {title}
                </Text>
                <ul className={styles.bandServices}>
                    {SERVICE_KEYS.map(key => {
                        const status = overview?.latest[key]?.status ?? "unknown";
                        return (
                            <li key={key} className={styles.bandService} data-status={status}>
                                <span className={styles.bandServiceDot} aria-hidden="true" />
                                <Text as="span" variant="caption">
                                    {SERVICE_LABELS[key]}
                                    <span className="visually-hidden">: {STATUS_SERVICE_LABEL[status]}</span>
                                </Text>
                            </li>
                        );
                    })}
                </ul>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(o => !o)}
                    aria-expanded={open}
                    rightIcon={<ChevronDown size={14} className={open ? styles.chevronOpen : undefined} />}
                >
                    {open ? "Riduci" : "Ingrandisci"}
                </Button>
            </div>

            {open && (
                <div className={styles.bandBody}>
                    {failed && (
                        <Text as="p" variant="caption" colorVariant="muted">
                            {overview
                                ? "L'ultimo aggiornamento non è riuscito: i dati sono del controllo precedente."
                                : "Non riusciamo a leggere lo stato dei servizi. Riprova tra un minuto o apri /status."}
                        </Text>
                    )}
                    {overview && (
                        <div className={styles.bandGrid}>
                            <div>
                                <Text as="h3" variant="caption" weight={700} colorVariant="muted" className={styles.bandHeading}>
                                    Servizi
                                </Text>
                                <ul className={styles.bandList}>
                                    {SERVICE_KEYS.map(key => {
                                        const row = overview.latest[key];
                                        const status = row?.status ?? "unknown";
                                        return (
                                            <li key={key} className={styles.bandListRow}>
                                                <Text as="span" variant="body-sm">
                                                    {SERVICE_LABELS[key]}
                                                </Text>
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    {row
                                                        ? `${row.responseTimeMs != null ? `${row.responseTimeMs} ms · ` : ""}${formatDateTimeIt(row.checkedAt)}`
                                                        : "mai controllato"}
                                                </Text>
                                                <span className={styles.bandService} data-status={status}>
                                                    <span className={styles.bandServiceDot} aria-hidden="true" />
                                                    <Text as="span" variant="caption" weight={600}>
                                                        {STATUS_SERVICE_LABEL[status]}
                                                    </Text>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                            <div>
                                <Text as="h3" variant="caption" weight={700} colorVariant="muted" className={styles.bandHeading}>
                                    Incident in corso
                                </Text>
                                {!overview.incidentsAvailable ? (
                                    <Text as="p" variant="caption" colorVariant="muted">
                                        Gli incidenti non sono leggibili in questo momento.
                                    </Text>
                                ) : overview.activeIncidents.length === 0 ? (
                                    <Text as="p" variant="caption" colorVariant="muted">
                                        Nessuno: i clienti non vedono avvisi.
                                    </Text>
                                ) : (
                                    <ul className={styles.bandList}>
                                        {overview.activeIncidents.map(inc => (
                                            <li key={inc.id} className={styles.bandIncident}>
                                                <Text as="span" variant="body-sm" weight={600}>
                                                    {inc.title} · {formatIncidentStatus(inc.status)}
                                                </Text>
                                                {inc.updates.at(-1) && (
                                                    <Text as="span" variant="caption" colorVariant="muted">
                                                        {inc.updates.at(-1)?.message}
                                                    </Text>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {overview.incidentsAvailable && overview.recentIncidents.length > 0 && (
                                    <>
                                        <Text as="h3" variant="caption" weight={700} colorVariant="muted" className={styles.bandHeading}>
                                            Incident recenti
                                        </Text>
                                        <ul className={styles.bandList}>
                                            {overview.recentIncidents.slice(0, 3).map(inc => (
                                                <li key={inc.id}>
                                                    <Text as="span" variant="caption" colorVariant="muted">
                                                        {formatDateTimeIt(inc.started_at)} · {inc.title} · {formatIncidentStatus(inc.status)}
                                                    </Text>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
