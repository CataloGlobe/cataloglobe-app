import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Guardrail sul sorgente di `submit-review` (task «Limitare recensioni»).
// L'handler non è unit-testabile qui (import remoti Deno, Supabase): si
// controllano le forme del codice che reggono i limiti.

const SOURCE = readFileSync(
    resolve(process.cwd(), "supabase/functions/submit-review/index.ts"),
    "utf-8"
);

describe("limiti atomici", () => {
    it("usa il contatore condiviso, non più le SELECT sulla tabella reviews", () => {
        expect(SOURCE).toContain('from "../_shared/rateLimit.ts"');
        expect(SOURCE.match(/await checkRateLimit\(/g) ?? []).toHaveLength(2);
        expect(SOURCE).not.toMatch(/\.from\("reviews"\)\s*\.select/);
    });

    it("l'IP entra nella chiave solo in hash", () => {
        expect(SOURCE).toContain("submit-review:ip:${await hashIp(requestIp)}");
        expect(SOURCE).not.toMatch(/key:\s*`[^`]*\$\{requestIp\}/);
    });

    it("stessi numeri di prima: 10 per IP e 1 per sessione al giorno", () => {
        expect(SOURCE).toMatch(/RATE_LIMIT_IP_PER_DAY = 10;/);
        expect(SOURCE).toMatch(/RATE_LIMIT_SESSION_PER_DAY = 1;/);
        expect(SOURCE).toMatch(/DAY_SECONDS = 24 \* 60 \* 60;/);
    });
});

describe("solo sedi che ricevono recensioni", () => {
    it("rifiuta una sede non attiva", () => {
        expect(SOURCE).toMatch(/activity\.status !== "active"/);
        expect(SOURCE).toContain('select("id, tenant_id, status")');
    });

    it("rifiuta un'azienda cancellata o con abbonamento non valido", () => {
        expect(SOURCE).toContain("VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)");
        expect(SOURCE).toContain("tenant.deleted_at !== null");
    });

    it("i controlli sulla sede vengono prima dell'insert", () => {
        const gate = SOURCE.indexOf('errorResponse("ACTIVITY_NOT_ACTIVE"');
        const insert = SOURCE.indexOf('.from("reviews").insert(');
        expect(gate).toBeGreaterThan(-1);
        expect(insert).toBeGreaterThan(gate);
    });
});

describe("input", () => {
    it("activity_id e session_id devono essere UUID (400, non 500 all'insert)", () => {
        expect(SOURCE).toMatch(/UUID_RE\.test\(activityId\.trim\(\)\)/);
        expect(SOURCE).toMatch(/UUID_RE\.test\(body\.session_id\.trim\(\)\)/);
    });
});
