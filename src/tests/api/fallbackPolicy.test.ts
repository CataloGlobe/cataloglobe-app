import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { FALLBACK_RETRY_AFTER_SECONDS, fallbackPolicy } from "../../../api/_lib/fallbackPolicy";

describe("fallbackPolicy", () => {
    it.each(["invalid_slug", "invalid_lang", "domain_404"])("%s: 404 reale", reason => {
        expect(fallbackPolicy(reason)).toEqual({ status: 404, noindex: false });
    });

    it.each(["network_no_snapshot", "render_error"])("%s: 503 con Retry-After", reason => {
        expect(fallbackPolicy(reason)).toEqual({
            status: 503,
            noindex: false,
            retryAfterSeconds: FALLBACK_RETRY_AFTER_SECONDS
        });
    });

    it.each(["inactive", "subscription_inactive", "empty", "domain_400", "domain_403", "domain_410"])(
        "%s: 200 con noindex",
        reason => {
            expect(fallbackPolicy(reason)).toEqual({ status: 200, noindex: true });
        }
    );
});

describe("api/ssr-render usa fallbackPolicy", () => {
    const source = readFileSync(
        path.resolve(__dirname, "../../../api/ssr-render/index.ts"),
        "utf-8"
    );

    it("nessuno stato scritto a mano nelle chiamate al fallback", () => {
        expect(source).not.toMatch(/serveSpaFallback\(res,\s*\d/);
    });

    it("accetta HEAD come GET", () => {
        expect(source).toContain('req.method !== "GET" && req.method !== "HEAD"');
        expect(source).toContain('"Allow", "GET, HEAD"');
    });
});
