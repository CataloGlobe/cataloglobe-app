import { describe, expect, it } from "vitest";
import { schedaLead } from "@/pages/Operativita/Attivita/scheda/schedaLead";
import type { SchedaFacts } from "@/pages/Operativita/Attivita/scheda/schedaModel";

const facts = (over: Partial<SchedaFacts> & { a?: Partial<SchedaFacts["a"]> } = {}): SchedaFacts =>
    ({
        now: { minutes: 18 * 60 + 42, weekday: 2, iso: "2026-10-15" },
        hasHours: true,
        spans: [
            { a: 12 * 60, b: 15 * 60 },
            { a: 19 * 60, b: 23 * 60 }
        ],
        closure: null,
        reopen: null,
        ...over,
        a: { name: "San Pietro", status: "active", inactive_reason: null, ...over.a }
    }) as unknown as SchedaFacts;

const text = (parts: ReturnType<typeof schedaLead>) => parts.map(p => Object.values(p)[0]).join("");

describe("schedaLead (Visual Redesign 2, PR 11b)", () => {
    it("aperta: fino a quando e il menù in onda", () => {
        const now = facts({ now: { minutes: 20 * 60, weekday: 2, iso: "2026-10-15" } as SchedaFacts["now"] });
        expect(text(schedaLead(now, "Cena"))).toBe("Adesso San Pietro è aperta fino alle 23 e i clienti vedono Cena.");
        expect(schedaLead(now, "Cena")).toContainEqual({ name: "Cena" });
        expect(text(schedaLead(now, null))).toBe("Adesso San Pietro è aperta fino alle 23, ma non mostra nessun menù.");
    });

    it("fra due turni: quando riapre", () => {
        expect(text(schedaLead(facts(), "Cena"))).toBe("Adesso San Pietro è chiusa: riapre alle 19.");
    });

    it("sospesa e chiusa oggi", () => {
        expect(text(schedaLead(facts({ a: { status: "inactive" } }), "Cena"))).toBe("San Pietro è sospesa: chi apre il link legge «Sospesa», non il menù.");
        const chiusa = facts({ closure: { is_closed: true } as SchedaFacts["closure"] });
        expect(schedaLead(chiusa, "Cena")).toContainEqual({ down: "chiusa" });
    });
});
