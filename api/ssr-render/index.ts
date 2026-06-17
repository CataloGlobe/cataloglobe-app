import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    getRedis,
    makeSnapshotKey,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_TTL_SECONDS
} from "../_lib/redis.js";
import {
    callResolvePublicCatalog,
    isHealthyPayload,
    type PublicCatalogPayload
} from "../_lib/supabaseEdge.js";
import { fetchPublicAllergens } from "../_lib/publicAllergens.js";
import {
    buildClientAssets,
    buildSsrShell,
    type PublicShellPayload,
    type ViteManifest
} from "../_lib/publicShell.js";
import { VERTICAL_CONFIG, type VerticalType } from "../../src/constants/verticalTypes.js";

/**
 * GET /api/ssr-render?slug=<slug>&lang=<lang>?    (stage 4b — ROUTE DI TEST)
 *
 * Renderer SSR della pagina pubblica. Non intercetta /:slug live (rewrite in
 * 4e): raggiungibile solo su questa route per la verifica end-to-end.
 *
 * Flusso: valida slug → payload server-side (resolve-public-catalog con
 * retry + snapshot Upstash, stesse semantiche di api/public-catalog) →
 * allergeni (gated per vertical) → renderPublic dal bundle SSR buildato
 * (dist-server, deployato via includeFiles) → shell HTML completa streamata
 * (head per-tenant → markup → payload inline + script client dal manifest).
 *
 * SSR SOLO sul ramo ready: non-ready (inactive/subscription/empty), errori
 * di fetch, slug invalidi → fallback shell SPA statica (dist/index.html),
 * comportamento identico a oggi per quei casi.
 */

// ⚠️ SYNC con middleware.ts (righe 49-86): stessa validazione slug.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const RESERVED_SEGMENTS = new Set([
    "login",
    "verify-otp",
    "sign-up",
    "check-email",
    "email-confirmed",
    "forgot-password",
    "reset-password",
    "workspace",
    "select-business",
    "onboarding",
    "business",
    "dashboard",
    "invite",
    "legal",
    "status",
    "admin",
    "t",
    "api",
    "assets",
    "public",
    "index.html"
]);

const LANG_REGEX = /^[a-z]{2}(-[a-z]{2,4})?$/i;

const CLIENT_MANIFEST_ENTRY = "src/entry-client.tsx";
const CLIENT_ASSET_BASE = "/public/";

/* ── Bundle SSR + asset statici (cache modulo, lambda warm) ─────────────── */

type RenderPublicModule = {
    renderPublic(args: {
        payload: unknown;
        allergens: unknown;
        slug: string;
        url?: string;
    }): Promise<
        | { kind: "ready"; html: string }
        | { kind: "non-ready"; status: "inactive" | "subscription_inactive" | "empty" }
    >;
};

let renderModule: RenderPublicModule | null = null;

async function loadRenderModule(): Promise<RenderPublicModule> {
    if (renderModule) return renderModule;
    const bundlePath = join(process.cwd(), "dist-server", "entry-server.js");
    renderModule = (await import(pathToFileURL(bundlePath).href)) as RenderPublicModule;
    return renderModule;
}

let templateCache: string | null = null;
function readTemplate(): string {
    if (templateCache === null) {
        templateCache = readFileSync(join(process.cwd(), "index.html"), "utf-8");
    }
    return templateCache;
}

let manifestCache: ViteManifest | null = null;
function readClientManifest(): ViteManifest {
    if (manifestCache === null) {
        manifestCache = JSON.parse(
            readFileSync(join(process.cwd(), "dist", "public", ".vite", "manifest.json"), "utf-8")
        ) as ViteManifest;
    }
    return manifestCache;
}

let spaFallbackCache: string | null = null;
function readSpaFallback(): string | null {
    if (spaFallbackCache === null) {
        try {
            spaFallbackCache = readFileSync(join(process.cwd(), "dist", "index.html"), "utf-8");
        } catch {
            return null;
        }
    }
    return spaFallbackCache;
}

/* ── Fallback SPA (casi non-SSR: identici a oggi) ───────────────────────── */

function serveSpaFallback(res: VercelResponse, status: number, reason: string): void {
    const html = readSpaFallback();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cataloglobe-Ssr", `fallback:${reason}`);
    if (!html) {
        res.status(503).send("Service unavailable");
        return;
    }
    res.status(status).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
}

/* ── Dati: payload con semantiche cache di api/public-catalog ───────────── */

type Snapshot = {
    schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
    savedAt: string;
    payload: PublicCatalogPayload;
};

async function fetchPayload(
    slug: string,
    lang: string | undefined
): Promise<{ payload: PublicCatalogPayload; source: "live" | "stale" } | { error: string }> {
    const snapshotKey = makeSnapshotKey(slug, lang);
    const edgeResult = await callResolvePublicCatalog({ slug, lang });

    if (edgeResult.kind === "success") {
        const payload = edgeResult.payload;
        if (isHealthyPayload(payload)) {
            // Best-effort, identico a api/public-catalog: il fallimento
            // Redis non blocca la risposta live.
            try {
                const snapshot: Snapshot = {
                    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                    savedAt: new Date().toISOString(),
                    payload
                };
                await getRedis().set(snapshotKey, snapshot, { ex: SNAPSHOT_TTL_SECONDS });
            } catch (err) {
                console.error(
                    JSON.stringify({
                        event: "ssr_render_redis_write_failed",
                        slug,
                        error: err instanceof Error ? err.message : String(err)
                    })
                );
            }
        }
        return { payload, source: "live" };
    }

    if (edgeResult.kind === "domain_error") {
        return { error: `domain_${edgeResult.status}` };
    }

    // network_error → fallback snapshot Redis
    try {
        const cached = await getRedis().get<Snapshot>(snapshotKey);
        if (
            cached &&
            typeof cached === "object" &&
            cached.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
            cached.payload
        ) {
            return { payload: cached.payload, source: "stale" };
        }
    } catch (err) {
        console.error(
            JSON.stringify({
                event: "ssr_render_redis_read_failed",
                slug,
                error: err instanceof Error ? err.message : String(err)
            })
        );
    }
    return { error: "network_no_snapshot" };
}

/* ── Handler ────────────────────────────────────────────────────────────── */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const startedAt = Date.now();

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.status(405).send("Method not allowed");
        return;
    }

    const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
    const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim() : "";

    if (!SLUG_RE.test(slug) || slug.includes("--") || RESERVED_SEGMENTS.has(slug)) {
        serveSpaFallback(res, 404, "invalid_slug");
        return;
    }
    if (langRaw && !LANG_REGEX.test(langRaw)) {
        serveSpaFallback(res, 404, "invalid_lang");
        return;
    }
    const lang = langRaw ? langRaw.toLowerCase() : undefined;

    try {
        const dataResult = await fetchPayload(slug, lang);
        if ("error" in dataResult) {
            // domain_404 = slug inesistente → 404 reale (no soft-404).
            // Tutti gli altri errori (network_no_snapshot, altri domain_*) restano 200 SPA-fallback.
            const fallbackStatus = dataResult.error === "domain_404" ? 404 : 200;
            serveSpaFallback(res, fallbackStatus, dataResult.error);
            return;
        }
        const { payload, source } = dataResult;

        // 301 alias→canonical: `canonical_slug` è valorizzato dall'edge SOLO
        // quando lo slug richiesto è un alias; su slug canonico è null →
        // niente redirect (loop-safe). Emesso qui (non nel middleware) perché
        // l'handler ha già il payload: costo zero e SEO-corretto (il rewrite
        // Vercel è interno, il crawler riceve un 301 pulito sull'URL alias).
        const canonicalSlug = (payload as { canonical_slug?: string | null }).canonical_slug;
        if (canonicalSlug && canonicalSlug !== slug) {
            // Anti open-redirect: il dato è DB-derived ma validiamo comunque
            // prima di costruire un Location same-origin. Se non valido →
            // niente redirect, prosegue col render normale.
            const validCanonical =
                SLUG_RE.test(canonicalSlug) &&
                !canonicalSlug.includes("--") &&
                !RESERVED_SEGMENTS.has(canonicalSlug);
            if (validCanonical) {
                // Preserva solo `lang` (già validato + lowercased sopra). Il
                // param interno `slug` aggiunto dal rewrite NON viene propagato.
                const location = lang ? `/${canonicalSlug}?lang=${lang}` : `/${canonicalSlug}`;
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("X-Cataloglobe-Ssr", "redirect:alias");
                res.status(301).setHeader("Location", location).end();
                return;
            }
        }

        // Allergeni: stesso gating vertical della SPA (processPayload).
        const verticalType = (payload as { vertical_type?: VerticalType | null }).vertical_type;
        const needsAllergens = verticalType
            ? VERTICAL_CONFIG[verticalType]?.productSections.allergens === true
            : false;
        const allergens = needsAllergens ? await fetchPublicAllergens() : null;

        const { renderPublic } = await loadRenderModule();
        const result = await renderPublic({ payload, allergens, slug, url: `/${slug}` });

        if (result.kind !== "ready") {
            serveSpaFallback(res, 200, result.status);
            return;
        }

        const origin =
            process.env.PUBLIC_ORIGIN ??
            (() => {
                const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
                const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "";
                return `${proto}://${host}`;
            })();

        const shell = buildSsrShell({
            template: readTemplate(),
            payload: payload as PublicShellPayload,
            // Shape hydration (4c): payload + allergeni già fetchati.
            inlinePayload: { payload, allergens },
            origin,
            slug,
            clientAssets: buildClientAssets(
                readClientManifest(),
                CLIENT_MANIFEST_ENTRY,
                CLIENT_ASSET_BASE
            ),
            supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ""
        });

        res.status(200);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // Allineato a api/public-catalog: CDN 30s + SWR 5min (stale: come
        // l'endpoint dati, finestra ridotta).
        res.setHeader(
            "Cache-Control",
            source === "stale"
                ? "public, s-maxage=10, stale-while-revalidate=60"
                : "public, s-maxage=30, stale-while-revalidate=300"
        );
        res.setHeader("X-Cataloglobe-Ssr", `ready:${source}`);

        // Stream: head+root subito, markup, chiusura.
        res.write(shell.beforeApp);
        res.write(result.html);
        res.write(shell.afterApp);
        res.end();

        console.log(
            JSON.stringify({
                event: "ssr_render",
                slug,
                lang: lang ?? null,
                source,
                durationMs: Date.now() - startedAt,
                htmlBytes: Buffer.byteLength(result.html)
            })
        );
    } catch (err) {
        console.error(
            JSON.stringify({
                event: "ssr_render_error",
                slug,
                error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            })
        );
        serveSpaFallback(res, 200, "render_error");
    }
}
