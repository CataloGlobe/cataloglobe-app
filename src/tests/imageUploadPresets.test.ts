import { describe, it, expect } from "vitest";
import {
    deriveCompressProfile,
    resolveShowFillPanel,
    IMAGE_UPLOAD_PRESETS
} from "@/components/ui/ImageUploadEditor/imageUploadPresets";

describe("deriveCompressProfile", () => {
    it("è simmetrico per un ratio 1:1 (fix del logo 512×256)", () => {
        const p = deriveCompressProfile(1, { longEdge: 512, headroom: 1 });
        expect(p.maxWidth).toBe(512);
        expect(p.maxHeight).toBe(512);
        expect(p.format).toBe("webp");
    });

    it("mantiene il ratio del frame per 16:9", () => {
        const p = deriveCompressProfile(16 / 9, { longEdge: 1280, headroom: 1 });
        expect(p.maxWidth).toBe(1280);
        expect(p.maxHeight).toBe(720);
    });

    it("mette il lato lungo su altezza per un ratio verticale (<1)", () => {
        const p = deriveCompressProfile(4 / 5, { longEdge: 1000, headroom: 1 });
        expect(p.maxHeight).toBe(1000);
        expect(p.maxWidth).toBe(800);
    });

    it("applica l'headroom per lo zoom di crop", () => {
        const p = deriveCompressProfile(1, { longEdge: 500, headroom: 1.5 });
        expect(p.maxWidth).toBe(750);
        expect(p.maxHeight).toBe(750);
    });

    it("è resiliente a un aspectRatio non valido (0 → trattato come 1)", () => {
        const p = deriveCompressProfile(0, { longEdge: 400, headroom: 1 });
        expect(p.maxWidth).toBe(400);
        expect(p.maxHeight).toBe(400);
    });
});

describe("resolveShowFillPanel", () => {
    it("nasconde il pannello se l'unica modalità è 'none'", () => {
        expect(resolveShowFillPanel(["none"])).toBe(false);
    });

    it("mostra il pannello se esiste almeno una modalità non-none", () => {
        expect(resolveShowFillPanel(["color", "none"])).toBe(true);
        expect(resolveShowFillPanel(["blur", "dominant", "color", "none"])).toBe(true);
    });

    it("nasconde il pannello per lista vuota", () => {
        expect(resolveShowFillPanel([])).toBe(false);
    });
});

describe("IMAGE_UPLOAD_PRESETS", () => {
    it("marca logo/coverSede/avatar/gallery/storyCover come ready", () => {
        for (const key of ["logo", "coverSede", "avatar", "gallery", "storyCover"] as const) {
            expect(IMAGE_UPLOAD_PRESETS[key].status).toBe("ready");
        }
    });

    it("marca product/featured/storyBlock come documentary", () => {
        for (const key of ["product", "featured", "storyBlock"] as const) {
            expect(IMAGE_UPLOAD_PRESETS[key].status).toBe("documentary");
        }
    });

    it("il logo è 1:1 (non più 2:1)", () => {
        expect(IMAGE_UPLOAD_PRESETS.logo.aspectRatio).toBe(1);
    });
});
