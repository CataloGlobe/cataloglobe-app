import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Nell'HTML iniziale (CSS inline) vanno solo i font sopra la piega: Caveat e
// Inter arrivano dopo l'evento load (lateFonts.ts), per non togliere banda all'hero.
const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");
const families = (css: string) => [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);

describe("font della landing", () => {
    it("_fonts.scss importa solo app-campaign.css", () => {
        const scss = read("src/pages/CampaignLanding/styles/_fonts.scss");
        expect([...scss.matchAll(/@import url\("([^"]+)"\)/g)].map((m) => m[1])).toEqual(["/fonts/app-campaign.css"]);
    });

    it("app-campaign.css ha solo i font dell'hero, Caveat sta nel foglio tardivo", () => {
        expect(families(read("public/fonts/app-campaign.css"))).toEqual(["Young Serif", "Instrument Sans Variable"]);
        expect(families(read("public/fonts/app-campaign-late.css"))).toEqual(["Caveat"]);
    });

    it("lateFonts.ts carica Caveat e Inter", () => {
        const src = read("src/pages/CampaignLanding/lateFonts.ts");
        expect(src).toContain('"/fonts/app-campaign-late.css"');
        expect(src).toContain('"/fonts/app-inter.css"');
    });
});
