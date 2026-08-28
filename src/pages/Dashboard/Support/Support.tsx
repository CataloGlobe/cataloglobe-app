import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifeBuoy, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/PermissionsContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { getActivities } from "@/services/supabase/activities";
import { getTenantMemberNames } from "@/services/supabase/team";
import { hasUnreadReply, listMyTickets } from "@/services/supabase/support";
import { COMPANY } from "@/config/company";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { V2Activity } from "@/types/activity";
import type { V2SupportTicket } from "@/types/support";
import { SupportCreateDrawer } from "./SupportCreateDrawer";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_VARIANT } from "./supportLabels";
import styles from "./Support.module.scss";

/**
 * Lista delle richieste di supporto dell'azienda.
 *
 * ── Due gate diversi, e non è una svista ────────────────────────────────────
 * LETTURA → `canDoOnTenant("support.read")`, che verifica il solo possesso del
 * permesso. Volutamente più largo di RLS: un manager senza sedi assegnate
 * possiede `support.read` ma `has_permission_any_activity` non lo ammette
 * (nessuna riga in tenant_membership_activities), quindi la lista gli torna
 * vuota. Va bene che arrivi comunque a questa pagina — è qui che trova
 * l'indirizzo email con cui chiedere aiuto lo stesso. Bloccarlo prima lo
 * lascerebbe senza alcuna strada.
 *
 * SCRITTURA → `canDoOnAnyActivity("support.write")`, che replica ESATTAMENTE
 * il backend: permesso posseduto E (ruolo tenant-wide OPPURE almeno una sede
 * assegnata). È la stessa congiunzione dei tre branch di
 * `has_permission_any_activity`. Usare qui `canDoOnTenant` mostrerebbe il
 * pulsante a chi poi si prende un 42501 dalla WITH CHECK.
 */
export default function Support() {
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { permissions } = usePermissions();

    const [tickets, setTickets] = useState<V2SupportTicket[]>([]);
    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [memberNames, setMemberNames] = useState<Map<string, string>>(() => new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const canRead = permissions ? canDoOnTenant(permissions, "support.read") : true;
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "support.write") : false;

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            // In parallelo: le tre fonti sono indipendenti e servono insieme
            // alla prima pittura della lista.
            const [ticketRows, activityRows, names] = await Promise.all([
                listMyTickets(tenantId),
                getActivities(tenantId),
                getTenantMemberNames(tenantId)
            ]);
            setTickets(ticketRows);
            setActivities(activityRows);
            setMemberNames(names);
        } catch {
            showToast({
                message: "Non è stato possibile caricare le richieste.",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        // Nessuna chiamata se il permesso manca: eviterebbe solo di raccogliere
        // un 42501 inutile (pattern della TeamPage).
        if (!canRead) {
            setIsLoading(false);
            return;
        }
        void loadData();
    }, [canRead, loadData]);

    const activityNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const a of activities) map.set(a.id, a.name);
        return map;
    }, [activities]);

    const headerActions = useMemo(() => {
        if (!canWrite) return undefined;
        return (
            <Button variant="primary" onClick={() => setIsDrawerOpen(true)}>
                + Nuova richiesta
            </Button>
        );
    }, [canWrite]);

    // PRIMA di qualsiasi early return: l'header è renderizzato dallo slot
    // centralizzato in MainLayout e l'hook non può stare sotto una condizione.
    usePageHeader({
        title: "Assistenza",
        subtitle: "Rispondiamo dal lunedì al venerdì.",
        actions: headerActions
    });

    if (!canRead) {
        return (
            <div className={styles.locked}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Non hai accesso a questa sezione"
                    description="Contatta il proprietario o un amministratore per ottenere l'accesso."
                />
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Chi non può aprire richieste deve comunque poter chiedere aiuto:
                il canale alternativo è l'email, non un vicolo cieco. */}
            {!canWrite && (
                <div className={styles.fallback}>
                    <Mail size={18} aria-hidden />
                    <span>
                        Per aprire una richiesta scrivi a{" "}
                        <a href={`mailto:${COMPANY.contact.support}`}>
                            {COMPANY.contact.support}
                        </a>
                        .
                    </span>
                </div>
            )}

            {isLoading ? (
                <LoadingState message="Caricamento richieste…" />
            ) : tickets.length === 0 ? (
                <EmptyState
                    icon={<LifeBuoy size={40} strokeWidth={1.5} />}
                    title="Nessuna richiesta"
                    description={
                        canWrite
                            ? "Quando apri una richiesta la trovi qui, con tutte le risposte."
                            : `Per aprire una richiesta scrivi a ${COMPANY.contact.support}.`
                    }
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={() => setIsDrawerOpen(true)}>
                                + Nuova richiesta
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <ul className={styles.list}>
                    {tickets.map(ticket => {
                        const unread = hasUnreadReply(ticket);
                        const author = ticket.created_by
                            ? memberNames.get(ticket.created_by) ?? "Utente rimosso"
                            : "Utente rimosso";
                        const activityName = ticket.activity_id
                            ? activityNames.get(ticket.activity_id)
                            : null;
                        return (
                            <li key={ticket.id}>
                                <button
                                    type="button"
                                    className={styles.row}
                                    onClick={() => navigate(ticket.id)}
                                >
                                    <span
                                        className={styles.dot}
                                        data-unread={unread || undefined}
                                        aria-label={unread ? "Risposta non letta" : undefined}
                                    />
                                    <span className={styles.rowMain}>
                                        <span className={styles.subject} data-unread={unread || undefined}>
                                            {ticket.subject}
                                        </span>
                                        <span className={styles.meta}>
                                            {author}
                                            {activityName ? ` · ${activityName}` : ""}
                                            {` · ${formatDateTimeIt(ticket.last_message_at)}`}
                                        </span>
                                    </span>
                                    <StatusBadge
                                        variant={SUPPORT_STATUS_VARIANT[ticket.status]}
                                        label={SUPPORT_STATUS_LABEL[ticket.status]}
                                    />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {tenantId && (
                <SupportCreateDrawer
                    open={isDrawerOpen}
                    tenantId={tenantId}
                    activities={activities}
                    onClose={() => setIsDrawerOpen(false)}
                    onCreated={ticket => {
                        setIsDrawerOpen(false);
                        showToast({ message: "Richiesta inviata.", type: "success" });
                        // La RPC ritorna la riga intera: si naviga al dettaglio
                        // senza una GET in mezzo.
                        navigate(ticket.id);
                    }}
                />
            )}
        </div>
    );
}
