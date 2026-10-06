import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { adminErrorMessage } from "@/utils/crm/stages";
import {
    addIncidentUpdate,
    deleteIncident,
    formatIncidentStatus,
    listAllIncidents,
    resolveIncident,
    SERVICE_LABELS,
    type IncidentStatus,
    type StatusIncident
} from "@/services/status/statusPage";
import { previewIncidentUpdate } from "@/utils/statusIncidentPreview";
import { IncidentDrawer } from "./IncidentDrawer";
import { CustomerPreview, DRAFT_MARK, IncidentStatusBadge, SeverityBadge } from "./IncidentBadges";
import { StatusBand } from "./StatusBand";
import styles from "./StatusIncidentsPage.module.scss";

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

    const preview = useMemo(() => {
        const p = previewIncidentUpdate(incident, message, nextStatus);
        if (p === incident) return p;
        const updates = [...p.updates];
        updates[updates.length - 1] = { ...updates[updates.length - 1], timestamp: DRAFT_MARK };
        return { ...p, updates };
    }, [incident, message, nextStatus]);

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
            setError(adminErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.updateArea}>
            <form className={styles.addUpdateBlock} onSubmit={submit}>
                <label className={styles.fieldLabel} htmlFor={`upd-${incident.id}`}>
                    Aggiungi aggiornamento
                </label>
                <textarea
                    id={`upd-${incident.id}`}
                    className={styles.textarea}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Per esempio: i tempi sono tornati normali, teniamo d'occhio."
                    disabled={submitting}
                />
                <div className={styles.addUpdateRow}>
                    <select
                        className={`${styles.select} ${styles.statusSelect}`}
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value as IncidentStatus | "")}
                        disabled={submitting}
                        aria-label="Nuovo stato"
                    >
                        <option value="">Stato invariato</option>
                        <option value="investigating">In analisi</option>
                        <option value="identified">Identificato</option>
                        <option value="monitoring">Monitoraggio</option>
                    </select>
                    <button
                        type="submit"
                        className={`${styles.btn} ${styles.btn_primary} ${styles.toolbarBtn}`}
                        disabled={submitting}
                    >
                        {submitting ? "…" : "Pubblica aggiornamento"}
                    </button>
                </div>
                {error && <div className={styles.errorMsg}>{error}</div>}
            </form>
            <CustomerPreview incident={preview} />
        </div>
    );
}

export default function StatusIncidentsPage() {
    usePageTitle("Incidenti");

    const [incidents, setIncidents] = useState<StatusIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
    const [drawerIncident, setDrawerIncident] = useState<StatusIncident | null>(null);

    const [pendingResolveId, setPendingResolveId] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    // L'errore resta nel dialogo, non in un alert del browser.
    const [confirmError, setConfirmError] = useState<string | null>(null);
    // Schede aperte (D40, b2): all'inizio quelle in corso, le risolte chiuse.
    const [openIds, setOpenIds] = useState<Set<string> | null>(null);
    // Cambia dopo ogni scrittura: la banda dello stato si rilegge subito.
    const [bandKey, setBandKey] = useState(0);

    // Due ricaricamenti ravvicinati (Risolvi, poi Pubblica): vince l'ultimo chiesto.
    const loadSeq = useRef(0);
    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        try {
            setLoading(true);
            setLoadError(null);
            const list = await listAllIncidents();
            if (seq !== loadSeq.current) return;
            setIncidents(list);
            setOpenIds(prev => prev ?? new Set(list.filter(i => !i.resolved_at).map(i => i.id)));
            setBandKey(k => k + 1);
        } catch (err) {
            if (seq === loadSeq.current) setLoadError(adminErrorMessage(err));
        } finally {
            if (seq === loadSeq.current) setLoading(false);
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
            setConfirmError(adminErrorMessage(err));
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
            setConfirmError(adminErrorMessage(err));
            return false;
        }
    }

    const openCreate = useCallback(() => {
        setDrawerMode("create");
        setDrawerIncident(null);
        setDrawerOpen(true);
    }, []);

    const headerActions = useMemo(
        () => (
            <>
                <a
                    href="/status"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.btn} ${styles.linkBtn} ${styles.toolbarBtn}`}
                >
                    Vedi /status
                </a>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btn_primary} ${styles.toolbarBtn}`}
                    onClick={openCreate}
                >
                    + Nuovo incidente
                </button>
            </>
        ),
        [openCreate]
    );

    // "Vedi /status" è un link, non un comando: passa da `href`, così anche
    // dentro il kebab resta un `<a>` (middle-click e "apri in nuova scheda"
    // continuano a funzionare).
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        secondaryActions: [
            { label: "Vedi /status", href: "/status", target: "_blank" }
        ],
        primaryAction: { label: "+ Nuovo incidente", onClick: openCreate }
    }), [openCreate]);

    usePageHeader({
        title: "Incidenti",
        actions: headerActions,
        compact: headerCompact
    });

    function toggle(id: string) {
        setOpenIds(prev => {
            const next = new Set(prev ?? []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function openEdit(inc: StatusIncident) {
        setDrawerMode("edit");
        setDrawerIncident(inc);
        setDrawerOpen(true);
    }

    return (
        <>
            <main className={styles.main}>
                <StatusBand refreshKey={bandKey} />

                {loadError && (
                    <div className={styles.errorMsg} role="alert">
                        Errore nel caricamento: {loadError}
                    </div>
                )}

                {!loading && incidents.length === 0 && !loadError && (
                    <div className={styles.empty}>Nessun incidente pubblicato.</div>
                )}

                <div className={styles.list}>
                    {incidents.map((inc) => {
                        const isOpen = openIds?.has(inc.id) ?? false;
                        const last = inc.updates.at(-1);
                        return (
                            <div key={inc.id} className={styles.card} data-open={isOpen || undefined}>
                                <button
                                    type="button"
                                    className={styles.cardToggle}
                                    onClick={() => toggle(inc.id)}
                                    aria-expanded={isOpen}
                                    aria-controls={`inc-${inc.id}`}
                                >
                                    <span className={styles.cardToggleMain}>
                                        <span className={styles.cardTitle}>{inc.title}</span>
                                        <span className={styles.meta}>
                                            Iniziato {formatDateTimeIt(inc.started_at)}
                                            {inc.resolved_at && ` · Risolto ${formatDateTimeIt(inc.resolved_at)}`}
                                            {inc.affected_services.length > 0 &&
                                                ` · ${inc.affected_services
                                                    .map((s) => SERVICE_LABELS[s as keyof typeof SERVICE_LABELS] ?? s)
                                                    .join(", ")}`}
                                        </span>
                                        {!isOpen && last && <span className={styles.lastUpdate}>{last.message}</span>}
                                    </span>
                                    <span className={styles.cardBadges}>
                                        <SeverityBadge severity={inc.severity} />
                                        <IncidentStatusBadge status={inc.status} />
                                        <ChevronDown
                                            size={16}
                                            aria-hidden="true"
                                            className={`${styles.cardChevron} ${isOpen ? styles.chevronOpen : ""}`}
                                        />
                                    </span>
                                </button>
                                {isOpen && (
                                    <div id={`inc-${inc.id}`} className={styles.cardBody}>
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
                                        {inc.resolved_at ? (
                                            inc.updates.length > 0 && (
                                                <div className={styles.updateList}>
                                                    {[...inc.updates].reverse().map((u, i) => (
                                                        <div key={i} className={styles.updateItem}>
                                                            <span className={styles.updateTime}>
                                                                {formatDateTimeIt(u.timestamp)}
                                                                {u.status ? ` · ${formatIncidentStatus(u.status)}` : ""}
                                                            </span>
                                                            {u.message}
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        ) : (
                                            <AddUpdateBlock incident={inc} onSaved={load} />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                onClose={() => {
                    setPendingResolveId(null);
                    setConfirmError(null);
                }}
                onConfirm={confirmResolve}
                error={confirmError}
                title="Marcare come risolto"
                message="Confermi di marcare questo incidente come risolto?"
                confirmLabel="Risolvi"
                confirmVariant="primary"
            />

            <ConfirmDialog
                isOpen={pendingDeleteId !== null}
                onClose={() => {
                    setPendingDeleteId(null);
                    setConfirmError(null);
                }}
                onConfirm={confirmDelete}
                error={confirmError}
                title="Elimina incidente"
                message="Eliminare definitivamente questo incidente? L'azione non può essere annullata."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />
        </>
    );
}
