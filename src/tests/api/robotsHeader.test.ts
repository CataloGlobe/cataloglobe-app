import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { robotsHeaderValue } from "../../../api/_lib/robotsHeader";

describe("robotsHeaderValue", () => {
    it("produzione: nessun header", () => {
        expect(robotsHeaderValue("production")).toBeNull();
    });

    it.each(["preview", "development", undefined, ""])("%s: noindex, nofollow", env => {
        expect(robotsHeaderValue(env)).toBe("noindex, nofollow");
    });

    it("ssr-render lo imposta prima di ogni risposta", () => {
        const src = readFileSync(path.resolve(__dirname, "../../../api/ssr-render/index.ts"), "utf8");
        const handler = src.slice(src.indexOf("export default async function handler"));
        const setAt = handler.indexOf("robotsHeaderValue(process.env.VERCEL_ENV)");
        expect(setAt).toBeGreaterThan(-1);
        expect(setAt).toBeLessThan(handler.indexOf("serveSpaFallback("));
        expect(setAt).toBeLessThan(handler.indexOf("res.status("));
    });
});
