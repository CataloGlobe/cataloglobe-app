import { describe, expect, it } from "vitest";
import {
    buildPostSaleClients,
    firstNameOf,
    liveMenuLabel,
    postSaleTodos,
    referralCounts
} from "@/utils/crm/postSale";
import type { CrmPostSaleAccountRow, CrmPostSaleActionRow, CrmVenueListItem } from "@/types/crm";

const NOW = new Date("2026-10-05T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function venue(id: string, over: Partial<CrmVenueListItem> = {}): CrmVenueListItem {
    return {
        id,
        created_at: daysAgo(100),
        updated_at: daysAgo(1),
        name: `Locale ${id}`,
        name_pending: false,
        name_to_verify: null,
        city: "Milano",
        stage: "cliente_pagante",
        lost_kind: null,
        lost_reason: null,
        assigned_to: null,
        tenant_id: `t-${id}`,
        link_source: "phone_auto",
        referred_by: null,
        stage_changed_at: daysAgo(10),
        first_contacted_at: null,
        last_activity_at: daysAgo(1),
        account_state: "active",
        trial_kind: null,
        trial_ends_at: null,
        stage_locked_at: null,
        stage_locked_by: null,
        stage_lock_note: null,
        agent_hold_at: null,
        agent_hold_by: null,
        crm_contacts: [{ id: `c-${id}`, name: "Mario Rossi", phone_e164: "+39333", email: null }],
        crm_leads: [],
        ...over
    };
}

function account(id: string, over: Partial<CrmPostSaleAccountRow> = {}): CrmPostSaleAccountRow {
    return {
        venue_id: id,
        tenant_id: `t-${id}`,
        tenant_created_at: daysAgo(100),
        plan: "base",
        paid_seats: 1,
        activities_total: 1,
        activities_published: 1,
        products_count: 20,
        has_live_menu: true,
        live_menu_since: daysAgo(60),
        ...over
    };
}

describe("buildPostSaleClients", () => {
    it("tiene solo i locali che il CRM conosce, in ordine di nome", () => {
        const clients = buildPostSaleClients(
            [account("b"), account("a"), account("x")],
            [venue("a"), venue("b")]
        );
        expect(clients.map(c => c.venueId)).toEqual(["a", "b"]);
        expect(clients[0].contactName).toBe("Mario Rossi");
    });
});

describe("postSaleTodos", () => {
    it("prima la prova in scadenza, poi il menù non online; fatti e rimandati fuori", () => {
        const accounts = [
            account("a"),
            account("b", { has_live_menu: false, live_menu_since: null, tenant_created_at: daysAgo(15) }),
            account("c", { has_live_menu: true, live_menu_since: daysAgo(2) })
        ];
        const venues = [
            venue("a"),
            venue("b", { account_state: "registrato" }),
            venue("c", { account_state: "trialing", trial_ends_at: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() })
        ];
        const actions: CrmPostSaleActionRow[] = [
            { venue_id: "a", kind: "passaparola", alerted_at: null, done_at: daysAgo(1), done_by: null, snoozed_until: null }
        ];
        const todos = postSaleTodos(buildPostSaleClients(accounts, venues), accounts, actions, NOW);
        expect(todos.map(t => `${t.client.venueId}:${t.signal.kind}`)).toEqual(["c:prova_in_scadenza", "b:abbandono", "a:crescita"]);
    });
});

describe("etichette", () => {
    it("nome di battesimo, menù online, conteggio dei presentati", () => {
        expect(firstNameOf("  Mario Rossi ")).toBe("Mario");
        expect(firstNameOf(null)).toBeNull();
        expect(liveMenuLabel({ hasLiveMenu: false, liveMenuSince: null }, NOW)).toBe("Non online");
        expect(liveMenuLabel({ hasLiveMenu: true, liveMenuSince: daysAgo(12) }, NOW)).toBe("Online da 12 giorni");
        expect(referralCounts([{ referredBy: "Bar Sport" }, { referredBy: "bar sport " }, { referredBy: null }]).get("bar sport")).toBe(2);
    });
});
