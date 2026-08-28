import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
    ACTION_EXPECTS,
    ACTION_TO_STATUS,
    ADMIN_ACTIONS,
    RESERVATION_ACTIONS,
    isAdminAction,
    isReservationAction,
    isTransitionAllowed,
    sendsCustomerEmail,
    type ReservationAction,
    type ReservationStatus
} from "./reservationTransitions.ts";

const ALL_STATUSES: readonly ReservationStatus[] = [
    "pending",
    "confirmed",
    "declined",
    "cancelled",
    "seated",
    "no_show",
    "completed"
];

describe("no-show — transizioni ammesse", () => {
    it("confirmed → no_show con mark_no_show", () => {
        expect(isTransitionAllowed("confirmed", "mark_no_show")).toBe(true);
        expect(ACTION_TO_STATUS.mark_no_show).toBe("no_show");
    });

    it("no_show → confirmed con undo_no_show (reversibile)", () => {
        expect(isTransitionAllowed("no_show", "undo_no_show")).toBe(true);
        expect(ACTION_TO_STATUS.undo_no_show).toBe("confirmed");
    });
});

describe("no-show — transizioni rifiutate", () => {
    it.each(["pending", "cancelled", "declined", "no_show", "seated", "completed"] as const)(
        "mark_no_show rifiutata da %s",
        status => {
            expect(isTransitionAllowed(status, "mark_no_show")).toBe(false);
        }
    );

    it.each(["pending", "confirmed", "cancelled", "declined", "seated", "completed"] as const)(
        "undo_no_show rifiutata da %s",
        status => {
            expect(isTransitionAllowed(status, "undo_no_show")).toBe(false);
        }
    );

    it("nessuna azione diversa da mark_no_show porta a no_show", () => {
        const toNoShow = RESERVATION_ACTIONS.filter(a => ACTION_TO_STATUS[a] === "no_show");
        expect(toNoShow).toEqual(["mark_no_show"]);
    });

    it("solo confirmed può diventare no_show", () => {
        const sources = ALL_STATUSES.filter(s => isTransitionAllowed(s, "mark_no_show"));
        expect(sources).toEqual(["confirmed"]);
    });
});

describe("transizioni preesistenti invariate", () => {
    it.each([
        ["confirm", "pending", "confirmed"],
        ["decline", "pending", "declined"],
        ["cancel", "confirmed", "cancelled"]
    ] as const)("%s: %s → %s", (action, from, to) => {
        expect(ACTION_EXPECTS[action]).toEqual([from]);
        expect(ACTION_TO_STATUS[action]).toBe(to);
        expect(isTransitionAllowed(from, action)).toBe(true);
    });

    it("le cinque azioni admin restano a sorgente singola", () => {
        for (const action of ADMIN_ACTIONS) {
            expect(ACTION_EXPECTS[action]).toHaveLength(1);
        }
    });
});

describe("cancel_by_customer — disdetta dal link firmato", () => {
    it.each(["pending", "confirmed"] as const)("ammessa da %s", status => {
        expect(isTransitionAllowed(status, "cancel_by_customer")).toBe(true);
    });

    it.each(["declined", "cancelled", "seated", "no_show", "completed"] as const)(
        "rifiutata da %s",
        status => {
            expect(isTransitionAllowed(status, "cancel_by_customer")).toBe(false);
        }
    );

    it("porta a cancelled", () => {
        expect(ACTION_TO_STATUS.cancel_by_customer).toBe("cancelled");
    });

    it("è l'unica azione con più di uno stato di partenza", () => {
        const multiSource = RESERVATION_ACTIONS.filter(a => ACTION_EXPECTS[a].length > 1);
        expect(multiSource).toEqual(["cancel_by_customer"]);
    });

    it("accetta uno stato (pending) che nessuna cancellazione admin accetta", () => {
        expect(isTransitionAllowed("pending", "cancel")).toBe(false);
        expect(isTransitionAllowed("pending", "cancel_by_customer")).toBe(true);
    });
});

describe("separazione admin / cliente", () => {
    it("cancel_by_customer NON è un'azione admin", () => {
        expect(isAdminAction("cancel_by_customer")).toBe(false);
        expect(ADMIN_ACTIONS).not.toContain("cancel_by_customer");
    });

    it.each(ADMIN_ACTIONS)("%s resta accettata dall'endpoint admin", action => {
        expect(isAdminAction(action)).toBe(true);
    });

    it("ADMIN_ACTIONS è esattamente RESERVATION_ACTIONS meno cancel_by_customer", () => {
        expect([...ADMIN_ACTIONS].sort()).toEqual(
            RESERVATION_ACTIONS.filter(a => a !== "cancel_by_customer").sort()
        );
    });

    it("isAdminAction rifiuta valori non-azione", () => {
        for (const value of ["", "CANCEL_BY_CUSTOMER", "cancel_by_customer ", null, 42, {}]) {
            expect(isAdminAction(value)).toBe(false);
        }
    });
});

describe("compare-and-set", () => {
    it("ACTION_EXPECTS copre ogni azione (è la lista passata a .in('status', …))", () => {
        for (const action of RESERVATION_ACTIONS) {
            expect(ACTION_EXPECTS[action].length).toBeGreaterThan(0);
            for (const status of ACTION_EXPECTS[action]) {
                expect(ALL_STATUSES).toContain(status);
            }
        }
    });

    it("rifiuta ogni stato di partenza fuori dalla lista attesa", () => {
        for (const action of RESERVATION_ACTIONS) {
            for (const status of ALL_STATUSES) {
                expect(isTransitionAllowed(status, action)).toBe(
                    (ACTION_EXPECTS[action] as readonly string[]).includes(status)
                );
            }
        }
    });

    it("nessuna azione è un no-op (stato di arrivo mai tra quelli attesi)", () => {
        for (const action of RESERVATION_ACTIONS) {
            expect(ACTION_EXPECTS[action]).not.toContain(ACTION_TO_STATUS[action]);
        }
    });

    it("nessuna lista di stati attesi contiene duplicati", () => {
        for (const action of RESERVATION_ACTIONS) {
            const expects = ACTION_EXPECTS[action];
            expect(new Set(expects).size).toBe(expects.length);
        }
    });
});

describe("validazione dell'azione in ingresso", () => {
    it.each(RESERVATION_ACTIONS)("accetta %s", action => {
        expect(isReservationAction(action)).toBe(true);
    });

    it.each([
        "no_show",
        "seated",
        "completed",
        "CONFIRM",
        "mark_noshow",
        "",
        "  confirm  "
    ])("rifiuta %j", value => {
        expect(isReservationAction(value)).toBe(false);
    });

    it.each([null, undefined, 42, {}, ["confirm"]])("rifiuta il non-stringa %j", value => {
        expect(isReservationAction(value)).toBe(false);
    });
});

describe("email — la coppia no-show è silenziosa", () => {
    it("mark_no_show non produce email", () => {
        expect(sendsCustomerEmail("mark_no_show")).toBe(false);
    });

    it("undo_no_show non produce email", () => {
        expect(sendsCustomerEmail("undo_no_show")).toBe(false);
    });

    it("le azioni con email sono esattamente confirm/decline/cancel", () => {
        const withEmail = RESERVATION_ACTIONS.filter(sendsCustomerEmail);
        expect(withEmail).toEqual(["confirm", "decline", "cancel"]);
    });

    it("cancel_by_customer non produce email al cliente", () => {
        expect(sendsCustomerEmail("cancel_by_customer")).toBe(false);
    });

    it("ogni azione che scrive no_show o lo annulla è silenziosa", () => {
        const noShowRelated: ReservationAction[] = RESERVATION_ACTIONS.filter(
            a =>
                ACTION_TO_STATUS[a] === "no_show" ||
                (ACTION_EXPECTS[a] as readonly string[]).includes("no_show")
        );
        expect(noShowRelated.sort()).toEqual(["mark_no_show", "undo_no_show"]);
        for (const action of noShowRelated) {
            expect(sendsCustomerEmail(action)).toBe(false);
        }
    });
});

// Guardrail sul sorgente dell'edge: la matrice può restare corretta mentre il
// gate viene rimosso dall'handler. Qui si verifica che l'unico invio passi
// dietro `sendsCustomerEmail` e che il builder non sia raggiungibile prima.
describe("respond-reservation — il gate email è cablato nell'handler", () => {
    const source = readFileSync(
        resolve(process.cwd(), "supabase/functions/respond-reservation/index.ts"),
        "utf-8"
    );

    it("importa e usa sendsCustomerEmail", () => {
        expect(source).toContain("sendsCustomerEmail");
        expect(source).toContain("if (!sendsCustomerEmail(action))");
    });

    it("esiste un solo punto di invio e sta dopo il gate", () => {
        const sends = source.match(/resend\.emails\.send\(/g) ?? [];
        expect(sends).toHaveLength(1);
        expect(source.indexOf("if (!sendsCustomerEmail(action))")).toBeLessThan(
            source.indexOf("resend.emails.send(")
        );
    });

    it("esiste una sola costruzione di email e sta dopo il gate", () => {
        const builds = source.match(/buildActionEmail\(\{/g) ?? [];
        expect(builds).toHaveLength(1);
        expect(source.indexOf("if (!sendsCustomerEmail(action))")).toBeLessThan(
            source.indexOf("buildActionEmail({")
        );
    });

    // La guardia che tiene `cancel_by_customer` fuori dall'endpoint admin è
    // una riga sola, e una riga sola si toglie per sbaglio. Se sparisce,
    // questi test devono rompersi: il rifiuto non è un dettaglio di stile, è
    // ciò che impedisce a un admin autenticato di cancellare una prenotazione
    // `pending` per una strada che nessuno ha rivisto.
    it("valida l'azione con isAdminAction, non con isReservationAction", () => {
        expect(source).toContain("if (!isAdminAction(rawAction))");
        expect(source).not.toMatch(/isReservationAction\(/);
    });

    it("non nomina mai cancel_by_customer come azione ammessa", () => {
        expect(source).not.toContain('"cancel_by_customer"');
        expect(source).not.toContain("'cancel_by_customer'");
    });

    it("il compare-and-set usa .in('status', …) sulla lista attesa", () => {
        expect(source).toContain('.in("status", expectedFrom)');
        expect(source).not.toContain('.eq("status", expectedFrom)');
    });
});
