#!/usr/bin/env node
/**
 * test-activity-overrides.ts
 *
 * Pure unit tests for the activity-override helper function:
 *   - applyActivityVisibilityOverridesToCatalog
 *
 * No network calls, no Supabase queries.
 * Uses dynamic import after loading env vars to avoid the Supabase
 * client throwing at module-load time.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Env loading ─────────────────────────────────────────────────────────────

function parseEnvFile(filePath: string) {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eqIndex = line.indexOf("=");
        if (eqIndex <= 0) continue;
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] == null) {
            process.env[key] = value;
        }
    }
}

function loadProjectEnv() {
    const envPath = resolve(process.cwd(), ".env");
    const envLocalPath = resolve(process.cwd(), ".env.local");
    if (existsSync(envPath)) parseEnvFile(envPath);
    if (existsSync(envLocalPath)) parseEnvFile(envLocalPath);
}

// ─── Types (local duplicates) ────────────────────────────────────────────────

type ResolvedProduct = {
    id: string;
    name: string;
    is_visible: boolean;
    price?: number;
};

type ResolvedCategory = {
    id: string;
    name: string;
    level: number;
    sort_order: number;
    products: ResolvedProduct[];
};

type ResolvedCatalog = {
    id: string;
    name: string;
    categories?: ResolvedCategory[];
};

type ActivityProductOverrideRow = {
    product_id: string;
    visible_override: boolean | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProduct(id: string, price?: number, isVisible = true): ResolvedProduct {
    return {
        id,
        name: `Product ${id}`,
        is_visible: isVisible,
        ...(price !== undefined ? { price } : {})
    };
}

function makeCatalog(categories: ResolvedCategory[]): ResolvedCatalog {
    return { id: "cat-1", name: "Test Catalog", categories };
}

function makeCategory(products: ResolvedProduct[]): ResolvedCategory {
    return { id: "section-1", name: "Section 1", level: 0, sort_order: 0, products };
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function run(label: string, fn: () => void) {
    try {
        fn();
        console.log(`  ✅ ${label}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${label}`);
        console.error(`     ${(err as Error).message}`);
        failed++;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    loadProjectEnv();

    const resolver = await import("../src/services/supabase/v2/resolveActivityCatalogsV2.ts");
    const { applyActivityVisibilityOverridesToCatalog } = resolver;

    console.log("\n🧪 STARTING ACTIVITY OVERRIDE TESTS");

    // ── CASE A ────────────────────────────────────────────────────────────────
    console.log("\nCASE A: visible_override=true restores product hidden by schedule");

    run("Product X is restored after schedule removed it", () => {
        const productX = makeProduct("prod-X", 10);
        const baseCatalog = makeCatalog([makeCategory([productX])]);
        const postScheduleCatalog = makeCatalog([makeCategory([])]); // X removed by schedule

        const overrides: Record<string, ActivityProductOverrideRow> = {
            "prod-X": { product_id: "prod-X", visible_override: true }
        };

        const result = applyActivityVisibilityOverridesToCatalog(
            postScheduleCatalog,
            baseCatalog,
            overrides
        );

        const productIds =
            result?.categories?.flatMap((c: any) => c.products.map((p: any) => p.id)) ?? [];
        assert.ok(
            productIds.includes("prod-X"),
            `Expected prod-X to be restored, got: [${productIds}]`
        );
    });

    // ── CASE B ────────────────────────────────────────────────────────────────
    console.log("\nCASE B: visible_override=false removes product present after schedule");

    run("Product X is removed when visible_override=false", () => {
        const productX = makeProduct("prod-X", 10);
        const baseCatalog = makeCatalog([makeCategory([productX])]);
        const postScheduleCatalog = makeCatalog([makeCategory([productX])]);

        const overrides: Record<string, ActivityProductOverrideRow> = {
            "prod-X": { product_id: "prod-X", visible_override: false }
        };

        const result = applyActivityVisibilityOverridesToCatalog(
            postScheduleCatalog,
            baseCatalog,
            overrides
        );

        const productIds =
            result?.categories?.flatMap((c: any) => c.products.map((p: any) => p.id)) ?? [];
        assert.ok(
            !productIds.includes("prod-X"),
            `Expected prod-X to be absent, got: [${productIds}]`
        );
    });

    // ── CASE C ────────────────────────────────────────────────────────────────
    console.log("\nCASE C: No override results in unchanged output");

    run("Products with no override record are unaffected", () => {
        const productA = makeProduct("prod-A", 5);
        const baseCatalog = makeCatalog([makeCategory([productA])]);
        const postScheduleCatalog = makeCatalog([makeCategory([productA])]);

        const overrides: Record<string, ActivityProductOverrideRow> = {};

        const result = applyActivityVisibilityOverridesToCatalog(
            postScheduleCatalog,
            baseCatalog,
            overrides
        );

        const productIds =
            result?.categories?.flatMap((c: any) => c.products.map((p: any) => p.id)) ?? [];
        assert.ok(productIds.includes("prod-A"), "prod-A should remain");
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n${"─".repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
    console.log("All tests passed. ✅");
    process.exit(0);
}

main().catch(err => {
    console.error("test-activity-overrides failed:", err);
    process.exit(1);
});
