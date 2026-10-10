import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// L'allowlist degli stati di abbonamento per le superfici del cliente finale
// sta in `_shared/subscriptionStatus.ts`. Letto dal testo (moduli Deno): nessuna
// Edge deve ridefinirla in locale, così il giorno che cambia si tocca un file.

const SHARED = "supabase/functions/_shared/subscriptionStatus.ts";

describe("allowlist abbonamento condivisa", () => {
    it("ha i tre stati di oggi", () => {
        const src = readFileSync(SHARED, "utf8");
        expect(src).toMatch(
            /export const VALID_SUBSCRIPTION_STATUSES = new Set\(\["active", "trialing", "past_due"\]\);/
        );
    });

    it("nessuna Edge la ridefinisce in locale", () => {
        const hits = execSync(
            "git grep -n 'const VALID_SUBSCRIPTION_STATUSES' -- supabase/functions || true",
            { encoding: "utf8" }
        )
            .trim()
            .split("\n")
            .filter(Boolean)
            .filter(line => !line.startsWith(`${SHARED}:`));
        expect(hits).toEqual([]);
    });
});
