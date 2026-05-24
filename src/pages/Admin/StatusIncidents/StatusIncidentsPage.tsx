import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logoMark from "@/assets/brand/logo-mark.png";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    addIncidentUpdate,
    deleteIncident,
    formatIncidentStatus,
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

function StatusBadge({ status }: { status: IncidentStatus }) {
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
    usePageTitle("Status incidents");

    const [incidents, setIncidents] = useState<StatusIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
    const [drawerIncident, setDrawerIncident] = useState<StatusIncident | null>(null);

    const [pendingResolveId, setPendingResolveId] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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

    async function confirmResolve(): Promise<boolean> {
        if (!pendingResolveId) return false;
        try {
            await resolveIncident(pendingResolveId);
            await load();
            return true;
        } catch (err) {
            window.alert(`Errore: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    async function confirmDelete(): Promise<boolean> {
        if (!pendingDeleteId) return false;
        try {
            await deleteIncident(pendingDeleteId);
            await load();
            return true;
        } catch (err) {
            window.alert(`Errore: ${err instanceof Error ? err.message : String(err)}`);
            return false;
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
                <div className={styles.headerLeft}>
                    <Link
                        to="/"
                        className={styles.logoLink}
                        title="CataloGlobe — Home"
                        aria-label="CataloGlobe — Home"
                    >
                        <img src={logoMark} alt="" height={24} className={styles.logoImage} />
                    </Link>
                    <span className={styles.separator} aria-hidden="true">
                        /
                    </span>
                    <span className={styles.contextLabel}>Status incidents (admin)</span>
                </div>
                <div className={styles.headerRight}>
                    <Link to="/dashboard" className={styles.btn} style={{ textDecoration: "none" }}>
                        ← Torna alla dashboard
                    </Link>
                    <a
                        href="/status"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.btn}
                        style={{ textDecoration: "none" }}
                    >
                        Vedi /status
                    </a>
                </div>
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
                                        onClick={() => setPendingResolveId(inc.id)}
                                    >
                                        Risolvi
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btn_danger}`}
                                    onClick={() => setPendingDeleteId(inc.id)}
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
                                                {u.status ? ` · ${formatIncidentStatus(u.status)}` : ""}
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

            <ConfirmDialog
                isOpen={pendingResolveId !== null}
                onClose={() => setPendingResolveId(null)}
                onConfirm={confirmResolve}
                title="Marcare come risolto"
                message="Confermi di marcare questo incident come risolto?"
                confirmLabel="Risolvi"
                confirmVariant="primary"
            />

            <ConfirmDialog
                isOpen={pendingDeleteId !== null}
                onClose={() => setPendingDeleteId(null)}
                onConfirm={confirmDelete}
                title="Elimina incident"
                message="Eliminare definitivamente questo incident? L'azione non può essere annullata."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />
        </div>
    );
}
