import { describe, expect, it, vi } from "vitest";
// i moduli del tunnel arrivano fino al client: qui non serve, e senza `.env` non partirebbe
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asEdit, newTunnel, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { OndaAsk } from "@/pages/Dashboard/Crea/CreaSteps";

// «Vuoi che i clienti lo vedano?»: il «No» di uno stile in onda (tunnel nuovi, punto 10).

const ALL = { all: true, activityIds: [], groupIds: [] };
const ask = (t: Tunnel) => renderToStaticMarkup(h(OndaAsk, { t, u: () => {} }));
const stile = (live: boolean) => asEdit({ ...newTunnel("stile", ALL), name: "Sera" }, "st1", { id: live ? "r1" : null, count: live ? 1 : 0, live });

describe("«In onda?»: il «No»", () => {
    it("uno stile in onda non si tiene pronto: si spegne, e torna lo stile di prima", () => {
        const html = ask(stile(true));
        expect(html).toContain("No, lo spengo");
        expect(html).toContain("Resta salvato, ma nessun cliente lo vede: nelle sue ore torna lo stile di prima.");
        expect(html).not.toContain("tengo pronto");
        // spegnere la sua voce spegnerebbe anche il menù: aspetta il database nuovo
        expect(html).toContain("Arriva col database nuovo");
    });

    it("uno stile non in onda, uno nuovo e un menù in onda si tengono pronti", () => {
        for (const t of [stile(false), newTunnel("stile", ALL), asEdit({ ...newTunnel("menu", ALL), name: "Pranzo" }, "m1", { id: "r1", count: 1, live: true })]) {
            const html = ask(t);
            expect(html).toContain("No, per ora lo tengo pronto");
            expect(html).toContain("Lo salvi completo, ma nessun cliente lo vede.");
            expect(html).not.toContain("lo spengo");
        }
    });

    it("il menù di base non si tiene pronto: il «No» è spento e dice perché (D238)", () => {
        const t = asEdit({ ...newTunnel("menu", ALL), name: "Alla carta" }, "m1", { id: "r1", count: 1, live: true, base: true });
        const html = ask(t);
        expect(html).toContain("Serve un altro menù di base");
        expect(html).toContain("Prima metti in onda un altro menù sempre e in tutte le sedi.");
        expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*lo tengo pronto/s);
    });
});
