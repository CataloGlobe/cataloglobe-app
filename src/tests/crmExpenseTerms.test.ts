import { describe, expect, it } from "vitest";
import type { CrmExpense, CrmExpenseAccount, CrmExpenseCharge, CrmExpenseSettlement, CrmExpenseTerm } from "@/types/crm";
import { computeExpenseBalance, JOINT_ACCOUNT } from "@/utils/crm/expenseBalance";
import { buildCostsOverview, recurringMonthlyCents } from "@/utils/crm/expenses";
import { paidByForAccount, payerResolver, refundsAsCharges, termAt } from "@/utils/crm/expenseTerms";

const TODAY = "2026-10-16";
const ALEX = "m-alex";
const LORENZO = "m-lorenzo";
const memberNames = new Map([
    [ALEX, "Alex"],
    [LORENZO, "Lorenzo"]
]);

let seq = 0;
const id = (p: string) => `${p}-${seq++}`;

function account(name: string, kind: "personal" | "joint", owner: string | null = null, closedOn: string | null = null): CrmExpenseAccount {
    return { id: id("a"), name, kind, owner_member_id: owner, closed_on: closedOn, created_at: "", updated_at: "" };
}

const postepay = account("Postepay Alex", "personal", ALEX);
const cartaLorenzo = account("Carta Lorenzo", "personal", LORENZO);
const business = account("Revolut Business", "joint", null, "2026-09-13");
const cointestato = account("Revolut cointestato", "joint");
const accounts = [postepay, cartaLorenzo, business, cointestato];

function expense(over: Partial<CrmExpense>): CrmExpense {
    return {
        id: id("e"),
        kind: "one_off",
        name: "Spesa",
        category: "software",
        amount_cents: 0,
        paid_by: null,
        account_id: null,
        paid_on: "2026-04-20",
        first_charge_on: null,
        billing_interval: null,
        cancelled_on: null,
        remind_days_before: null,
        reminded_for: null,
        notes: null,
        created_by: null,
        created_at: "",
        updated_at: "",
        ...over
    };
}

function sub(amount: number, firstChargeOn: string, accountId: string | null, interval: "month" | "year" = "month"): CrmExpense {
    return expense({ kind: "subscription", amount_cents: amount, paid_on: null, first_charge_on: firstChargeOn, billing_interval: interval, account_id: accountId });
}

function term(e: CrmExpense, validFrom: string, amount: number, accountId: string | null = null): CrmExpenseTerm {
    return { id: id("t"), expense_id: e.id, valid_from: validFrom, amount_cents: amount, account_id: accountId, created_at: "" };
}

function deposit(from: string, cents: number, accountId: string | null, on = "2026-05-30"): CrmExpenseSettlement {
    return { id: id("s"), from_name: from, to_name: JOINT_ACCOUNT, amount_cents: cents, settled_on: on, note: null, account_id: accountId, created_by: null, created_at: "" };
}

function transfer(from: string, to: string, cents: number, on = "2026-04-26"): CrmExpenseSettlement {
    return { id: id("s"), from_name: from, to_name: to, amount_cents: cents, settled_on: on, note: null, account_id: null, created_by: null, created_at: "" };
}

const charge = (e: CrmExpense, on: string, cents: number): CrmExpenseCharge => ({ expenseId: e.id, chargedOn: on, amountCents: cents });

function balance(expenses: CrmExpense[], charges: CrmExpenseCharge[], settlements: CrmExpenseSettlement[] = [], terms: CrmExpenseTerm[] = []) {
    return computeExpenseBalance({ expenses, charges, settlements, team: ["Alex", "Lorenzo"], today: TODAY, accounts, terms, memberNames });
}

const owes = (b: ReturnType<typeof balance>) => b.transfers.map(t => `${t.from}->${t.to} ${t.amountCents}`);

describe("termAt", () => {
    it("un cambio di prezzo non tocca i mesi prima", () => {
        const e = sub(2196, "2026-03-23", postepay.id);
        const terms = [term(e, "2026-10-02", 9446)];
        expect(termAt(e, terms, "2026-09-23").amountCents).toBe(2196);
        expect(termAt(e, terms, "2026-10-02").amountCents).toBe(9446);
        expect(termAt(e, terms, "2026-11-02").amountCents).toBe(9446);
    });

    it("un term senza conto lascia il conto di prima", () => {
        const e = sub(1000, "2026-01-01", postepay.id);
        const terms = [term(e, "2026-05-01", 1000, cointestato.id), term(e, "2026-08-01", 2000)];
        expect(termAt(e, terms, "2026-09-01")).toEqual({ amountCents: 2000, accountId: cointestato.id });
    });

    it("un term non tocca il primo addebito anche se first_charge_on è stato spostato dopo", () => {
        const e = sub(1000, "2026-04-30", postepay.id);
        const terms = [term(e, "2026-03-31", 2000)];
        expect(termAt(e, terms, "2026-04-30").amountCents).toBe(1000);
        expect(termAt(e, terms, "2026-05-30").amountCents).toBe(1000);
    });

    it("le una tantum ignorano i term", () => {
        const e = expense({ amount_cents: 500, account_id: postepay.id });
        expect(termAt(e, [term(e, "2026-01-01", 9999)], "2026-12-01").amountCents).toBe(500);
    });
});

describe("payerResolver", () => {
    it("conto personale = il titolare; comune = nessuno; senza conto = paid_by", () => {
        const a = expense({ account_id: postepay.id });
        const j = expense({ account_id: cointestato.id });
        const old = expense({ paid_by: "Lorenzo" });
        const oldJoint = expense({ paid_by: "conto comune" });
        const payer = payerResolver({ expenses: [a, j, old, oldJoint], terms: [], accounts, memberNames, isJointName: n => n?.toLowerCase() === "conto comune" });
        expect(payer(a.id, TODAY)).toEqual({ type: "person", name: "Alex", accountId: postepay.id });
        expect(payer(j.id, TODAY)).toEqual({ type: "joint", accountId: cointestato.id });
        expect(payer(old.id, TODAY)).toEqual({ type: "person", name: "Lorenzo", accountId: null });
        expect(payer(oldJoint.id, TODAY)).toEqual({ type: "joint", accountId: null });
    });

    it("conto personale con titolare fuori dal team: ricade su paid_by", () => {
        const ghost = account("Carta ex socio", "personal", "m-uscito");
        const e = expense({ account_id: ghost.id, paid_by: "Lorenzo" });
        const payer = payerResolver({ expenses: [e], terms: [], accounts: [ghost], memberNames, isJointName: () => false });
        expect(payer(e.id, TODAY)).toEqual({ type: "person", name: "Lorenzo", accountId: null });
    });

    it("spesa sconosciuta: nessuno", () => {
        const payer = payerResolver({ expenses: [], terms: [], accounts, memberNames, isJointName: () => false });
        expect(payer("e-nessuna", TODAY)).toEqual({ type: "none" });
    });

    it("paidByForAccount scrive il titolare o il conto comune", () => {
        expect(paidByForAccount(cartaLorenzo, memberNames, JOINT_ACCOUNT)).toBe("Lorenzo");
        expect(paidByForAccount(cointestato, memberNames, JOINT_ACCOUNT)).toBe(JOINT_ACCOUNT);
    });
});

describe("computeExpenseBalance con carte e conti", () => {
    it("pagata da uno e divisa: l'altro deve la metà", () => {
        const e = expense({ account_id: postepay.id });
        expect(owes(balance([e], [charge(e, "2026-04-20", 81130)]))).toEqual(["Lorenzo->Alex 40565"]);
    });

    it("Fiscozen pagato da Alex e la metà mandata da Lorenzo: restano 0,65 € a favore di Alex, come su Splitwise", () => {
        const e = expense({ account_id: postepay.id });
        const b = balance([e], [charge(e, "2026-04-20", 81130)], [transfer("Lorenzo", "Alex", 40500)]);
        expect(owes(b)).toEqual(["Lorenzo->Alex 65"]);
    });

    it("pagata dal conto comune: non pesa su nessuno", () => {
        const e = expense({ account_id: cointestato.id });
        const b = balance([e], [charge(e, "2026-10-10", 3000)]);
        expect(b.even).toBe(true);
        expect(b.jointCents).toBe(3000);
        expect(b.sharedCents).toBe(0);
    });

    it("Revolut Business: versamenti 226 + 226 + 7,28 e uscite 459,28, in pari e niente doppio conteggio", () => {
        const e = expense({ account_id: business.id });
        const b = balance(
            [e],
            [charge(e, "2026-06-01", 45928)],
            [deposit("Alex", 22600, business.id), deposit("Lorenzo", 22600, business.id), deposit("Alex", 364, business.id), deposit("Lorenzo", 364, business.id)]
        );
        expect(b.even).toBe(true);
        expect(b.sharedCents).toBe(45928);
        expect(b.jointAccounts).toEqual([{ accountId: business.id, depositedCents: 45928, spentCents: 45928, balanceCents: 0 }]);
    });

    it("versamenti sbilanciati sul conto comune: chi ha versato di meno deve la metà della differenza", () => {
        const b = balance([], [], [deposit("Alex", 10000, cointestato.id), deposit("Lorenzo", 6000, cointestato.id)]);
        expect(owes(b)).toEqual(["Lorenzo->Alex 2000"]);
    });

    it("abbonamento spostato sul cointestato da ottobre: fino a settembre pesa su Alex, da ottobre su nessuno", () => {
        const e = sub(2196, "2026-09-23", postepay.id);
        const terms = [term(e, "2026-10-01", 2196, cointestato.id)];
        const b = balance([e], [charge(e, "2026-09-23", 2196), charge(e, "2026-10-23", 2196)], [], terms);
        expect(b.people.find(p => p.name === "Alex")?.paidCents).toBe(2196);
        expect(b.jointCents).toBe(0); // il 23/10 è dopo oggi
        const later = computeExpenseBalance({
            expenses: [e],
            charges: [charge(e, "2026-09-23", 2196), charge(e, "2026-10-23", 2196)],
            settlements: [],
            team: ["Alex", "Lorenzo"],
            today: "2026-10-31",
            accounts,
            terms,
            memberNames
        });
        expect(later.people.find(p => p.name === "Alex")?.paidCents).toBe(2196);
        expect(later.jointCents).toBe(2196);
    });

    it("un rimborso conta in negativo su chi aveva pagato", () => {
        const e = sub(9446, "2026-10-02", postepay.id);
        const charges = [charge(e, "2026-10-02", 9446), ...refundsAsCharges([{ id: "r", expense_id: e.id, refunded_on: "2026-10-10", amount_cents: 4000, note: null, created_at: "" }])];
        const b = balance([e], charges);
        expect(b.people.find(p => p.name === "Alex")?.paidCents).toBe(5446);
        expect(owes(b)).toEqual(["Lorenzo->Alex 2723"]);
    });
});

describe("casi di bordo del saldo", () => {
    it("rimborso dopo lo spostamento sul cointestato: torna al conto comune, non ad Alex", () => {
        const e = sub(2000, "2026-08-05", postepay.id);
        const terms = [term(e, "2026-09-01", 2000, cointestato.id)];
        const charges = [
            charge(e, "2026-08-05", 2000),
            charge(e, "2026-09-05", 2000),
            ...refundsAsCharges([{ id: "r", expense_id: e.id, refunded_on: "2026-09-20", amount_cents: 500, note: null, created_at: "" }])
        ];
        const b = balance([e], charges, [], terms);
        expect(b.people.find(p => p.name === "Alex")?.paidCents).toBe(2000);
        expect(b.jointCents).toBe(1500);
    });

    it("addebito su un conto chiuso: resta del conto, che va in negativo", () => {
        const e = sub(1000, "2026-09-20", business.id);
        const b = balance([e], [charge(e, "2026-09-20", 1000)]);
        expect(b.even).toBe(true);
        expect(b.jointAccounts).toEqual([{ accountId: business.id, depositedCents: 0, spentCents: 1000, balanceCents: -1000 }]);
    });

    it("versamento con un conto personale come destinazione: non è un versamento sul comune", () => {
        const b = balance([], [], [{ ...deposit("Alex", 4000, postepay.id), to_name: "Lorenzo" }]);
        expect(owes(b)).toEqual(["Lorenzo->Alex 4000"]);
        expect(b.jointAccounts).toEqual([]);
    });

    it("due conti comuni più «Conto comune» scritto a mano: ognuno per conto suo, saldo tra persone pari", () => {
        const a = expense({ account_id: business.id });
        const c = expense({ account_id: cointestato.id });
        const old = expense({ paid_by: JOINT_ACCOUNT });
        const b = balance(
            [a, c, old],
            [charge(a, "2026-06-01", 3000), charge(c, "2026-10-10", 2000), charge(old, "2026-03-01", 1000)],
            [deposit("Alex", 1500, business.id), deposit("Lorenzo", 1500, business.id), deposit("Alex", 500, null), deposit("Lorenzo", 500, null)]
        );
        expect(b.even).toBe(true);
        expect(b.jointCents).toBe(6000);
        const byId = new Map(b.jointAccounts.map(j => [j.accountId, j]));
        expect(byId.get(business.id)?.balanceCents).toBe(0);
        expect(byId.get(cointestato.id)?.spentCents).toBe(2000);
    });
});

describe("quadro", () => {
    it("ricarica: zero senza abbonamenti, e un centesimo sopra l'euro arrotonda in su", () => {
        const none = buildCostsOverview({ expenses: [], charges: [], nextCharges: new Map(), terms: [], accounts, today: TODAY });
        expect(none.rechargePerPersonCents).toBe(0);
        const e = sub(201, "2026-10-20", cointestato.id);
        const o = buildCostsOverview({ expenses: [e], charges: [], nextCharges: new Map([[e.id, "2026-10-20"]]), terms: [], accounts, today: TODAY });
        expect(o.rechargePerPersonCents).toBe(200);
    });

    it("abbonamento disdetto: fuori dal mensile e dalla ricarica", () => {
        const e = { ...sub(5000, "2026-01-10", postepay.id), cancelled_on: "2026-09-10" };
        const o = buildCostsOverview({ expenses: [e], charges: [], nextCharges: new Map(), terms: [], accounts, today: TODAY });
        expect(o.monthlyFromNowCents).toBe(0);
        expect(o.rechargePerPersonCents).toBe(0);
    });

    it("costo mensile al prezzo del prossimo addebito, annuali /12, ricarica a testa all'euro in su", () => {
        const claude = sub(2196, "2026-03-23", postepay.id);
        const wispr = sub(14400, "2027-10-01", cointestato.id, "year");
        const terms = [term(claude, "2026-10-23", 10980)];
        const next = new Map([
            [claude.id, "2026-10-23"],
            [wispr.id, "2027-10-01"]
        ]);
        expect(recurringMonthlyCents([claude, wispr], next, terms)).toBe(10980 + 1200);
        const o = buildCostsOverview({ expenses: [claude, wispr], charges: [], nextCharges: next, terms, accounts, today: TODAY });
        expect(o.monthlyFromNowCents).toBe(12180);
        expect(o.monthlyOnJointCents).toBe(1200);
        expect(o.rechargePerPersonCents).toBe(6100);
    });

    it("speso finora: addebiti fino a oggi meno i rimborsi", () => {
        const e = expense({ account_id: postepay.id });
        const o = buildCostsOverview({
            expenses: [e],
            charges: [charge(e, "2026-04-20", 81130), charge(e, "2026-10-10", -1000), charge(e, "2026-11-01", 5000)],
            nextCharges: new Map(),
            terms: [],
            accounts,
            today: TODAY
        });
        expect(o.spentSoFarCents).toBe(80130);
    });

    it("abbonamento attivo su un conto chiuso: da spostare, e conta lo stesso nel mensile", () => {
        const e = sub(1000, "2026-06-11", business.id);
        const o = buildCostsOverview({ expenses: [e], charges: [], nextCharges: new Map([[e.id, "2026-10-11"]]), terms: [], accounts, today: TODAY });
        expect(o.toMove.map(m => m.accountName)).toEqual(["Revolut Business"]);
        expect(o.monthlyFromNowCents).toBe(1000);
        expect(o.monthlyOnJointCents).toBe(0);
    });
});
