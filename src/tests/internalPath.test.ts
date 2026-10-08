import { describe, it, expect } from "vitest";
import { internalPathOr, isInternalPath } from "../utils/internalPath";

describe("isInternalPath — only paths inside the app (no open redirect)", () => {
    it("accepts app paths, with query and hash", () => {
        expect(isInternalPath("/business/abc/overview")).toBe(true);
        expect(isInternalPath("/business/abc/reservations?data=2026-10-07#r1")).toBe(true);
    });

    it("rejects empty, non-string and relative values", () => {
        expect(isInternalPath(undefined)).toBe(false);
        expect(isInternalPath(null)).toBe(false);
        expect(isInternalPath("")).toBe(false);
        expect(isInternalPath({ pathname: "/workspace" })).toBe(false);
        expect(isInternalPath("workspace")).toBe(false);
    });

    it("rejects other origins", () => {
        expect(isInternalPath("//evil.example")).toBe(false);
        expect(isInternalPath("https://evil.example/x")).toBe(false);
        expect(isInternalPath("javascript:alert(1)")).toBe(false);
        // The URL parser turns «\» into «/»: «/\evil» is «//evil».
        expect(isInternalPath("/\\evil.example")).toBe(false);
        expect(isInternalPath("/\tevil")).toBe(false);
    });
});

describe("internalPathOr — where to land after login", () => {
    it("keeps the deep link", () => {
        expect(internalPathOr("/business/abc/reservations?data=2026-10-07", "/workspace")).toBe(
            "/business/abc/reservations?data=2026-10-07"
        );
    });

    it("falls back when there is none or it leaves the app", () => {
        expect(internalPathOr(undefined, "/workspace")).toBe("/workspace");
        expect(internalPathOr("https://evil.example", "/workspace")).toBe("/workspace");
    });

    it("never sends back to the auth pages", () => {
        expect(internalPathOr("/login", "/workspace")).toBe("/workspace");
        expect(internalPathOr("/verify-otp", "/workspace")).toBe("/workspace");
    });
});
