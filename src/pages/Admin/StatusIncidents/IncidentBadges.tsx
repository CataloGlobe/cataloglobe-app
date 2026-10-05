import { formatDateTimeIt } from "@/utils/formatDateTime";
import { formatIncidentStatus, type IncidentStatus, type StatusIncident } from "@/services/status/statusPage";
import styles from "./StatusIncidentsPage.module.scss";

/** Segna l'aggiornamento ancora in bozza nell'anteprima. */
export const DRAFT_MARK = "bozza";

const SEVERITY_LABEL: Record<StatusIncident["severity"], string> = {
    minor: "Minore",
    major: "Importante",
    critical: "Critico"
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
    const cls =
        status === "investigating"
            ? styles.badge_status_investigating
            : status === "identified"
              ? styles.badge_status_identified
              : status === "monitoring"
                ? styles.badge_status_monitoring
                : styles.badge_status_resolved;
    return <span className={`${styles.badge} ${cls}`}>{formatIncidentStatus(status)}</span>;
}

export function SeverityBadge({ severity }: { severity: StatusIncident["severity"] }) {
    const cls =
        severity === "minor"
            ? styles.badge_minor
            : severity === "major"
              ? styles.badge_major
              : styles.badge_critical;
    return <span className={`${styles.badge} ${cls}`}>{SEVERITY_LABEL[severity]}</span>;
}

/** L'incidente come lo vedranno i clienti su /status (stesso ordine e testi). */
export function CustomerPreview({ incident }: { incident: StatusIncident }) {
    return (
        <div className={styles.preview} aria-label="Come lo vedranno i clienti">
            <div className={styles.previewLabel}>Come lo vedranno i clienti su /status</div>
            <div className={styles.previewCard}>
                <div className={styles.previewHead}>
                    <span className={styles.previewTitle}>{incident.title}</span>
                    <SeverityBadge severity={incident.severity} />
                </div>
                <div className={styles.meta}>
                    {formatIncidentStatus(incident.status)} · Iniziato {formatDateTimeIt(incident.started_at)}
                </div>
                {incident.description && <div className={styles.description}>{incident.description}</div>}
                {incident.updates.length > 0 && (
                    <div className={styles.updateList}>
                        {[...incident.updates].reverse().map((u, i) => (
                            <div key={i} className={styles.updateItem} data-draft={i === 0 && u.timestamp === DRAFT_MARK ? true : undefined}>
                                <span className={styles.updateTime}>
                                    {u.timestamp === DRAFT_MARK ? "Adesso" : formatDateTimeIt(u.timestamp)}
                                    {u.status ? ` · ${formatIncidentStatus(u.status)}` : ""}
                                </span>
                                {u.message}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
