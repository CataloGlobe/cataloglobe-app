// Il conteggio della rubrica non deve MAI uscire senza il suo ambito quando
// chi legge è un ruolo activity-scoped: le view sono security_invoker, quindi
// "1 assenza" per un manager può essere "5 assenze" per l'owner sullo stesso
// cliente. Se questi test cadono, l'interfaccia ha ricominciato a stampare
// numeri parziali come se fossero totali.
//
// Il secondo blocco difende il lessico: mai "no-show" in una stringa che
// l'utente legge.

import { describe, expect, it } from "vitest";
import {
    formatAbsenceCount,
    formatCustomerSince,
    formatVisitCount,
    visibilityFootnote,
    visitScopeSuffix
} from "@/utils/guestVisibilityCopy";

describe("guestVisibilityCopy", () => {
    it("qualifica i conteggi per i ruoli activity-scoped", () => {
        expect(formatVisitCount(3, false)).toBe("3 visite nelle tue sedi");
        expect(formatAbsenceCount(2, false)).toBe("2 assenze nelle tue sedi");
    });

    it("non aggiunge rumore per owner/admin, che vedono l'intera azienda", () => {
        expect(formatVisitCount(7, true)).toBe("7 visite");
        expect(formatAbsenceCount(5, true)).toBe("5 assenze");
        expect(visitScopeSuffix(true)).toBe("");
    });

    it("declina il singolare", () => {
        expect(formatVisitCount(1, true)).toBe("1 visita");
        expect(formatVisitCount(0, true)).toBe("0 visite");
        expect(formatAbsenceCount(1, true)).toBe("1 assenza");
    });

    it("formatta lo zero (nella scheda va mostrato comunque)", () => {
        expect(formatAbsenceCount(0, true)).toBe("0 assenze");
    });

    it("non usa mai il gergo inglese", () => {
        const strings = [
            formatVisitCount(3, false),
            formatAbsenceCount(2, false),
            visibilityFootnote(false) ?? ""
        ];
        for (const s of strings) {
            expect(s.toLowerCase()).not.toContain("no-show");
            expect(s.toLowerCase()).not.toContain("no show");
        }
    });

    it("riduce la prima visita a mese e anno", () => {
        expect(formatCustomerSince("2026-03-14")).toBe("marzo 2026");
        expect(formatCustomerSince(null)).toBe("—");
        expect(formatCustomerSince("non-una-data")).toBe("—");
    });

    it("spiega la parzialità solo a chi ha una vista parziale", () => {
        expect(visibilityFootnote(true)).toBeNull();
        expect(visibilityFootnote(false)).toContain("solo le sedi a cui hai accesso");
    });
});
