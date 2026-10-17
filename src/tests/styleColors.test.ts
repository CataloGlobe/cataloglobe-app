import { describe, expect, it } from "vitest";
import { borderColor, contrastRatio, fixContrast, isDarkPage, lum, mix, onColor, suggestedChrome, tintDark } from "@/features/public/utils/styleColors";
import { borderRadiusToPx, deriveSurface, getPatternCss, mapStyleTokensToCssVars } from "@/features/public/utils/mapStyleTokensToCssVars";
import { contourPath } from "@/features/public/utils/patternContour";
import { DEFAULT_STYLE_TOKENS, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

// Regole dei colori dell'editor stili (spec §2). I valori attesi sono quelli che
// calcola il simulatore dell'editor (`sim-v5.mjs`) sugli stessi colori.
const SIM: Record<string, { dark: boolean; surf: string; gold: string; violet: string; dk: string; dk12: string; bd: string }> = {
    "#F6F6FA": { dark: false, surf: "#FFFFFF", gold: "#856c3d", violet: "#5558E0", dk: "#161622", dk12: "#181825", bd: "#c6c6c8" },
    "#FFFFFF": { dark: false, surf: "#FFFFFF", gold: "#8d7340", violet: "#5558E0", dk: "#1C1C1C", dk12: "#1F1F1F", bd: "#cdcdcc" },
    "#F7F0E3": { dark: false, surf: "#FFFFFF", gold: "#81693b", violet: "#5558E0", dk: "#221E16", dk12: "#252118", bd: "#c7c1b6" },
    "#17131A": { dark: true, surf: "#332f35", gold: "#C9A45C", violet: "#8f91eb", dk: "#1D1820", dk12: "#1F1A23", bd: "rgb(255 255 255 / 28%)" },
    "#2E5E4E": { dark: true, surf: "#477163", gold: "#f2e9d8", violet: "#e7e8fb", dk: "#16221E", dk12: "#182521", bd: "rgb(255 255 255 / 28%)" }
};

const tokens = (patch: Partial<{ bg: string; primary: string; accent: string; chrome: "light" | "dark"; treatment: StyleTokenModel["appearance"]["cardTreatment"] }>): StyleTokenModel => ({
    ...DEFAULT_STYLE_TOKENS,
    colors: { pageBackground: patch.bg ?? "#F6F6FA", primary: patch.primary ?? "#5558E0", accent: patch.accent },
    appearance: { ...DEFAULT_STYLE_TOKENS.appearance, cardTreatment: patch.treatment ?? "glass" },
    header: { ...DEFAULT_STYLE_TOKENS.header, chrome: patch.chrome }
});

describe("styleColors, come il simulatore dell'editor", () => {
    for (const [bg, want] of Object.entries(SIM)) {
        it(`pagina ${bg}`, () => {
            expect(isDarkPage(bg)).toBe(want.dark);
            expect(deriveSurface(bg).toLowerCase()).toBe(want.surf.toLowerCase());
            expect(fixContrast("#C9A45C", [bg, want.surf])).toBe(want.gold);
            expect(fixContrast("#5558E0", [bg, want.surf])).toBe(want.violet);
            expect(tintDark(bg)).toBe(want.dk);
            expect(tintDark(bg, 0.12)).toBe(want.dk12);
            expect(borderColor(false, bg, "#5558E0")).toBe(want.bd);
        });
    }

    it("il principale corretto fa almeno 4,5:1 su pagina e riquadro", () => {
        for (const [bg, want] of Object.entries(SIM)) {
            expect(contrastRatio(want.gold, bg)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(want.gold, want.surf)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("testo sui pulsanti: bianco o quasi nero", () => {
        expect(onColor("#C85035")).toBe("#FFFFFF");
        expect(onColor("#C9A45C")).toBe("#111111");
    });

    it("contorno nel colore principale", () => {
        expect(borderColor(true, "#FFFFFF", "#5558E0")).toBe("#5558E0");
    });

    it("consiglio Chiari/Scuri come l'editor", () => {
        expect(suggestedChrome("#F6F6FA")).toBe("light");
        expect(suggestedChrome("#17131A")).toBe("light");
        expect(suggestedChrome("#F7F0E3")).toBe("dark");
    });

    it("lum e mix ai bordi", () => {
        expect(lum("#FFFFFF")).toBeCloseTo(1);
        expect(lum("#000")).toBe(0);
        expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    });
});

describe("mapStyleTokensToCssVars, regole nuove", () => {
    it("testo caldo e principale corretto su pagina chiara", () => {
        const v = mapStyleTokensToCssVars(tokens({ bg: "#FFFFFF", primary: "#C9A45C" }));
        expect(v["--pub-bg-text"]).toBe("#1B1A17");
        expect(v["--pub-primary"]).toBe("#8d7340");
        expect(v["--pub-header-bg"]).toBe("#C9A45C");
    });

    it("pagina scura: testo chiaro e riquadro schiarito", () => {
        const v = mapStyleTokensToCssVars(tokens({ bg: "#17131A", primary: "#C9A45C" }));
        expect(v["--pub-bg-text"]).toBe("#F3F1EC");
        expect(v["--pub-surface"]).toBe("#332f35");
        expect(v["--pub-card-glass"]).toBe("rgba(60,56,52,.45)");
    });

    it("parti fisse scure nel tono della pagina, chiare bianche", () => {
        const dark = mapStyleTokensToCssVars(tokens({ bg: "#F7F0E3", chrome: "dark", treatment: "raised" }));
        expect(dark["--pub-chrome-bg"]).toBe("#221E16");
        expect(dark["--pub-sheet-bg"]).toBe("#252118");
        const glass = mapStyleTokensToCssVars(tokens({ bg: "#F7F0E3", chrome: "dark", treatment: "glass" }));
        expect(glass["--pub-chrome-bg"]).toBe("rgb(34 30 22 / 80%)");
        const light = mapStyleTokensToCssVars(tokens({ bg: "#F6F6FA", chrome: "light", treatment: "glass" }));
        expect(light["--pub-chrome-bg"]).toBe("rgb(255 255 255 / 70%)");
        expect(light["--pub-sheet-bg"]).toBe("#F7F5F1");
        expect(light["--pub-chrome-text"]).toBe("#1B1A17");
    });

    it("uno stile di prima (senza chrome) ha le parti fisse scure come oggi", () => {
        const v = mapStyleTokensToCssVars(tokens({ treatment: "raised" }));
        expect(v["--pub-chrome-text"]).toBe("#FFFFFF");
    });

    it("contorno da 0,5px sulle parti fisse", () => {
        const v = mapStyleTokensToCssVars(tokens({ bg: "#FFFFFF", chrome: "light", treatment: "bordered" }));
        expect(v["--pub-chrome-border"]).toBe(".5px solid #cdcdcc");
    });

    it("pulsanti: colore proprio corretto contro il suo testo", () => {
        const v = mapStyleTokensToCssVars(tokens({ accent: "#C85035" }));
        expect(v["--pub-accent"]).toBe("#C85035");
        expect(v["--pub-cta-text"]).toBe("#FFFFFF");
    });

    it("ombra più netta su pagina quasi bianca", () => {
        const white = mapStyleTokensToCssVars(tokens({ bg: "#FFFFFF", treatment: "raised" }));
        const cream = mapStyleTokensToCssVars(tokens({ bg: "#F7F0E3", treatment: "raised" }));
        expect(white["--pub-card-shadow"].startsWith("0 0 0 1px")).toBe(true);
        expect(cream["--pub-card-shadow"].startsWith("0 1px 2px")).toBe(true);
    });

    it("angoli dell'editor: 4/12/20 sui riquadri", () => {
        expect(borderRadiusToPx("none")).toBe(4);
        expect(borderRadiusToPx("soft")).toBe(12);
        expect(borderRadiusToPx("rounded")).toBe(20);
        expect(mapStyleTokensToCssVars(tokens({}))["--pub-island-radius"]).toBe("22px");
    });
});

describe("disegni nuovi", () => {
    it("alone nel colore principale, abbassabile sotto la copertina", () => {
        const [img] = getPatternCss("glow", "#1B1A17", "medium", "#5558E0");
        expect(img).toContain("rgba(85,88,224,0.220)");
        expect(img).toContain("var(--pub-glow-y, 20px)");
    });

    it("lino e curve di livello sono tasselli SVG", () => {
        expect(getPatternCss("linen", "#1B1A17")[1]).toBe("240px 240px");
        expect(getPatternCss("contour", "#1B1A17")[1]).toBe("280px 280px");
        expect(contourPath().startsWith("M")).toBe(true);
    });
});
