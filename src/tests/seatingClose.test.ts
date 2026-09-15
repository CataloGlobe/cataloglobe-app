import { describe, it, expect } from "vitest";
import {
    closeAnswerLabel,
    closeQuestionText,
    closeQuestionTitle,
    formatPendingOrdersRow,
    notDeliverableReason,
    seatingCloseFlowFor
} from "@/pages/Dashboard/Reservations/seatingClose";

describe("seatingCloseFlowFor — quando «Servizio concluso» chiede", () => {
    it("nessun ordine da decidere: chiude diretto", () => {
        expect(
            seatingCloseFlowFor({ pending_orders_count: 0, pending_orders_deliverable: true })
        ).toEqual({ kind: "direct" });
    });

    it("nessun ordine ma deliverable false (vacuo): chiude diretto lo stesso", () => {
        expect(
            seatingCloseFlowFor({ pending_orders_count: 0, pending_orders_deliverable: false })
        ).toEqual({ kind: "direct" });
    });

    it("ordini da decidere, serviti ammissibile: chiede con entrambe le risposte", () => {
        expect(
            seatingCloseFlowFor({ pending_orders_count: 2, pending_orders_deliverable: true })
        ).toEqual({ kind: "ask", pendingOrders: 2, options: ["deliver", "cancel"] });
    });

    it("ordini da decidere, mai confermati: solo «annullati» — «serviti» non si disegna", () => {
        expect(
            seatingCloseFlowFor({ pending_orders_count: 1, pending_orders_deliverable: false })
        ).toEqual({ kind: "ask", pendingOrders: 1, options: ["cancel"] });
    });
});

describe("i testi della domanda — numeri dal dato, singolare e plurale", () => {
    it("titolo, singolare e plurale", () => {
        expect(closeQuestionTitle(1)).toBe("C'è un ordine ancora aperto");
        expect(closeQuestionTitle(3)).toBe("Ci sono ordini ancora aperti");
    });

    it("un ordine", () => {
        expect(closeQuestionText(1)).toBe(
            "C'è un ordine ancora aperto su questa tavolata. Prima di concludere il servizio, dì cosa è successo."
        );
        expect(closeAnswerLabel("deliver", 1)).toBe("È stato servito");
        expect(closeAnswerLabel("cancel", 1)).toBe("È stato annullato");
        expect(notDeliverableReason(1)).toBe(
            "Questo ordine non è mai stato confermato dal locale, quindi non si può segnare come servito."
        );
    });

    it("più ordini", () => {
        expect(closeQuestionText(3)).toBe(
            "Ci sono 3 ordini ancora aperti su questa tavolata. Prima di concludere il servizio, dì cosa è successo."
        );
        expect(closeAnswerLabel("deliver", 3)).toBe("Sono stati serviti");
        expect(closeAnswerLabel("cancel", 3)).toBe("Sono stati annullati");
        expect(notDeliverableReason(3)).toBe(
            "Questi ordini non sono mai stati confermati dal locale, quindi non si possono segnare come serviti."
        );
    });

    it("la riga nella lista è un frammento, senza punto", () => {
        expect(formatPendingOrdersRow(1)).toBe("1 ordine ancora aperto");
        expect(formatPendingOrdersRow(4)).toBe("4 ordini ancora aperti");
    });
});
