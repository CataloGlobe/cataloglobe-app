import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Anti-drift guardrail for the `⚠️ SYNC` pair:
//   src/utils/phoneNormalize.ts  ↔  supabase/functions/_shared/phoneNormalize.ts
//
// The Deno copy cannot be imported here (it resolves libphonenumber-js through
// an `npm:` specifier), so the guarantee is enforced on the source text: the
// two files must be identical except for the two differences the header
// declares — the SYNC pointer and the import specifier.

const FE_PATH = "src/utils/phoneNormalize.ts";
const EDGE_PATH = "supabase/functions/_shared/phoneNormalize.ts";

function read(relPath: string): string {
    return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

/** Erase the two allowed differences so the rest can be compared verbatim. */
function canonical(source: string): string {
    return source
        .replace(/npm:libphonenumber-js@[\d.]+/, "libphonenumber-js")
        .replace(/supabase\/functions\/_shared\/phoneNormalize\.ts/, "<sync-pointer>")
        .replace(/src\/utils\/phoneNormalize\.ts/, "<sync-pointer>");
}

describe("phoneNormalize FE ↔ Edge sync", () => {
    it("both copies carry the ⚠️ SYNC header pointing at the other one", () => {
        expect(read(FE_PATH)).toContain("⚠️ SYNC");
        expect(read(FE_PATH)).toContain(EDGE_PATH);
        expect(read(EDGE_PATH)).toContain("⚠️ SYNC");
        expect(read(EDGE_PATH)).toContain(FE_PATH);
    });

    it("the Edge copy imports libphonenumber-js through an npm: specifier", () => {
        expect(read(EDGE_PATH)).toMatch(/from "npm:libphonenumber-js@[\d.]+"/);
        expect(read(FE_PATH)).toContain('from "libphonenumber-js"');
    });

    it("the two copies are otherwise identical", () => {
        expect(canonical(read(EDGE_PATH))).toBe(canonical(read(FE_PATH)));
    });
});
