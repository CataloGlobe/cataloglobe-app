import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_TOKENS, parseTokens, serializeTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

// Campi dell'editor stili nuovo (D119): uno stile salvato prima resta com'era,
// uno nuovo torna uguale dopo salvataggio e rilettura.

const OLD_STYLE = {
    colors: { pageBackground: "#FFFFFF", primary: "#6366f1" },
    typography: { fontFamily: "inter" },
    appearance: { borderRadius: "rounded", backgroundPattern: "dots", patternIntensity: "medium", featuredStyle: "card", cardTreatment: "raised" },
    header: { showLogo: true, showCoverImage: true, showActivityName: true, showCatalogName: true, showAddress: false },
    navigation: { style: "filled" },
    card: { layout: "list", productStyle: "card", image: { mode: "show", position: "left" } }
};

describe("StyleTokenModel, campi dell'editor nuovo", () => {
    it("uno stile vecchio non prende campi nuovi e si salva identico", () => {
        const model = parseTokens(OLD_STYLE);
        expect(model.header.chrome).toBeUndefined();
        expect(model.card.categoryTitle).toBeUndefined();
        expect(model.meta).toBeUndefined();
        expect(serializeTokens(model)).toEqual(OLD_STYLE);
    });

    it("i valori nuovi passano andata e ritorno", () => {
        const raw = {
            ...OLD_STYLE,
            appearance: { ...OLD_STYLE.appearance, backgroundPattern: "glow", featuredStyle: "image" },
            header: { ...OLD_STYLE.header, chrome: "light" },
            card: { ...OLD_STYLE.card, compactLayoutStyle: "centered", categoryTitle: "icon", image: { mode: "show", position: "right" } },
            meta: { preset: "trattoria" }
        };
        const model = parseTokens(raw);
        expect(model.appearance.backgroundPattern).toBe("glow");
        expect(model.appearance.featuredStyle).toBe("image");
        expect(model.header.chrome).toBe("light");
        expect(model.card.compactLayoutStyle).toBe("centered");
        expect(model.card.categoryTitle).toBe("icon");
        expect(model.meta?.preset).toBe("trattoria");
        expect(serializeTokens(model)).toEqual(raw);
    });

    it("chrome dark si salva (assente vuol dire stile di prima)", () => {
        const model = parseTokens({ ...OLD_STYLE, header: { ...OLD_STYLE.header, chrome: "dark" } });
        expect(serializeTokens(model).header).toMatchObject({ chrome: "dark" });
    });

    it("i disegni nuovi linen e contour si leggono", () => {
        for (const p of ["linen", "contour"] as const) {
            expect(parseTokens({ ...OLD_STYLE, appearance: { ...OLD_STYLE.appearance, backgroundPattern: p } }).appearance.backgroundPattern).toBe(p);
        }
    });

    it("valori sconosciuti tornano ai predefiniti", () => {
        const model = parseTokens({
            ...OLD_STYLE,
            appearance: { ...OLD_STYLE.appearance, backgroundPattern: "stelle", featuredStyle: "poster" },
            header: { ...OLD_STYLE.header, chrome: "primary" },
            card: { ...OLD_STYLE.card, compactLayoutStyle: "boh", categoryTitle: "dash" },
            meta: { preset: "inventato" }
        });
        expect(model.appearance.backgroundPattern).toBe("none");
        expect(model.appearance.featuredStyle).toBe("card");
        expect(model.header.chrome).toBeUndefined();
        expect(model.card.compactLayoutStyle).toBeUndefined();
        expect(model.card.categoryTitle).toBeUndefined();
        expect(model.meta).toBeUndefined();
    });

    it("i predefiniti non cambiano", () => {
        expect(parseTokens(null)).toBe(DEFAULT_STYLE_TOKENS);
        expect(DEFAULT_STYLE_TOKENS.header.chrome).toBeUndefined();
    });
});
