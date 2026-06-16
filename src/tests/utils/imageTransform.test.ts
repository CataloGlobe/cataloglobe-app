import { describe, it, expect } from "vitest";
import { buildCoverImageSet, COVER_WIDTHS } from "@/utils/imageTransform";

const STORAGE =
    "https://lxeawrpjfphgdspueiag.supabase.co/storage/v1/object/public/business-covers/t/act/cover.jpg";

describe("buildCoverImageSet", () => {
    it("rewrites object→render and emits one srcset entry per width", () => {
        const set = buildCoverImageSet(STORAGE);
        expect(set).not.toBeNull();
        const s = set!;
        expect(s.sizes).toBe("100vw");
        // render path
        expect(s.srcset).toContain("/storage/v1/render/image/public/");
        expect(s.srcset).not.toContain("/storage/v1/object/public/");
        // one descriptor per width
        for (const w of COVER_WIDTHS) {
            expect(s.srcset).toContain(`width=${w}&quality=82`);
            expect(s.srcset).toContain(` ${w}w`);
        }
        // entries count
        expect(s.srcset.split(",").length).toBe(COVER_WIDTHS.length);
    });

    it("src fallback is the 760w variant", () => {
        const s = buildCoverImageSet(STORAGE)!;
        expect(s.src).toContain("width=760&quality=82");
        expect(s.src).toContain("/storage/v1/render/image/public/");
    });

    it("preserves an existing ?v= cache-buster as extra &param (no overwrite)", () => {
        const s = buildCoverImageSet(`${STORAGE}?v=1777818448572`)!;
        expect(s.src).toContain("width=760&quality=82&v=1777818448572");
        // no double question mark
        expect(s.src.match(/\?/g)?.length).toBe(1);
    });

    it("emits no format param (Accept negotiation handles webp/avif)", () => {
        const s = buildCoverImageSet(STORAGE)!;
        expect(s.srcset).not.toContain("format=");
    });

    it("passthrough (null) for non-storage URLs", () => {
        expect(buildCoverImageSet("https://cdn.example.com/cover.jpg")).toBeNull();
    });

    it("passthrough (null) for non-https URLs", () => {
        expect(
            buildCoverImageSet(STORAGE.replace("https://", "http://"))
        ).toBeNull();
    });

    it("passthrough (null) for empty/nullish input", () => {
        expect(buildCoverImageSet(null)).toBeNull();
        expect(buildCoverImageSet(undefined)).toBeNull();
        expect(buildCoverImageSet("")).toBeNull();
    });
});
