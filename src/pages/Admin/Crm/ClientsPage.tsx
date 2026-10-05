import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers, listCrmVenues } from "@/services/supabase/crm";
import {
    listCrmPostSaleAccounts,
    listCrmPostSaleActions,
    markCrmPostSaleDone,
    snoozeCrmPostSale
} from "@/services/supabase/crmPostSale";
import { CRM_ACCOUNT_STATE_LABEL } from "@/utils/crm/accountLabels";
import {
    buildPostSaleClients,
    firstNameOf,
    liveMenuLabel,
    postSaleTodos,
    referralCounts,
    type PostSaleClient,
    type PostSaleTodo
} from "@/utils/crm/postSale";
import { crmErrorMessage } from "@/utils/crm/stages";
import { crmSenderName } from "@/utils/crm/whatsapp";
import { POST_SALE_LABEL, postSaleMessage, postSaleReason, postSaleSnoozeUntil } from "@shared/crmPostSale";
import { TileState } from "./components/TileState";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Clients.module.scss";

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

/**
 * Clienti (post-vendita, Fase 3). In cima i gesti da fare adesso, uno per
 * riga col perché e il messaggio proposto da copiare: menù non ancora online,
 * prova in scadenza, momento per proporre il Pro o una seconda sede, richiesta
 * di passaparola. «Fatto» chiude il gesto per sempre, «Non ora» lo rimanda di
 * 14 giorni. Sotto, tutti i locali collegati a un'azienda con i segnali d'uso.
 * Le regole dei gesti sono le stesse degli avvisi su Telegram
 * (`_shared/crmPostSale.ts`).
 */
export default function ClientsPage() {
    usePageTitle("Clienti");
    usePageHeader({ title: "Clienti", subtitle: "I locali collegati a un'azienda CataloGlobe e cosa fare per ciascuno." });
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const [tick, setTick] = useState(0);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const now = useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const accounts = useCrmLoad(listCrmPostSaleAccounts, tick);
    const actions = useCrmLoad(listCrmPostSaleActions, tick);
    const venues = useCrmLoad(listCrmVenues, tick);
    const team = useCrmLoad(listCrmTeamMembers, tick);
    const reload = useCallback(() => setTick(t => t + 1), []);

    const clients = useMemo(
        () => (accounts.data && venues.data ? buildPostSaleClients(accounts.data, venues.data) : []),
        [accounts.data, venues.data]
    );
    const todos = useMemo(
        () => (accounts.data && actions.data ? postSaleTodos(clients, accounts.data, actions.data, now) : []),
        [clients, accounts.data, actions.data, now]
    );
    const referrals = useMemo(() => referralCounts(clients), [clients]);
    const senderName = crmSenderName(team.data ?? [], userId);

    const loading = (accounts.loading && !accounts.data) || (venues.loading && !venues.data);
    const loadError = accounts.error ?? venues.error;

    async function act(todo: PostSaleTodo, gesture: "done" | "snooze") {
        if (!userId) return;
        const key = `${todo.client.venueId}:${todo.signal.kind}`;
        setBusyKey(key);
        setActionError(null);
        try {
            if (gesture === "done") await markCrmPostSaleDone(todo.client.venueId, todo.signal.kind, userId);
            else await snoozeCrmPostSale(todo.client.venueId, todo.signal.kind, postSaleSnoozeUntil(new Date()));
            showToast({
                message: gesture === "done" ? "Fatto: non torna più." : "Rimandato di 14 giorni.",
                type: "success"
            });
            reload();
        } catch (err) {
            setActionError(crmErrorMessage(err));
        } finally {
            setBusyKey(null);
        }
    }

    function copyMessage(todo: PostSaleTodo) {
        const text = postSaleMessage(todo.signal, firstNameOf(todo.client.contactName), senderName);
        navigator.clipboard.writeText(text).then(
            () => showToast({ message: "Messaggio copiato: adattalo prima di mandarlo.", type: "success" }),
            () => setActionError("Non sono riuscito a copiare il messaggio. Riprova.")
        );
    }

    const columns: ColumnDefinition<PostSaleClient>[] = [
        {
            id: "name",
            header: "Locale",
            accessor: c => c.name,
            cell: (_v, c) => (
                <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                    <span>{c.name}</span>
                    <span>
                        {[c.city, c.accountState ? CRM_ACCOUNT_STATE_LABEL[c.accountState] : null].filter(Boolean).join(" · ")}
                    </span>
                </div>
            )
        },
        {
            id: "menu",
            header: "Menù",
            accessor: c => (c.hasLiveMenu ? 1 : 0),
            cell: (_v, c) => (
                <StatusBadge variant={c.hasLiveMenu ? "success" : "warning"} label={liveMenuLabel(c, now)} />
            )
        },
        {
            id: "usage",
            header: "Sedi e prodotti",
            hideOnPhone: true,
            accessor: c => c.productsCount,
            cell: (_v, c) =>
                `${c.activitiesPublished}/${c.activitiesTotal} ${c.activitiesTotal === 1 ? "sede" : "sedi"} · ${c.productsCount} ${c.productsCount === 1 ? "prodotto" : "prodotti"}`
        },
        {
            id: "plan",
            header: "Piano",
            hideOnPhone: true,
            accessor: c => c.plan ?? "",
            cell: (_v, c) => (c.plan ? PLAN_LABEL[c.plan] ?? c.plan : "—")
        },
        {
            id: "referral",
            header: "Passaparola",
            hideOnPhone: true,
            accessor: c => c.referredBy ?? "",
            cell: (_v, c) => {
                const brought = referrals.get(c.name.trim().toLowerCase()) ?? 0;
                const parts = [
                    c.referredBy ? `Da ${c.referredBy}` : null,
                    brought > 0 ? (brought === 1 ? "Ne ha presentato 1" : `Ne ha presentati ${brought}`) : null
                ].filter(Boolean);
                return parts.length ? parts.join(" · ") : "—";
            }
        }
    ];

    return (
        <div className={styles.page}>
            <Card title="Da fare" badge={todos.length > 0 ? <Badge variant="brand">{todos.length}</Badge> : undefined} flush>
                {actionError && (
                    <div className={styles.banner}>
                        <InlineBanner variant="error">{actionError}</InlineBanner>
                    </div>
                )}
                <TileState
                    loading={loading || (actions.loading && !actions.data)}
                    error={loadError ?? actions.error}
                    onRetry={reload}
                    empty={todos.length === 0}
                    emptyText="Niente da fare: nessun cliente fermo, nessuna prova in scadenza."
                >
                    {todos.map(todo => {
                        const key = `${todo.client.venueId}:${todo.signal.kind}`;
                        const busy = busyKey === key;
                        return (
                            <ListRow
                                key={key}
                                title={
                                    <Link to={`/admin/lead/${todo.client.venueId}`} className={styles.rowLink}>
                                        {todo.client.name}
                                    </Link>
                                }
                                subtitle={`${POST_SALE_LABEL[todo.signal.kind]} · ${postSaleReason(todo.signal)}`}
                                wrapSubtitle
                                trailingWrap
                                trailing={
                                    <div className={styles.actions}>
                                        <Button variant="secondary" size="sm" onClick={() => copyMessage(todo)}>
                                            Copia messaggio
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={() => void act(todo, "done")} disabled={busy || !userId}>
                                            Fatto
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => void act(todo, "snooze")} disabled={busy || !userId}>
                                            Non ora
                                        </Button>
                                    </div>
                                }
                            />
                        );
                    })}
                </TileState>
            </Card>

            <section className={styles.section} aria-label="Tutti i clienti">
                <Text as="h2" variant="title-sm" weight={600}>
                    Tutti i clienti
                </Text>
                {loadError ? (
                    <TileState loading={false} error={loadError} onRetry={reload}>
                        {null}
                    </TileState>
                ) : (
                    <DataTable
                        data={clients}
                        columns={columns}
                        isLoading={loading}
                        getRowId={c => c.venueId}
                        onRowClick={c => navigate(`/admin/lead/${c.venueId}`)}
                        ariaLabel="Clienti"
                        emptyState={{
                            title: "Ancora nessun cliente",
                            description:
                                "Un lead diventa cliente quando si collega a un'azienda: da solo se si registra con lo stesso telefono, o a mano dalla sua scheda.",
                            icon: <HeartHandshake size={32} strokeWidth={1.5} />
                        }}
                    />
                )}
            </section>
        </div>
    );
}
