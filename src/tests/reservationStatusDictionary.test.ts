import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// §14, §18.5: un dizionario solo degli stati (`statusMeta`). Il test di
// `statusMeta` non vedeva la mappa locale dell'Agenda, che diceva ancora
// «Completata» e «In attesa»: questa guardia legge i file della pagina.
describe("Prenotazioni: nessun dizionario degli stati fuori da statusMeta", () => {
    // Si cerca la voce di un dizionario (`label: "…"`), non la parola: «in
    // attesa» è anche lo stato di un promemoria, che non è una prenotazione.
    it("i file della pagina non hanno voci «Completata» o «In attesa»", () => {
        const dir = resolve(__dirname, "../pages/Dashboard/Reservations");
        const files = readdirSync(dir).filter(f => f.endsWith(".tsx"));
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
            const src = readFileSync(resolve(dir, f), "utf8");
            expect(src, f).not.toMatch(/label:\s*"(Completata|In attesa)"/);
        }
    });
});
