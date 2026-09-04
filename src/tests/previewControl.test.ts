import { describe, it, expect } from "vitest";
import {
    detectRealDeviceFormat,
    listPreviewFormats,
    resolvePreviewFormat,
    shouldShowPreviewBar
} from "../pages/PublicCollectionPage/previewControl";

describe("previewControl — detectRealDeviceFormat", () => {
    it("maps width to the 640/1024 breakpoints", () => {
        expect(detectRealDeviceFormat(375)).toBe("mobile");
        expect(detectRealDeviceFormat(639)).toBe("mobile");
        expect(detectRealDeviceFormat(640)).toBe("tablet");
        expect(detectRealDeviceFormat(1023)).toBe("tablet");
        expect(detectRealDeviceFormat(1024)).toBe("desktop");
    });
});

describe("previewControl — listPreviewFormats (≤ real device)", () => {
    it("desktop offers all three, ordered desktop → mobile", () => {
        expect(listPreviewFormats("desktop")).toEqual(["desktop", "tablet", "mobile"]);
    });
    it("tablet offers tablet + mobile", () => {
        expect(listPreviewFormats("tablet")).toEqual(["tablet", "mobile"]);
    });
    it("mobile offers nothing to simulate (only itself)", () => {
        expect(listPreviewFormats("mobile")).toEqual(["mobile"]);
    });
});

describe("previewControl — resolvePreviewFormat", () => {
    const base = { realFormat: "desktop" as const, isMember: true };

    it("null / invalid param → no frame", () => {
        expect(resolvePreviewFormat({ ...base, previewParam: null })).toBeNull();
        expect(resolvePreviewFormat({ ...base, previewParam: "tv" })).toBeNull();
    });

    it("member on desktop → mobile/tablet frame, desktop is a no-op", () => {
        expect(resolvePreviewFormat({ ...base, previewParam: "mobile" })).toBe("mobile");
        expect(resolvePreviewFormat({ ...base, previewParam: "tablet" })).toBe("tablet");
        expect(resolvePreviewFormat({ ...base, previewParam: "desktop" })).toBeNull();
    });

    it("non-member (or unknown yet) → never a frame, identical to anonymous", () => {
        expect(resolvePreviewFormat({ ...base, isMember: false, previewParam: "mobile" })).toBeNull();
        expect(resolvePreviewFormat({ ...base, isMember: null, previewParam: "mobile" })).toBeNull();
    });

    it("formats larger than the real device are refused", () => {
        expect(
            resolvePreviewFormat({ realFormat: "tablet", isMember: true, previewParam: "desktop" })
        ).toBeNull();
        expect(
            resolvePreviewFormat({ realFormat: "tablet", isMember: true, previewParam: "mobile" })
        ).toBe("mobile");
    });

    it("real mobile device ignores the param entirely", () => {
        expect(
            resolvePreviewFormat({ realFormat: "mobile", isMember: true, previewParam: "mobile" })
        ).toBeNull();
    });
});

describe("previewControl — shouldShowPreviewBar", () => {
    it("shows only for members, outside an iframe, when a smaller format exists", () => {
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "desktop", isFramed: false, hasSimulate: false })).toBe(true);
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "tablet", isFramed: false, hasSimulate: false })).toBe(true);
    });
    it("hidden for non-members / unknown membership", () => {
        expect(shouldShowPreviewBar({ isMember: false, realFormat: "desktop", isFramed: false, hasSimulate: false })).toBe(false);
        expect(shouldShowPreviewBar({ isMember: null, realFormat: "desktop", isFramed: false, hasSimulate: false })).toBe(false);
    });
    it("hidden on a real mobile device (nothing to offer)", () => {
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "mobile", isFramed: false, hasSimulate: false })).toBe(false);
    });
    it("shown on a real mobile device when simulate is active (date must surface)", () => {
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "mobile", isFramed: false, hasSimulate: true })).toBe(true);
        expect(shouldShowPreviewBar({ isMember: false, realFormat: "mobile", isFramed: false, hasSimulate: true })).toBe(false);
    });
    it("hidden inside the preview iframe (the host window owns the bar)", () => {
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "desktop", isFramed: true, hasSimulate: true })).toBe(false);
        expect(shouldShowPreviewBar({ isMember: true, realFormat: "desktop", isFramed: true, hasSimulate: false })).toBe(false);
    });
});
