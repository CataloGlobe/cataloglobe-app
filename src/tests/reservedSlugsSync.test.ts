import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { RESERVED_SLUGS } from "@/constants/reservedSlugs";

/**
 * Le tre liste di slug riservati devono restare allineate:
 * - RESERVED_SLUGS (client, feedback immediato nel form);
 * - is_reserved_slug() nel DB (ultima migration che la ridefinisce);
 * - RESERVED_SEGMENTS in api/ssr-render (rotte che non sono una sede).
 * Uno slug valido ha almeno 3 caratteri (activities_slug_length), quindi `t`
 * (/t/:token) e i segmenti con il punto non possono mai essere una sede.
 */

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const canBeASlug = (s: string) => s.length >= 3 && SLUG_RE.test(s) && !s.includes("--");

function quotedList(source: string, start: string, end: string): string[] {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return [...source.slice(from, to).replace(/--[^\n]*/g, "").matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
}

function latestReservedSlugMigration(): string {
    const dir = path.join(ROOT, "supabase/migrations");
    const files = readdirSync(dir)
        .filter(f => f.endsWith(".sql"))
        .sort()
        .filter(f => /CREATE OR REPLACE FUNCTION (public\.)?is_reserved_slug/i.test(read(`supabase/migrations/${f}`)));
    expect(files.length).toBeGreaterThan(0);
    return read(`supabase/migrations/${files[files.length - 1]}`);
}

const dbList = quotedList(latestReservedSlugMigration(), "ARRAY[", "])");
const ssrList = quotedList(read("api/ssr-render/index.ts"), "const RESERVED_SEGMENTS = new Set([", "]);");

describe("slug riservati: client, DB e ssr-render allineati", () => {
    it("le liste lette non sono vuote", () => {
        expect(dbList.length).toBeGreaterThan(20);
        expect(ssrList.length).toBeGreaterThan(10);
    });

    it("RESERVED_SLUGS e is_reserved_slug() hanno le stesse voci", () => {
        expect([...RESERVED_SLUGS].sort()).toEqual([...dbList].sort());
    });

    it("ogni rotta di ssr-render che potrebbe essere uno slug è riservata nel client e nel DB", () => {
        const routes = ssrList.filter(canBeASlug);
        expect(routes).toContain("status");
        expect(routes.filter(r => !RESERVED_SLUGS.has(r))).toEqual([]);
        expect(routes.filter(r => !dbList.includes(r))).toEqual([]);
    });

    it("le rotte non riservabili sono davvero impossibili come slug", () => {
        expect(ssrList.filter(r => !canBeASlug(r)).sort()).toEqual(["index.html", "t"]);
    });
});
