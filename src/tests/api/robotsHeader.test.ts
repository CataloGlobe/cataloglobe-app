import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { robotsHeaderValue } from "../../../api/_lib/robotsHeader";
import { DEFAULT_STATUS_CANARY_SLUG, statusCanarySlug } from "../../../api/_lib/canarySlug";

describe("robotsHeaderValue", () => {
    it("produzione: nessun header", () => {
        expect(robotsHeaderValue("production")).toBeNull();
    });

    it.each(["preview", "development", undefined, ""])("%s: noindex, nofollow", env => {
        expect(robotsHeaderValue(env)).toBe("noindex, nofollow");
    });

    it("produzione: noindex sulla sede di test del canary, non sulle altre", () => {
        expect(robotsHeaderValue("production", "sede-canary", "sede-canary")).toBe("noindex, nofollow");
        expect(robotsHeaderValue("production", "sede-vera", "sede-canary")).toBeNull();
        expect(robotsHeaderValue("production", undefined, "sede-canary")).toBeNull();
        expect(robotsHeaderValue("production", "", "")).toBeNull();
    });

    it("lo slug di default del canary è quello del monitor", () => {
        delete process.env.STATUS_CANARY_SLUG;
        expect(statusCanarySlug()).toBe(DEFAULT_STATUS_CANARY_SLUG);
        process.env.STATUS_CANARY_SLUG = "altra-sede";
        expect(statusCanarySlug()).toBe("altra-sede");
        delete process.env.STATUS_CANARY_SLUG;
    });

    it("ssr-render lo imposta prima di ogni risposta", () => {
        const src = readFileSync(path.resolve(__dirname, "../../../api/ssr-render/index.ts"), "utf8");
        const handler = src.slice(src.indexOf("export default async function handler"));
        const setAt = handler.indexOf("robotsHeaderValue(\n        process.env.VERCEL_ENV");
        expect(setAt).toBeGreaterThan(-1);
        expect(setAt).toBeLessThan(handler.indexOf("serveSpaFallback("));
        expect(setAt).toBeLessThan(handler.indexOf("res.status("));
    });
});
