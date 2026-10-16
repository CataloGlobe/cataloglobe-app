import { describe, expect, it } from "vitest";
import {
    checkStaging,
    defaultSlug,
    describePlan,
    isValidSlug,
    parseArgs,
    plannedRows,
    slugify,
    type StagingGuardInput
} from "../../scripts/fast-access/model";

// Ref finti: i veri non stanno nel codice, nemmeno nei test.
const STAGING = "stagingrefaaaaaaaaaa";
const PROD = "prodrefbbbbbbbbbbbbb";

function fakeJwt(payload: Record<string, unknown>): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.firma`;
}

function guardInput(overrides: Partial<StagingGuardInput> = {}): StagingGuardInput {
    return {
        url: `https://${STAGING}.supabase.co`,
        serviceKey: fakeJwt({ ref: STAGING, role: "service_role" }),
        stagingRef: STAGING,
        productionRef: PROD,
        linkedRef: undefined,
        ...overrides
    };
}

describe("fast-access: guardia solo staging", () => {
    it("tutto staging: ok", () => {
        expect(checkStaging(guardInput())).toEqual({ ok: true, ref: STAGING });
        expect(checkStaging(guardInput({ linkedRef: `${STAGING}\n` }))).toEqual({ ok: true, ref: STAGING });
        // Chiave nuova (non JWT): conta l'URL.
        expect(checkStaging(guardInput({ serviceKey: "sb_secret_finta" })).ok).toBe(true);
    });

    it("senza credenziali o senza ref atteso: no", () => {
        const result = checkStaging(guardInput({ url: undefined, serviceKey: undefined, stagingRef: undefined }));
        expect(result).toEqual({
            ok: false,
            reasons: ["manca STAGING_PROJECT_REF", "manca SUPABASE_URL", "manca SUPABASE_SERVICE_ROLE_KEY"]
        });
    });

    it("URL di produzione: no", () => {
        const result = checkStaging(guardInput({ url: `https://${PROD}.supabase.co` }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reasons).toContain("SUPABASE_URL punta a produzione");
    });

    it("URL non esatto (http, altro host, sottodominio finto): no", () => {
        for (const url of [
            `http://${STAGING}.supabase.co`,
            `https://${STAGING}.supabase.co.esempio.it`,
            `https://altro.supabase.co`,
            "non un url"
        ]) {
            expect(checkStaging(guardInput({ url })).ok).toBe(false);
        }
    });

    it("chiave di un altro progetto o non service_role: no", () => {
        const other = checkStaging(guardInput({ serviceKey: fakeJwt({ ref: PROD, role: "service_role" }) }));
        expect(other.ok).toBe(false);
        const anon = checkStaging(guardInput({ serviceKey: fakeJwt({ ref: STAGING, role: "anon" }) }));
        expect(anon.ok).toBe(false);
        if (!anon.ok) expect(anon.reasons).toEqual(["la chiave non è service_role"]);
    });

    it("ref di staging uguale a produzione, o cartella collegata ad altro: no", () => {
        expect(checkStaging(guardInput({ productionRef: STAGING })).ok).toBe(false);
        expect(checkStaging(guardInput({ linkedRef: PROD })).ok).toBe(false);
    });
});

describe("fast-access: argomenti", () => {
    it("default: dry-run, piano pro, una sede, 30 giorni, slug unico", () => {
        const result = parseArgs(["--email", "lorenzo+fa@esempio.it"], "ab12");
        expect(result).toEqual({
            ok: true,
            options: {
                execute: false,
                email: "lorenzo+fa@esempio.it",
                name: "Prova ab12",
                activityName: "Prova ab12",
                slug: "prova-ab12",
                plan: "pro",
                seats: 1,
                trialDays: 30,
                subtype: "restaurant"
            }
        });
    });

    it("--execute scrive, --dry-run no, insieme è un errore", () => {
        const run = parseArgs(["--email", "a@b.it", "--execute"], "x");
        expect(run.ok && run.options.execute).toBe(true);
        const dry = parseArgs(["--email", "a@b.it", "--dry-run"], "x");
        expect(dry.ok && dry.options.execute).toBe(false);
        expect(parseArgs(["--email", "a@b.it", "--execute", "--dry-run"], "x").ok).toBe(false);
    });

    it("rifiuta email mancante, opzioni sconosciute e valori fuori misura", () => {
        for (const argv of [
            [],
            ["--email"],
            ["--email", "non-una-email"],
            ["--email", "a@b.it", "--piano", "pro"],
            ["--email", "a@b.it", "--plan", "enterprise"],
            ["--email", "a@b.it", "--seats", "0"],
            ["--email", "a@b.it", "--seats", "21"],
            ["--email", "a@b.it", "--trial-days", "2.5"],
            ["--email", "a@b.it", "--subtype", "hotel"],
            ["--email", "a@b.it", "--slug", "A_B"]
        ]) {
            expect(parseArgs(argv, "x").ok).toBe(false);
        }
    });

    it("slug: dal nome, senza accenti né trattini doppi, entro 60", () => {
        expect(slugify("Trattoria Dà Nìno -- Milano!")).toBe("trattoria-da-nino-milano");
        expect(slugify("x".repeat(70))).toHaveLength(60);
        expect(defaultSlug("Da Nino", "ab12")).toBe("prova-da-nino-ab12");
        expect(defaultSlug("y".repeat(80), "ab12")).toMatch(/^prova-y+-ab12$/);
        expect(defaultSlug("y".repeat(80), "ab12").length).toBeLessThanOrEqual(60);
        expect(isValidSlug("prova-1")).toBe(true);
        expect(isValidSlug("ab")).toBe(false);
        expect(isValidSlug("a--b")).toBe(false);
    });
});

describe("fast-access: righe pianificate", () => {
    it("tenant in prova senza Stripe, scadenza a N giorni, sede online", () => {
        const parsed = parseArgs(
            ["--email", "a@b.it", "--name", "Da Nino", "--slug", "da-nino-prova", "--plan", "base", "--seats", "2", "--trial-days", "7"],
            "x"
        );
        if (!parsed.ok) throw new Error(parsed.error);
        const rows = plannedRows(parsed.options, new Date("2026-10-16T10:00:00.000Z"));
        expect(rows).toEqual({
            tenant: {
                name: "Da Nino",
                vertical_type: "food_beverage",
                business_subtype: "restaurant",
                creation_idempotency_key: "fast-access:da-nino-prova",
                plan: "base",
                paid_seats: 2,
                billing_interval: "month",
                subscription_status: "trialing",
                trial_until: "2026-10-23T10:00:00.000Z"
            },
            activity: { name: "Da Nino", slug: "da-nino-prova", status: "active" }
        });
        // Nessuna colonna di Stripe tra quelle scritte.
        expect(Object.keys(rows.tenant).some(key => key.startsWith("stripe_"))).toBe(false);
        expect(describePlan(parsed.options, rows)).toHaveLength(4);
    });
});
