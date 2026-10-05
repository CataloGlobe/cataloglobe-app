/**
 * Pagina Clienti (post-vendita): mette insieme segnali d'uso, locale del CRM e
 * gesti del team. Le regole dei gesti stanno in `@shared/crmPostSale`, le
 * stesse che usa crm-sync-accounts per Telegram. Puro.
 */
import {
    isPostSaleOpen,
    postSaleSignals,
    type PostSaleAction,
    type PostSaleSignal
} from "@shared/crmPostSale";
import type { CrmAccountState, CrmPostSaleAccountRow, CrmPostSaleActionRow, CrmVenueListItem } from "@/types/crm";

export interface PostSaleClient {
    venueId: string;
    name: string;
    city: string | null;
    assignedTo: string | null;
    accountState: CrmAccountState | null;
    trialEndsAt: string | null;
    plan: string | null;
    activitiesTotal: number;
    activitiesPublished: number;
    productsCount: number;
    hasLiveMenu: boolean;
    liveMenuSince: string | null;
    referredBy: string | null;
    /** Nome del primo contatto, per il saluto del messaggio. */
    contactName: string | null;
}

export interface PostSaleTodo {
    client: PostSaleClient;
    signal: PostSaleSignal;
}

function toAction(row: CrmPostSaleActionRow): PostSaleAction {
    return { kind: row.kind, alertedAt: row.alerted_at, doneAt: row.done_at, snoozedUntil: row.snoozed_until };
}

/** Solo i locali che il CRM conosce e che sono collegati a un'azienda viva. */
export function buildPostSaleClients(
    accounts: CrmPostSaleAccountRow[],
    venues: CrmVenueListItem[]
): PostSaleClient[] {
    const venueById = new Map(venues.map(v => [v.id, v]));
    const clients: PostSaleClient[] = [];
    for (const row of accounts) {
        const venue = venueById.get(row.venue_id);
        if (!venue) continue;
        clients.push({
            venueId: venue.id,
            name: venue.name,
            city: venue.city,
            assignedTo: venue.assigned_to,
            accountState: venue.account_state,
            trialEndsAt: venue.trial_ends_at,
            plan: row.plan,
            activitiesTotal: row.activities_total,
            activitiesPublished: row.activities_published,
            productsCount: row.products_count,
            hasLiveMenu: row.has_live_menu,
            liveMenuSince: row.live_menu_since,
            referredBy: venue.referred_by,
            contactName: venue.crm_contacts[0]?.name ?? null
        });
    }
    return clients.sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** Ordine dei gesti nella lista: prima chi rischia di andarsene. */
const KIND_ORDER: Record<PostSaleSignal["kind"], number> = {
    prova_in_scadenza: 0,
    abbandono: 1,
    crescita: 2,
    passaparola: 3
};

/** I gesti da fare adesso: aperti (non fatti né rimandati), i più urgenti in cima. */
export function postSaleTodos(
    clients: PostSaleClient[],
    accounts: CrmPostSaleAccountRow[],
    actions: CrmPostSaleActionRow[],
    now: Date
): PostSaleTodo[] {
    const createdAt = new Map(accounts.map(a => [a.venue_id, a.tenant_created_at]));
    const actionByKey = new Map(actions.map(a => [`${a.venue_id}:${a.kind}`, toAction(a)]));
    const todos: PostSaleTodo[] = [];
    for (const client of clients) {
        const signals = postSaleSignals(
            {
                accountState: client.accountState,
                trialEndsAt: client.trialEndsAt,
                tenantCreatedAt: createdAt.get(client.venueId) ?? now.toISOString(),
                plan: client.plan,
                activitiesTotal: client.activitiesTotal,
                hasLiveMenu: client.hasLiveMenu,
                liveMenuSince: client.liveMenuSince
            },
            now
        );
        for (const signal of signals) {
            if (isPostSaleOpen(actionByKey.get(`${client.venueId}:${signal.kind}`), now)) {
                todos.push({ client, signal });
            }
        }
    }
    return todos.sort(
        (a, b) => KIND_ORDER[a.signal.kind] - KIND_ORDER[b.signal.kind] || a.client.name.localeCompare(b.client.name, "it")
    );
}

/** Nome di battesimo per il saluto: la prima parola del contatto. */
export function firstNameOf(contactName: string | null): string | null {
    const first = contactName?.trim().split(/\s+/)[0];
    return first ? first : null;
}

/** «Online da 12 giorni», «Online da oggi», «Non online». */
export function liveMenuLabel(client: Pick<PostSaleClient, "hasLiveMenu" | "liveMenuSince">, now: Date): string {
    if (!client.hasLiveMenu) return "Non online";
    if (!client.liveMenuSince) return "Online";
    const days = Math.floor((now.getTime() - Date.parse(client.liveMenuSince)) / 86_400_000);
    if (days <= 0) return "Online da oggi";
    return days === 1 ? "Online da ieri" : `Online da ${days} giorni`;
}

/** Quanti clienti ha presentato ciascun nome scritto in «Presentato da» (senza maiuscole). */
export function referralCounts(clients: Pick<PostSaleClient, "referredBy">[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const c of clients) {
        const key = c.referredBy?.trim().toLowerCase();
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}
