import { describe, expect, it } from "vitest";
import {
    isPostSaleAlertTime,
    isPostSaleOpen,
    needsPostSaleAlert,
    postSaleMessage,
    postSaleReason,
    postSaleSignals,
    postSaleSnoozeUntil,
    type PostSaleAccount
} from "./crmPostSale";

const NOW = new Date("2026-10-05T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function account(over: Partial<PostSaleAccount> = {}): PostSaleAccount {
    return {
        accountState: "active",
        trialEndsAt: null,
        tenantCreatedAt: daysAgo(100),
        plan: "base",
        activitiesTotal: 1,
        hasLiveMenu: true,
        liveMenuSince: daysAgo(60),
        ...over
    };
}

const kinds = (a: PostSaleAccount) => postSaleSignals(a, NOW).map(s => s.kind);

describe("postSaleSignals", () => {
    it("abbandono dopo 10 giorni senza menù online, non prima", () => {
        expect(kinds(account({ accountState: "registrato", hasLiveMenu: false, liveMenuSince: null, tenantCreatedAt: daysAgo(9) }))).toEqual([]);
        expect(kinds(account({ accountState: "registrato", hasLiveMenu: false, liveMenuSince: null, tenantCreatedAt: daysAgo(10) }))).toEqual(["abbandono"]);
    });

    it("prova in scadenza entro 5 giorni, non scaduta", () => {
        const trial = { accountState: "trialing", hasLiveMenu: true, liveMenuSince: daysAgo(3) };
        expect(kinds(account({ ...trial, trialEndsAt: daysAhead(6) }))).toEqual([]);
        expect(kinds(account({ ...trial, trialEndsAt: daysAhead(5) }))).toEqual(["prova_in_scadenza"]);
        expect(kinds(account({ ...trial, trialEndsAt: daysAgo(1) }))).toEqual([]);
    });

    it("prova senza menù e in scadenza: tutti e due i gesti", () => {
        expect(kinds(account({ accountState: "trialing", hasLiveMenu: false, liveMenuSince: null, tenantCreatedAt: daysAgo(20), trialEndsAt: daysAhead(2) }))).toEqual(["abbandono", "prova_in_scadenza"]);
    });

    it("crescita: Pro sul base, seconda sede sul Pro con una sede, niente sul Pro con più sedi", () => {
        expect(postSaleSignals(account({ liveMenuSince: daysAgo(30) }), NOW)).toEqual([{ kind: "crescita", offer: "pro", days: 30 }]);
        expect(postSaleSignals(account({ plan: "pro", liveMenuSince: daysAgo(30) }), NOW)).toEqual([{ kind: "crescita", offer: "seconda_sede", days: 30 }]);
        expect(kinds(account({ plan: "pro", activitiesTotal: 2, liveMenuSince: daysAgo(30) }))).toEqual([]);
        expect(kinds(account({ liveMenuSince: daysAgo(29) }))).toEqual([]);
    });

    it("passaparola dopo 45 giorni di menù online da cliente pagante", () => {
        expect(kinds(account({ liveMenuSince: daysAgo(45) }))).toEqual(["crescita", "passaparola"]);
        expect(kinds(account({ accountState: "trialing", liveMenuSince: daysAgo(60) }))).toEqual([]);
    });

    it("disdetti, sospesi e insoluti: nessun gesto", () => {
        for (const state of ["canceled", "suspended", "past_due", null]) {
            expect(kinds(account({ accountState: state, hasLiveMenu: false, tenantCreatedAt: daysAgo(40) }))).toEqual([]);
        }
    });
});

describe("azioni del team", () => {
    it("fatto chiude per sempre, non ora fino alla scadenza", () => {
        expect(isPostSaleOpen(undefined, NOW)).toBe(true);
        expect(isPostSaleOpen({ kind: "abbandono", alertedAt: null, doneAt: daysAgo(1), snoozedUntil: null }, NOW)).toBe(false);
        expect(isPostSaleOpen({ kind: "abbandono", alertedAt: null, doneAt: null, snoozedUntil: daysAhead(1) }, NOW)).toBe(false);
        expect(isPostSaleOpen({ kind: "abbandono", alertedAt: null, doneAt: null, snoozedUntil: daysAgo(1) }, NOW)).toBe(true);
    });

    it("un avviso Telegram per gesto, anche quando il rimando scade", () => {
        expect(needsPostSaleAlert(undefined, NOW)).toBe(true);
        expect(needsPostSaleAlert({ kind: "passaparola", alertedAt: daysAgo(20), doneAt: null, snoozedUntil: daysAgo(1) }, NOW)).toBe(false);
    });

    it("non ora rimanda di 14 giorni", () => {
        expect(postSaleSnoozeUntil(NOW)).toBe(daysAhead(14));
    });
});

describe("isPostSaleAlertTime", () => {
    it("feriali dalle 10 alle 18 di Roma", () => {
        expect(isPostSaleAlertTime(new Date("2026-10-05T07:59:00Z"))).toBe(false); // lun 09:59
        expect(isPostSaleAlertTime(new Date("2026-10-05T08:00:00Z"))).toBe(true); // lun 10:00
        expect(isPostSaleAlertTime(new Date("2026-10-05T16:00:00Z"))).toBe(false); // lun 18:00
        expect(isPostSaleAlertTime(new Date("2026-10-10T10:00:00Z"))).toBe(false); // sab
    });
});

describe("testi", () => {
    it("perché e messaggio, col nome di chi scrive se c'è", () => {
        expect(postSaleReason({ kind: "prova_in_scadenza", days: 1 })).toBe("La prova finisce domani.");
        const msg = postSaleMessage({ kind: "passaparola", days: 50 }, "Mario", "Lorenzo");
        expect(msg.startsWith("Ciao Mario, sono Lorenzo di CataloGlobe.")).toBe(true);
        expect(postSaleMessage({ kind: "abbandono", days: 12 }, null, null).startsWith("Ciao, ti scrivo da CataloGlobe.")).toBe(true);
    });
});
