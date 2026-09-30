import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, LifeBuoy, Mail } from "lucide-react";
import { PageGate } from "@/components/PageGate/PageGate";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
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
 *
 * ── Niente guardia dell'abbonamento, di proposito ──────────────────────────
 * Aprire e rispondere a una richiesta NON passano da `useEnsureActive`: con
 * l'abbonamento fermo l'Assistenza è proprio la strada per sbloccarlo (S3,
 * §50.14). Tutte le altre scritture del pannello la usano.
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
    const [loadError, setLoadError] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Gate di lettura prima di ogni fetch: finché i permessi non ci sono non
    // parte niente (prima era ottimista e la lista si chiedeva comunque).
    const canRead = permissions != null && canDoOnTenant(permissions, "support.read");
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "support.write") : false;

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        setLoadError(false);
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
        } catch (error) {
            // Un errore non è una lista vuota: la pagina lo dice, con «Riprova».
            console.error("Caricamento richieste di supporto:", error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        if (!canRead) return;
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
    // In compatto resta la sola CTA; senza `support.write` nessuna config
    // (un `{primaryAction: undefined}` darebbe una barra compatta vuota).
    const headerCompact = useMemo<PageHeaderCompactConfig | undefined>(
        () => canWrite
            ? { primaryAction: { label: "+ Nuova richiesta", onClick: () => setIsDrawerOpen(true) } }
            : undefined,
        [canWrite]
    );

    usePageHeader({ actions: headerActions, compact: headerCompact });

    if (permissions != null && !canRead) {
        return <PageGate readPermission="support.read" scope="tenant">{() => null}</PageGate>;
    }

    const mailLink = (
        <a href={`mailto:${COMPANY.contact.support}`}>{COMPANY.contact.support}</a>
    );

    let content;
    if (isLoading || permissions == null) {
        content = (
            <Card flush>
                <div aria-busy="true" aria-label="Caricamento richieste">
                    <ListRow loading />
                    <ListRow loading />
                    <ListRow loading />
                </div>
            </Card>
        );
    } else if (loadError) {
        content = (
            <EmptyState
                variant="page"
                icon={<LifeBuoy />}
                title="Non è stato possibile caricare le richieste"
                description="Controlla la connessione e riprova."
                action={
                    <Button variant="secondary" onClick={() => void loadData()}>
                        Riprova
                    </Button>
                }
            />
        );
    } else if (tickets.length === 0) {
        content = canWrite ? (
            <EmptyState
                variant="page"
                icon={<LifeBuoy />}
                title="Nessuna richiesta"
                description="Quando apri una richiesta la trovi qui, con tutte le risposte."
                action={
                    <Button variant="primary" onClick={() => setIsDrawerOpen(true)}>
                        + Nuova richiesta
                    </Button>
                }
            />
        ) : (
            <EmptyState
                variant="inline"
                icon={<LifeBuoy />}
                title="Nessuna richiesta"
                description={`Per aprire una richiesta scrivi a ${COMPANY.contact.support}.`}
            />
        );
    } else {
        content = (
            <Card flush>
                {tickets.map(ticket => {
                    const unread = hasUnreadReply(ticket);
                    const author = ticket.created_by
                        ? memberNames.get(ticket.created_by) ?? "Utente rimosso"
                        : "Utente rimosso";
                    const activityName = ticket.activity_id
                        ? activityNames.get(ticket.activity_id)
                        : null;
                    return (
                        <ListRow
                            key={ticket.id}
                            title={ticket.subject}
                            subtitle={[author, activityName, formatDateTimeIt(ticket.last_message_at)]
                                .filter(Boolean)
                                .join(" · ")}
                            meta={
                                <>
                                    {/* La risposta non letta si dice con una
                                        parola, non con un pallino (regola 8). */}
                                    {unread && <Badge variant="brand">Risposta nuova</Badge>}
                                    <StatusBadge
                                        variant={SUPPORT_STATUS_VARIANT[ticket.status]}
                                        label={SUPPORT_STATUS_LABEL[ticket.status]}
                                    />
                                </>
                            }
                            trailing={<ChevronRight size={16} aria-hidden />}
                            onClick={() => navigate(ticket.id)}
                        />
                    );
                })}
            </Card>
        );
    }

    return (
        <div className={styles.page}>
            {/* Gli orari stavano nel sottotitolo della testata, che lo slot non
                rende: qui li legge chi apre la pagina (S2). */}
            <Text as="p" variant="caption" colorVariant="muted">
                Rispondiamo dal lunedì al venerdì.
            </Text>

            {/* Chi non può aprire richieste deve comunque poter chiedere aiuto:
                il canale alternativo è l'email, non un vicolo cieco. */}
            {!canWrite && permissions != null && (
                <InlineBanner variant="info" icon={<Mail size={16} aria-hidden />}>
                    Per aprire una richiesta scrivi a {mailLink}.
                </InlineBanner>
            )}

            {content}

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
