#!/usr/bin/env node
/**
 * scripts/smoke-public-render.ts
 *
 * Smoke test for public catalog rendering.
 * Usage: npx tsx scripts/smoke-public-render.ts --activity <uuid> [--time <iso-string>]
 */

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
        if (process.env[key] == null) process.env[key] = value;
    }
}

function loadProjectEnv() {
    const envPath = resolve(process.cwd(), ".env");
    const envLocalPath = resolve(process.cwd(), ".env.local");
    if (existsSync(envPath)) parseEnvFile(envPath);
    if (existsSync(envLocalPath)) parseEnvFile(envLocalPath);
}

async function main() {
    loadProjectEnv();

    const args = process.argv.slice(2);
    const activityIdx = args.indexOf("--activity");
    const activityId = activityIdx !== -1 ? args[activityIdx + 1] : null;
    const timeIdx = args.indexOf("--time");
    const timeStr = timeIdx !== -1 ? args[timeIdx + 1] : null;

    if (!activityId) {
        console.error(
            "Usage: npx tsx scripts/smoke-public-render.ts --activity <activity-uuid> [--time <iso-time>]"
        );
        process.exit(1);
    }

    const { resolveActivityCatalogsV2 } =
        await import("../src/services/supabase/v2/resolveActivityCatalogsV2");
    const now = timeStr ? new Date(timeStr) : new Date();

    console.log(`\n🚀 SMOKE TEST: Public Render Audit`);
    console.log(`📅 Timestamp: ${now.toISOString()}`);
    console.log(`📍 Activity:  ${activityId}\n`);

    try {
        const result = await resolveActivityCatalogsV2(activityId, now);

        if (!result.catalog) {
            console.log("⚠️  NO ACTIVE CATALOG found for this time slot.");
        } else {
            console.log("✅ CATALOG FOUND:");
            console.log(`   - ID:   ${result.catalog.id}`);
            console.log(`   - Name: ${result.catalog.name}`);

            const categories = result.catalog.categories ?? [];
            const totalProducts = categories.reduce((acc, cat) => acc + cat.products.length, 0);

            console.log(`   - Sections: ${categories.length}`);
            console.log(`   - Products: ${totalProducts} (post-override visibility)`);
        }

        const featuredGroups = result.featured || {};
        const heroCount = featuredGroups.hero?.length ?? 0;
        const beforeCount = featuredGroups.before_catalog?.length ?? 0;
        const afterCount = featuredGroups.after_catalog?.length ?? 0;

        console.log("\n✨ FEATURED CONTENT:");
        console.log(`   - Hero:   ${heroCount}`);
        console.log(`   - Before: ${beforeCount}`);
        console.log(`   - After:  ${afterCount}`);

        console.log("\n🎨 STYLE:");
        if (result.style) {
            console.log(`   - ID:   ${result.style.id}`);
            console.log(`   - Name: ${result.style.name}`);
        } else {
            console.log("   - [Default Style]");
        }

        console.log(`\n${"─".repeat(50)}`);
        console.log("Audit complete.\n");
    } catch (err) {
        console.error("\n❌ SMOKE TEST FAILED:");
        console.error(err);
        process.exit(1);
    }
}

main();
