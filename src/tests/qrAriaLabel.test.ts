import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Regola di CLAUDE.md (sezione UI): `QRCodeSVG` disegna un <svg role="img">
 * senza nome; ogni uso deve passare un `aria-label`.
 */
describe("ogni QRCodeSVG ha un aria-label", () => {
    const files = execSync("git grep -l '<QRCodeSVG' -- src", { encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean);

    it("trova almeno un uso", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        it(file, () => {
            const src = readFileSync(file, "utf8");
            const tags = src.match(/<QRCodeSVG\b[\s\S]*?\/>/g) ?? [];
            expect(tags.length).toBeGreaterThan(0);
            for (const tag of tags) expect(tag).toMatch(/aria-label=/);
        });
    }
});
