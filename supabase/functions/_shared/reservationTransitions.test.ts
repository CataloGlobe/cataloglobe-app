import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
    ACTION_EXPECTS,
    ACTION_TO_STATUS,
    RESERVATION_ACTIONS,
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
        expect(ACTION_EXPECTS[action]).toBe(from);
        expect(ACTION_TO_STATUS[action]).toBe(to);
        expect(isTransitionAllowed(from, action)).toBe(true);
    });
});

describe("compare-and-set", () => {
    it("ACTION_EXPECTS copre ogni azione (è il valore passato a .eq('status', …))", () => {
        for (const action of RESERVATION_ACTIONS) {
            expect(ALL_STATUSES).toContain(ACTION_EXPECTS[action]);
        }
    });

    it("rifiuta ogni stato di partenza diverso da quello atteso", () => {
        for (const action of RESERVATION_ACTIONS) {
            for (const status of ALL_STATUSES) {
                expect(isTransitionAllowed(status, action)).toBe(
                    status === ACTION_EXPECTS[action]
                );
            }
        }
    });

    it("nessuna azione è un no-op (stato di arrivo ≠ stato atteso)", () => {
        for (const action of RESERVATION_ACTIONS) {
            expect(ACTION_TO_STATUS[action]).not.toBe(ACTION_EXPECTS[action]);
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

    it("ogni azione che scrive no_show o lo annulla è silenziosa", () => {
        const noShowRelated: ReservationAction[] = RESERVATION_ACTIONS.filter(
            a => ACTION_TO_STATUS[a] === "no_show" || ACTION_EXPECTS[a] === "no_show"
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
});
