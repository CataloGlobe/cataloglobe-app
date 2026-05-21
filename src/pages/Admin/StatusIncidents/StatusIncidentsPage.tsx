import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logoHorizontal from "@/assets/brand/logo-horizontal.png";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    addIncidentUpdate,
    deleteIncident,
    listAllIncidents,
    resolveIncident,
    SERVICE_LABELS,
    type IncidentStatus,
    type StatusIncident
} from "@/services/supabase/statusPage";
import { IncidentDrawer } from "./IncidentDrawer";
import styles from "./StatusIncidentsPage.module.scss";

function formatAbsolute(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

const SEVERITY_LABEL: Record<StatusIncident["severity"], string> = {
    minor: "Minore",
    major: "Importante",
    critical: "Critico"
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
    investigating: "In analisi",
    identified: "Identificato",
    monitoring: "Monitoraggio",
    resolved: "Risolto"
};

function StatusBadge({ status }: { status: IncidentStatus }) {
    const cls =
        status === "investigating"
            ? styles.badge_status_investigating
            : status === "identified"
              ? styles.badge_status_identified
              : status === "monitoring"
                ? styles.badge_status_monitoring
                : styles.badge_status_resolved;
    return <span className={`${styles.badge} ${cls}`}>{STATUS_LABEL[status]}</span>;
}

function SeverityBadge({ severity }: { severity: StatusIncident["severity"] }) {
    const cls =
        severity === "minor"
            ? styles.badge_minor
            : severity === "major"
              ? styles.badge_major
              : styles.badge_critical;
    return <span className={`${styles.badge} ${cls}`}>{SEVERITY_LABEL[severity]}</span>;
}

function AddUpdateBlock({
    incident,
    onSaved
}: {
    incident: StatusIncident;
    onSaved: () => void;
}) {
    const [message, setMessage] = useState("");
    const [nextStatus, setNextStatus] = useState<IncidentStatus | "">("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!message.trim()) {
            setError("Messaggio obbligatorio.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await addIncidentUpdate(
                incident.id,
                message.trim(),
                nextStatus || undefined
            );
            setMessage("");
            setNextStatus("");
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form className={styles.addUpdateBlock} onSubmit={submit}>
            <div className={styles.fieldLabel}>Aggiungi aggiornamento</div>
            <div className={styles.addUpdateRow}>
                <input
                    type="text"
                    className={styles.input}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Stiamo verificando il backend Postgres…"
                    disabled={submitting}
                />
                <select
                    className={styles.select}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as IncidentStatus | "")}
                    disabled={submitting}
                    style={{ maxWidth: 200 }}
                >
                    <option value="">— Stato invariato —</option>
                    <option value="investigating">In analisi</option>
                    <option value="identified">Identificato</option>
                    <option value="monitoring">Monitoraggio</option>
                </select>
                <button
                    type="submit"
                    className={`${styles.btn} ${styles.btn_primary}`}
                    disabled={submitting}
                >
                    {submitting ? "…" : "Aggiungi"}
                </button>
            </div>
            {error && <div className={styles.errorMsg}>{error}</div>}
        </form>
    );
}

export default function StatusIncidentsPage() {
    usePageTitle("Status incidents (admin)");

    const [incidents, setIncidents] = useState<StatusIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
    const [drawerIncident, setDrawerIncident] = useState<StatusIncident | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const list = await listAllIncidents(50);
            setIncidents(list);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleResolve(id: string) {
        const ok = window.confirm("Marcare questo incident come risolto?");
        if (!ok) return;
        try {
            await resolveIncident(id);
            await load();
        } catch (err) {
            window.alert(`Errore: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async function handleDelete(id: string) {
        const ok = window.confirm("Eliminare definitivamente questo incident?");
        if (!ok) return;
        try {
            await deleteIncident(id);
            await load();
        } catch (err) {
            window.alert(`Errore: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    function openCreate() {
        setDrawerMode("create");
        setDrawerIncident(null);
        setDrawerOpen(true);
    }

    function openEdit(inc: StatusIncident) {
        setDrawerMode("edit");
        setDrawerIncident(inc);
        setDrawerOpen(true);
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Link to="/" className={styles.brandLeft} style={{ textDecoration: "none", color: "inherit" }}>
                    <img src={logoHorizontal} alt="CataloGlobe" className={styles.logoImg} />
                    <span className={styles.title}>Status incidents (admin)</span>
                </Link>
                <Link to="/status" className={styles.btn} style={{ textDecoration: "none" }}>
                    Vedi /status
                </Link>
            </header>

            <main className={styles.main}>
                <div className={styles.toolbar}>
                    <div>
                        <div className={styles.heading}>Incident</div>
                        <div className={styles.subheading}>
                            Pubblica un incident per comunicare disservizi ai clienti.
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btn_primary}`}
                        onClick={openCreate}
                    >
                        + Nuovo incident
                    </button>
                </div>

                {loadError && (
                    <div className={styles.errorMsg} style={{ marginBottom: "1rem" }}>
                        Errore nel caricamento: {loadError}
                    </div>
                )}

                {!loading && incidents.length === 0 && !loadError && (
                    <div className={styles.empty}>Nessun incident pubblicato.</div>
                )}

                <div className={styles.list}>
                    {incidents.map((inc) => (
                        <div key={inc.id} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardTitle}>{inc.title}</div>
                                <div className={styles.cardBadges}>
                                    <SeverityBadge severity={inc.severity} />
                                    <StatusBadge status={inc.status} />
                                </div>
                            </div>
                            <div className={styles.meta}>
                                Iniziato {formatAbsolute(inc.started_at)}
                                {inc.resolved_at &&
                                    ` · Risolto ${formatAbsolute(inc.resolved_at)}`}
                            </div>
                            {inc.affected_services.length > 0 && (
                                <div className={styles.services}>
                                    {inc.affected_services.map((s) => (
                                        <span key={s} className={styles.servicePill}>
                                            {SERVICE_LABELS[s as keyof typeof SERVICE_LABELS] ?? s}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {inc.description && (
                                <div className={styles.description}>{inc.description}</div>
                            )}
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.btn}
                                    onClick={() => openEdit(inc)}
                                >
                                    Modifica
                                </button>
                                {!inc.resolved_at && (
                                    <button
                                        type="button"
                                        className={styles.btn}
                                        onClick={() => handleResolve(inc.id)}
                                    >
                                        Risolvi
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btn_danger}`}
                                    onClick={() => handleDelete(inc.id)}
                                >
                                    Elimina
                                </button>
                            </div>
                            {inc.updates.length > 0 && (
                                <div className={styles.updateList}>
                                    {[...inc.updates].reverse().map((u, i) => (
                                        <div key={i} className={styles.updateItem}>
                                            <span className={styles.updateTime}>
                                                {formatAbsolute(u.timestamp)}
                                                {u.status ? ` · ${STATUS_LABEL[u.status]}` : ""}
                                            </span>
                                            {u.message}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!inc.resolved_at && (
                                <AddUpdateBlock incident={inc} onSaved={load} />
                            )}
                        </div>
                    ))}
                </div>
            </main>

            <IncidentDrawer
                open={drawerOpen}
                mode={drawerMode}
                incident={drawerIncident}
                onClose={() => setDrawerOpen(false)}
                onSaved={() => void load()}
            />
        </div>
    );
}
