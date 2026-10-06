import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "@/components/ui/Card/Card";
import { SettingRow } from "@/components/ui/SettingRow/SettingRow";

// Le regole delle sezioni messe nei componenti (correzioni UI, T1 punti 6 e 7).
describe("Card: regole delle sezioni", () => {
    it("vuota: una riga di testo al posto del body, l'azione resta nella testata", () => {
        const html = renderToStaticMarkup(
            h(Card, { title: "Allergeni", actions: h("button", null, "Aggiungi"), empty: "Nessun allergene indicato." }, h("div", null, "contenuto"))
        );
        expect(html).toContain("Nessun allergene indicato.");
        expect(html).not.toContain("contenuto");
        expect(html.match(/Aggiungi/g)).toHaveLength(1);
    });

    it("a riga singola: titolo, frase e bottone, niente body", () => {
        const html = renderToStaticMarkup(
            h(
                Card,
                { layout: "row", title: "QR della sede", subtitle: "Da stampare sui tavoli.", actions: h("button", null, "Scarica") },
                h("div", null, "corpo")
            )
        );
        expect(html).toContain("Da stampare sui tavoli.");
        expect(html).toContain("Scarica");
        expect(html).not.toContain("corpo");
    });

    it("selettore del modo accanto al titolo, nella testata", () => {
        const html = renderToStaticMarkup(
            h(Card, { title: "Prezzo", modeSelector: h("span", null, "Prezzo unico") }, h("div", null, "campi"))
        );
        expect(html.indexOf("<header")).toBeLessThan(html.indexOf("Prezzo unico"));
        expect(html.indexOf("Prezzo unico")).toBeLessThan(html.indexOf("</header>"));
    });
});

describe("SettingRow", () => {
    it("nome come label del controllo e campi dipendenti sotto la riga", () => {
        const html = renderToStaticMarkup(
            h(
                SettingRow,
                { label: "Prenotazioni", description: "I clienti chiedono un tavolo.", htmlFor: "r", control: h("input", { id: "r" }) },
                h("span", null, "Posti massimi")
            )
        );
        expect(html).toMatch(/<label[^>]*for="r"/);
        expect(html.indexOf("<input")).toBeLessThan(html.indexOf("Posti massimi"));
    });
});
