import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo/Logo";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    deriveOverallStatus,
    formatIncidentStatus,
    listActiveIncidents,
    listDailyUptime,
    listLatestChecks,
    listRecentIncidents,
    SERVICE_KEYS,
    SERVICE_LABELS,
    type CheckStatus,
    type DailyBucket,
    type OverallStatus,
    type ServiceKey,
    type StatusCheckRow,
    type StatusIncident
} from "@/services/supabase/statusPage";
import styles from "./StatusPage.module.scss";

type ViewState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | {
          phase: "ready";
          latest: Record<ServiceKey, StatusCheckRow | null>;
          uptime: Record<ServiceKey, DailyBucket[]>;
          activeIncidents: StatusIncident[];
          recentIncidents: StatusIncident[];
      };

const BANNER_TEXT: Record<OverallStatus, { title: string; subtext: string }> = {
    operational: {
        title: "Tutti i sistemi operativi",
        subtext: "Tutti i servizi rispondono normalmente."
    },
    partial: {
        title: "Problemi parziali",
        subtext: "Uno o più servizi mostrano anomalie."
    },
    outage: {
        title: "Disservizio in corso",
        subtext: "Diversi servizi non rispondono come previsto."
    },
    unknown: {
        title: "Stato non determinabile",
        subtext: "Nessun check recente disponibile."
    }
};

const STATUS_PILL_LABEL: Record<CheckStatus | "unknown", string> = {
    up: "Operativo",
    degraded: "Degradato",
    down: "Non disponibile",
    unknown: "Sconosciuto"
};

function formatRelativeFromMs(thenMs: number | null, nowMs: number): string {
    if (thenMs === null) return "—";
    const sec = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
    if (sec < 60) return `${sec}s fa`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m fa`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h fa`;
    return `${Math.floor(sec / 86400)}g fa`;
}

function formatAbsolute(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function SeverityBadge({ severity }: { severity: StatusIncident["severity"] }) {
    const label =
        severity === "minor" ? "Minore" : severity === "major" ? "Importante" : "Critico";
    const className =
        severity === "minor"
            ? styles.severity_minor
            : severity === "major"
              ? styles.severity_major
              : styles.severity_critical;
    return <span className={`${styles.incidentBadge} ${className}`}>{label}</span>;
}

function IncidentStatusLabel({ status }: { status: StatusIncident["status"] }) {
    return <span>{formatIncidentStatus(status)}</span>;
}

function IncidentBlock({ incident }: { incident: StatusIncident }) {
    return (
        <div className={styles.incident}>
            <div className={styles.incidentHeader}>
                <span className={styles.incidentTitle}>{incident.title}</span>
                <SeverityBadge severity={incident.severity} />
            </div>
            <div className={styles.incidentMeta}>
                <IncidentStatusLabel status={incident.status} />
                {" · Iniziato "}
                {formatAbsolute(incident.started_at)}
                {incident.resolved_at && ` · Risolto ${formatAbsolute(incident.resolved_at)}`}
            </div>
            {incident.description && (
                <p className={styles.incidentDesc}>{incident.description}</p>
            )}
            {incident.updates.length > 0 && (
                <div className={styles.incidentUpdates}>
                    {[...incident.updates].reverse().map((u, i) => (
                        <div key={i} className={styles.incidentUpdate}>
                            <span className={styles.incidentUpdateTime}>
                                {formatAbsolute(u.timestamp)}
                                {u.status ? ` · ${formatIncidentStatus(u.status)}` : ""}
                            </span>
                            {u.message}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: CheckStatus | "unknown" }) {
    const cls =
        status === "up"
            ? styles.pill_up
            : status === "degraded"
              ? styles.pill_degraded
              : status === "down"
                ? styles.pill_down
                : styles.pill_unknown;
    return (
        <span className={`${styles.serviceStatusPill} ${cls}`}>
            <span className={styles.pill_dot} aria-hidden />
            {STATUS_PILL_LABEL[status]}
        </span>
    );
}

function UptimeBar({ buckets }: { buckets: DailyBucket[] }) {
    return (
        <div className={styles.uptimeRow} role="img" aria-label="Uptime ultimi 90 giorni">
            {buckets.map((b) => {
                const cls =
                    b.worst === "up"
                        ? styles.uptimeBar_up
                        : b.worst === "degraded"
                          ? styles.uptimeBar_degraded
                          : b.worst === "down"
                            ? styles.uptimeBar_down
                            : styles.uptimeBar_unknown;
                const titleStatus =
                    b.worst === "unknown"
                        ? "nessun dato"
                        : STATUS_PILL_LABEL[b.worst].toLowerCase();
                return (
                    <div
                        key={b.date}
                        className={`${styles.uptimeBar} ${cls}`}
                        title={`${b.date} — ${titleStatus} (${b.checkCount} check)`}
                    />
                );
            })}
        </div>
    );
}

function ServiceRow({
    serviceKey,
    latest,
    uptime
}: {
    serviceKey: ServiceKey;
    latest: StatusCheckRow | null;
    uptime: DailyBucket[];
}) {
    const status: CheckStatus | "unknown" = latest?.status ?? "unknown";
    return (
        <div className={styles.serviceRow}>
            <div className={styles.serviceMain}>
                <div className={styles.serviceTopRow}>
                    <span className={styles.serviceName}>{SERVICE_LABELS[serviceKey]}</span>
                    <StatusPill status={status} />
                </div>
                <UptimeBar buckets={uptime} />
                <div className={styles.uptimeMeta}>
                    <span>90 giorni fa</span>
                    <span>Oggi</span>
                </div>
            </div>
        </div>
    );
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export default function StatusPage() {
    usePageTitle("Stato sistema");
    const [view, setView] = useState<ViewState>({ phase: "loading" });
    const [nowTick, setNowTick] = useState<number>(() => Date.now());

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [latest, active, recent, ...uptimeEntries] = await Promise.all([
                    listLatestChecks(),
                    listActiveIncidents(),
                    listRecentIncidents(5),
                    ...SERVICE_KEYS.map((k) => listDailyUptime(k, 90))
                ]);
                if (cancelled) return;
                const uptimeMap = {} as Record<ServiceKey, DailyBucket[]>;
                SERVICE_KEYS.forEach((k, i) => {
                    uptimeMap[k] = uptimeEntries[i] as DailyBucket[];
                });
                setView({
                    phase: "ready",
                    latest,
                    uptime: uptimeMap,
                    activeIncidents: active,
                    recentIncidents: recent
                });
            } catch (err) {
                if (cancelled) return;
                setView({
                    phase: "error",
                    message: err instanceof Error ? err.message : String(err)
                });
            }
        }
        void load();
        // Soft auto-refresh ogni 60s: ritarda la freshness ma non assilla.
        const id = window.setInterval(() => void load(), 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    useEffect(() => {
        const id = window.setInterval(() => setNowTick(Date.now()), 10_000);
        return () => window.clearInterval(id);
    }, []);

    const lastCheckAtMs: number | null = useMemo(() => {
        if (view.phase !== "ready") return null;
        let max = 0;
        for (const key of SERVICE_KEYS) {
            const row = view.latest[key];
            if (!row?.checked_at) continue;
            const t = new Date(row.checked_at).getTime();
            if (Number.isFinite(t) && t > max) max = t;
        }
        return max > 0 ? max : null;
    }, [view]);

    const isStale =
        lastCheckAtMs !== null && nowTick - lastCheckAtMs > STALE_THRESHOLD_MS;

    const overall: OverallStatus = useMemo(() => {
        if (view.phase !== "ready") return "unknown";
        return deriveOverallStatus(view.latest);
    }, [view]);

    const bannerClass =
        overall === "operational"
            ? styles.banner_operational
            : overall === "partial"
              ? styles.banner_partial
              : overall === "outage"
                ? styles.banner_outage
                : styles.banner_unknown;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link
                        to="/"
                        className={styles.logoLink}
                        title="CataloGlobe — Home"
                        aria-label="CataloGlobe — Home"
                    >
                        <Logo variant="icon" color="auto" size={24} alt="" className={styles.logoImage} />
                    </Link>
                    <span className={styles.separator} aria-hidden="true">
                        /
                    </span>
                    <span className={styles.contextLabel}>Stato sistema</span>
                </div>
                <span
                    className={`${styles.headerMeta} ${isStale ? styles.headerMetaStale : ""}`}
                    title={
                        isStale
                            ? "Il monitoring potrebbe essere fermo: ultimo check oltre 10 minuti fa."
                            : undefined
                    }
                >
                    {view.phase === "loading"
                        ? "Caricamento…"
                        : `Ultimo aggiornamento ${formatRelativeFromMs(lastCheckAtMs, nowTick)}`}
                </span>
            </header>

            <main className={styles.main}>
                <div className={`${styles.banner} ${bannerClass}`}>
                    <span className={styles.bannerIcon} aria-hidden />
                    <div className={styles.bannerLabel}>
                        {BANNER_TEXT[overall].title}
                        <div className={styles.bannerSubtext}>
                            {BANNER_TEXT[overall].subtext}
                        </div>
                    </div>
                </div>

                {view.phase === "error" && (
                    <div className={styles.errorBlock}>
                        Errore nel caricamento dello stato: {view.message}
                    </div>
                )}

                {view.phase === "ready" && view.activeIncidents.length > 0 && (
                    <>
                        <h2 className={styles.sectionHeading}>Incident in corso</h2>
                        <div className={styles.incidentsCard}>
                            {view.activeIncidents.map((inc) => (
                                <IncidentBlock key={inc.id} incident={inc} />
                            ))}
                        </div>
                    </>
                )}

                <h2 className={styles.sectionHeading}>Servizi</h2>
                <div className={styles.servicesCard}>
                    {view.phase === "loading" &&
                        SERVICE_KEYS.map((k) => (
                            <div key={k} className={styles.skeletonRow}>
                                <div className={styles.skeletonBar} style={{ width: "60%" }} />
                            </div>
                        ))}
                    {view.phase === "ready" &&
                        SERVICE_KEYS.map((k) => (
                            <ServiceRow
                                key={k}
                                serviceKey={k}
                                latest={view.latest[k]}
                                uptime={view.uptime[k] ?? []}
                            />
                        ))}
                </div>

                {view.phase === "ready" && view.recentIncidents.length > 0 && (
                    <>
                        <h2 className={styles.sectionHeading}>Incident recenti</h2>
                        <div className={styles.incidentsCard}>
                            {view.recentIncidents.map((inc) => (
                                <IncidentBlock key={inc.id} incident={inc} />
                            ))}
                        </div>
                    </>
                )}

                {view.phase === "ready" &&
                    view.activeIncidents.length === 0 &&
                    view.recentIncidents.length === 0 && (
                        <>
                            <h2 className={styles.sectionHeading}>Incident recenti</h2>
                            <div className={styles.incidentsCard}>
                                <div className={styles.emptyIncidents}>
                                    Nessun incident pubblicato negli ultimi giorni.
                                </div>
                            </div>
                        </>
                    )}
            </main>

            <footer className={styles.footer}>
                <span>© 2026 CataloGlobe</span>
                <span aria-hidden>·</span>
                <Link to="/" className={styles.footerLink}>
                    Vai al sito
                </Link>
            </footer>
        </div>
    );
}
