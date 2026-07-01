import { describe, it, expect } from "vitest";
import {
    EPS,
    cover,
    dims,
    containZoom,
    offset,
    hasBands,
    clamp01,
    applyDrag,
    maxZoom
} from "@/components/ui/ImageReframeEditor/reframeGeometry";

// Frame box used across cases: a 16:9 viewport (1600x900).
const FW = 1600;
const FH = 900;
const R_16_9 = 16 / 9;

describe("cover", () => {
    it("returns the scale that fills the box (16:9 image in 16:9 box)", () => {
        // cover = max(fw/r, fh) = max(900, 900) = 900
        expect(cover(FW, FH, R_16_9)).toBeCloseTo(900, 5);
    });
});

describe("containZoom", () => {
    it("is exactly 1 for a 16:9 image in a 16:9 box (cover == contain)", () => {
        expect(containZoom(FW, FH, R_16_9)).toBeCloseTo(1, 5);
    });

    it("is < 1 for a wide 21:9 image", () => {
        const r = 21 / 9;
        expect(containZoom(FW, FH, r)).toBeLessThan(1);
    });

    it("is < 1 for a tall 4:5 image", () => {
        const r = 4 / 5;
        expect(containZoom(FW, FH, r)).toBeLessThan(1);
    });
});

describe("dims + hasBands", () => {
    it("16:9 image never shows bands at zoom 1", () => {
        const { dw, dh } = dims(FW, FH, R_16_9, 1);
        expect(hasBands(FW, FH, dw, dh)).toBe(false);
    });

    it("wide 21:9 image: no bands at zoom 1, vertical bands (dh < fh) at containZoom", () => {
        const r = 21 / 9;
        const atOne = dims(FW, FH, r, 1);
        expect(hasBands(FW, FH, atOne.dw, atOne.dh)).toBe(false);

        const cz = containZoom(FW, FH, r);
        const atContain = dims(FW, FH, r, cz);
        expect(hasBands(FW, FH, atContain.dw, atContain.dh)).toBe(true);
        expect(atContain.dh).toBeLessThan(FH - EPS); // top/bottom bands
        expect(atContain.dw).toBeCloseTo(FW, 3); // width fills exactly
    });

    it("tall 4:5 image: lateral bands (dw < fw) at containZoom", () => {
        const r = 4 / 5;
        const cz = containZoom(FW, FH, r);
        const atContain = dims(FW, FH, r, cz);
        expect(hasBands(FW, FH, atContain.dw, atContain.dh)).toBe(true);
        expect(atContain.dw).toBeLessThan(FW - EPS); // left/right bands
        expect(atContain.dh).toBeCloseTo(FH, 3); // height fills exactly
    });
});

describe("offset", () => {
    it("centers the underflow axis and pans the overflow axis at focal limits", () => {
        // Tall 4:5 image at zoom 0.7: dw < fw (underflow x), dh > fh (overflow y).
        const r = 4 / 5;
        const { dw, dh } = dims(FW, FH, r, 0.7);
        expect(dw).toBeLessThan(FW);
        expect(dh).toBeGreaterThan(FH);

        // Underflow x is centered regardless of focal.
        const centered = offset(FW, FH, dw, dh, 0, 0.5);
        expect(centered.ox).toBeCloseTo((FW - dw) / 2, 5);

        // Overflow y at focal 0 -> top aligned (oy = 0).
        const top = offset(FW, FH, dw, dh, 0.5, 0);
        expect(top.oy).toBeCloseTo(0, 5);

        // Overflow y at focal 1 -> bottom aligned (oy = fh - dh, negative).
        const bottom = offset(FW, FH, dw, dh, 0.5, 1);
        expect(bottom.oy).toBeCloseTo(FH - dh, 5);
    });
});

describe("clamp01", () => {
    it("clamps below 0 and above 1", () => {
        expect(clamp01(-0.3)).toBe(0);
        expect(clamp01(1.7)).toBe(1);
        expect(clamp01(0.42)).toBeCloseTo(0.42, 5);
    });
});

describe("applyDrag", () => {
    it("does not move an axis that is not in overflow, moves the overflow axis, clamps 0..1", () => {
        // Tall image at zoom 1: x underflow (no pan), y overflow (pans).
        const r = 4 / 5;
        const { dw, dh } = dims(FW, FH, r, 1);

        const start = { x: 0.5, y: 0.5 };
        const next = applyDrag(start, 100, 100, dw, dh, FW, FH);
        expect(next.x).toBe(0.5); // rx <= 0 -> unchanged
        expect(next.y).not.toBe(0.5); // ry > 0 -> moved
        expect(next.y).toBeGreaterThanOrEqual(0);
        expect(next.y).toBeLessThanOrEqual(1);

        // Large drag clamps into [0,1].
        const clamped = applyDrag({ x: 0.5, y: 0.9 }, 0, -100000, dw, dh, FW, FH);
        expect(clamped.y).toBeGreaterThanOrEqual(0);
        expect(clamped.y).toBeLessThanOrEqual(1);
    });
});

describe("maxZoom", () => {
    it("clamps to hardCap for large images", () => {
        // 4000x2250 (16:9), plenty of resolution -> caps at 3.
        expect(maxZoom(4000, 2250)).toBeCloseTo(3, 5);
    });

    it("never drops below 1 for low-resolution images", () => {
        // 320x180 -> raw cap ~0.33, clamped up to 1 (cover must stay reachable).
        expect(maxZoom(320, 180)).toBe(1);
    });

    it("respects a custom hardCap", () => {
        expect(maxZoom(4000, 2250, 16 / 9, 960, 2)).toBeCloseTo(2, 5);
    });
});
