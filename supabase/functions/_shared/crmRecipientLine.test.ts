import { describe, expect, it } from "vitest";
import { keepRecipientLine, recipientLine, withRecipientLine } from "./crmRecipientLine";

const team = [
    { user_id: "a", display_name: "Alex" },
    { user_id: "l", display_name: "Lorenzo" },
    { user_id: "f", display_name: "Ferdinando" },
    { user_id: "x", display_name: null }
];

describe("recipientLine", () => {
    it("dice «Solo per te» quando l'avviso arriva a una persona", () => {
        expect(recipientLine(team, ["a"], "a")).toBe("👤 Solo per te");
        expect(recipientLine(team, ["a", "a"], "a")).toBe("👤 Solo per te");
    });

    it("nomina gli altri destinatari", () => {
        expect(recipientLine(team, ["a", "l"], "a")).toBe("👥 Per te e Lorenzo");
        expect(recipientLine(team, ["a", "l"], "l")).toBe("👥 Per te e Alex");
        expect(recipientLine(team, ["a", "l", "f"], "a")).toBe("👥 Per te, Lorenzo e Ferdinando");
    });

    it("chi non ha un nome diventa «un altro del team»", () => {
        expect(recipientLine(team, ["a", "x"], "a")).toBe("👥 Per te e un altro del team");
        expect(recipientLine([], ["a", "y", "z"], "a")).toBe("👥 Per te e altri 2 del team");
    });

    it("protegge i nomi per l'HTML di Telegram", () => {
        expect(recipientLine([{ user_id: "b", display_name: "<b>Bo</b> & co" }], ["a", "b"], "a")).toBe(
            "👥 Per te e &lt;b&gt;Bo&lt;/b&gt; &amp; co"
        );
    });
});

describe("withRecipientLine", () => {
    it("mette la riga in testa e lascia il resto", () => {
        const message = withRecipientLine({ text: "Lead nuovo", reply_markup: { k: 1 } }, team, ["a"], "a");
        expect(message).toEqual({ text: "👤 Solo per te\n\nLead nuovo", reply_markup: { k: 1 } });
    });
});

describe("keepRecipientLine", () => {
    it("riporta la riga dell'invio nel testo riscritto", () => {
        expect(keepRecipientLine("👥 Per te e Lorenzo\n\nVecchio", "Nuovo")).toBe("👥 Per te e Lorenzo\n\nNuovo");
    });

    it("non la raddoppia e non la inventa", () => {
        expect(keepRecipientLine("👤 Solo per te\n\nVecchio", "👤 Solo per te\n\nNuovo")).toBe("👤 Solo per te\n\nNuovo");
        expect(keepRecipientLine("Vecchio senza riga", "Nuovo")).toBe("Nuovo");
        expect(keepRecipientLine(undefined, "Nuovo")).toBe("Nuovo");
    });

    it("riprotegge i nomi tornati senza HTML", () => {
        expect(keepRecipientLine("👥 Per te e A&B\n\nx", "y")).toBe("👥 Per te e A&amp;B\n\ny");
    });
});
