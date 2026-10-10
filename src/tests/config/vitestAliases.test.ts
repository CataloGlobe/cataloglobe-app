import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { sanitizeUrl } from "@utils/sanitizeUrl";

/** vitest.config.ts deve avere gli stessi alias di vite.config.ts. */

const ROOT = path.resolve(__dirname, "../../..");

function aliases(file: string): Record<string, string> {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const block = src.slice(src.indexOf("alias: {"), src.indexOf("}", src.indexOf("alias: {")));
    return Object.fromEntries(
        [...block.matchAll(/"(@[\w]*)":\s*path\.resolve\(__dirname,\s*"([^"]+)"\)/g)].map(m => [m[1], m[2]])
    );
}

describe("alias di vitest allineati a vite", () => {
    it("stesse chiavi e stesse cartelle", () => {
        const vite = aliases("vite.config.ts");
        expect(Object.keys(vite).length).toBeGreaterThan(5);
        expect(aliases("vitest.config.ts")).toEqual(vite);
    });

    it("un import con @utils si risolve nei test", () => {
        expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
    });
});
