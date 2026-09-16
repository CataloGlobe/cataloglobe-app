import { describe, it, expect } from "vitest";
import {
    GROUP_NOT_VERIFIED_MESSAGE,
    SEATING_HAS_BILLS_MESSAGE,
    isOpenOrdersNeedAction,
    openOrdersNeedActionMessage,
    parseOpenOrdersNeedAction,
    translateSeatingRpcMessage
} from "@/services/supabase/seatingRpcMessages";

describe("parseOpenOrdersNeedAction — l'unico numero letto da un messaggio", () => {
    it("legge il conteggio", () => {
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:1")).toBe(1);
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:12")).toBe(12);
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION: 3 ")).toBe(3);
    });

    it("formato che non torna → null, mai NaN", () => {
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:")).toBeNull();
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:boh")).toBeNull();
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:0")).toBeNull();
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:-2")).toBeNull();
        expect(parseOpenOrdersNeedAction("OPEN_ORDERS_NEED_ACTION:1.5")).toBeNull();
    });

    it("un altro messaggio → null", () => {
        expect(parseOpenOrdersNeedAction("p_reason must be one of operator | auto")).toBeNull();
        expect(parseOpenOrdersNeedAction(undefined)).toBeNull();
        expect(parseOpenOrdersNeedAction(null)).toBeNull();
        expect(isOpenOrdersNeedAction("SEATING_HAS_BILLS: x")).toBe(false);
    });
});

describe("openOrdersNeedActionMessage — la rete di sicurezza parla italiano", () => {
    it("con il numero", () => {
        expect(openOrdersNeedActionMessage(1)).toBe(
            "C'è un ordine ancora aperto su questa tavolata: va chiuso dalle comande prima di concludere il servizio."
        );
        expect(openOrdersNeedActionMessage(3)).toBe(
            "Ci sono 3 ordini ancora aperti su questa tavolata: vanno chiusi dalle comande prima di concludere il servizio."
        );
    });

    it("senza numero (formato rotto): frase sensata, nessun NaN", () => {
        const msg = openOrdersNeedActionMessage(null);
        expect(msg).toBe(
            "Ci sono ordini ancora aperti su questa tavolata: vanno chiusi dalle comande prima di concludere il servizio."
        );
        expect(msg).not.toContain("NaN");
    });
});

describe("translateSeatingRpcMessage — nessun codice arriva a un toast", () => {
    it("OPEN_ORDERS_NEED_ACTION:<n>", () => {
        expect(translateSeatingRpcMessage("OPEN_ORDERS_NEED_ACTION:2")).toBe(
            openOrdersNeedActionMessage(2)
        );
        expect(translateSeatingRpcMessage("OPEN_ORDERS_NEED_ACTION:zz")).toBe(
            openOrdersNeedActionMessage(null)
        );
    });

    it("SEATING_HAS_BILLS: il motivo vero, non «ci sono ordini aperti»", () => {
        expect(
            translateSeatingRpcMessage(
                "SEATING_HAS_BILLS: this seating produced orders (open or closed bills) and cannot be undone"
            )
        ).toBe(SEATING_HAS_BILLS_MESSAGE);
        expect(SEATING_HAS_BILLS_MESSAGE).toContain("senza nessuno a cui attribuirli");
        expect(SEATING_HAS_BILLS_MESSAGE).not.toMatch(/aperti/);
        // Niente «…» annidate: il toast è già fra virgolette.
        expect(SEATING_HAS_BILLS_MESSAGE).not.toMatch(/[«»]/);
    });

    it("GROUP_NOT_VERIFIED", () => {
        expect(
            translateSeatingRpcMessage("GROUP_NOT_VERIFIED: acknowledge the first order to verify the table")
        ).toBe(GROUP_NOT_VERIFIED_MESSAGE);
    });

    it("gli altri messaggi passano com'erano", () => {
        expect(translateSeatingRpcMessage("Only an open seating can be undone (status closed).")).toBe(
            "Only an open seating can be undone (status closed)."
        );
        expect(translateSeatingRpcMessage(undefined)).toBeNull();
    });

    it("niente gergo del dominio nei testi", () => {
        for (const t of [
            SEATING_HAS_BILLS_MESSAGE,
            GROUP_NOT_VERIFIED_MESSAGE,
            openOrdersNeedActionMessage(2)
        ]) {
            expect(t).not.toMatch(/gruppo|verificat|risoluzion/i);
        }
    });
});
