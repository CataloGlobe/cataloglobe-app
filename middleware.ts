/**
 * Fase A — SSR leggera: edge injection meta per-tenant + preload cover su /:slug.
 *
 * Vercel Routing Middleware (runtime edge, auto-rilevato a root, niente entry
 * in vercel.json). Intercetta SOLO le route pubbliche single-segment /:slug,
 * recupera i dati tenant via `fetchTenantMeta` e riscrive l'<head>
 * dell'index.html statico: <title>, description, og:*, twitter:*, canonical,
 * og:image + <link rel="preload"> della cover. Tutto il resto passa invariato
 * al routing normale (catch-all vercel.json → index.html).
 *
 * INVARIANTE (safety net): qualsiasi errore / timeout / upstream non-200 /
 * slug inesistente / dubbio sul match → `return undefined` → Vercel serve
 * l'HTML originale invariato. Nessuna regressione possibile sulla pagina
 * pubblica.
 *
 * Sicurezza: name/city/cover sono tenant-controlled e finiscono in contesto
 * attributo HTML. Due layer indipendenti: `escapeHtml` sui valori +
 * replacer-a-funzione in tutte le `String.replace` (una replacement string
 * espanderebbe i pattern `$&`/`$1`, permettendo breakout dall'attributo
 * anche con valore escapato).
 *
 * Latenza: la risposta attende i meta al massimo META_WAIT_MS (race, NON
 * abort). Su cold-miss della cache CDN il visitatore riceve subito l'HTML
 * originale con meta generici, ma la sub-request prosegue in background via
 * `waitUntil` e popola la cache → il visitatore successivo ottiene
 * l'injection in ~400ms. Un abort qui causerebbe starvation permanente: la
 * response troncata non entra mai in cache e ogni richiesta resta cold
 * (misurato, vedi review Fase A).
 *
 * Osservabilità:
 *   - response header `x-meta-injection: hit` (assente su fallback)
 *   - response header `Server-Timing: meta;dur=<ms>, shell;dur=<ms>`
 *   - log `console.error` strutturato `meta_injection_error` SOLO su errore
 *     reale del path sincrono (shell fallita, upstream 5xx, throw, payload
 *     senza nome). Il wait-timeout del cold hit è il funzionamento normale
 *     del self-healing → silenzioso. Slug inesistente (404) e route non
 *     matchate restano silenziosi. Errore reale della sub-request completata
 *     in background → `meta_background_error` (evento distinto).
 */

import { waitUntil } from "@vercel/functions";

// Env senza dipendere da @types/node (il middleware gira su edge runtime).
const env: Record<string, string | undefined> =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

// Stesso CHECK del DB su activities.slug: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ + no `--`.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Route single-segment note in App.tsx + prefissi riservati. In dubbio → passthrough.
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
    "index.html"
]);

// 900ms: attesa massima dei meta prima di servire l'HTML originale. La
// sub-request warm (CDN hit su /api/public-catalog) sta in 300-450ms dal
// middleware; il cold-miss (CDN miss + λ cold + resolve live, ~2.4-3.3s
// misurati) supera l'attesa → fallback generico per quella richiesta, cache
// scaldata in background (vedi header del file).
const META_WAIT_MS = 900;

export const config = {
    // Un solo segmento, charset slug (niente `.` → gli asset non matchano mai).
    matcher: "/:slug([a-z0-9-]+)"
};

type PublicCatalogBusiness = {
    name?: string | null;
    slug?: string | null;
    cover_image?: string | null;
    city?: string | null;
};

type PublicCatalogMeta = {
    business?: PublicCatalogBusiness | null;
    tenantLogoUrl?: string | null;
};

type TenantMetaResult = {
    meta: PublicCatalogMeta | null;
    /** Upstream 404: slug inesistente. Fallback "normale", nessun log. */
    notFound: boolean;
    /** 5xx/throw/attesa scaduta: errore reale, loggato dal chiamante. */
    error: string | null;
};

/** Sentinella del race: attesa scaduta, sub-request ancora in volo. */
const META_WAIT_TIMEOUT: TenantMetaResult = {
    meta: null,
    notFound: false,
    error: "meta_wait_timeout"
};

/**
 * Recupero meta tenant — UNICO punto di swap per la futura lettura diretta
 * dello snapshot Upstash Redis dall'edge: riscrivere solo questo body, il
 * resto del middleware consuma `TenantMetaResult`.
 *
 * Implementazione attuale: GET same-origin a /api/public-catalog (proxy
 * serverless esistente con retry + snapshot Redis), cachata dalla CDN Vercel
 * via s-maxage=30 + stale-while-revalidate → warm in 80-400ms.
 */
async function fetchTenantMeta(slug: string, origin: string): Promise<TenantMetaResult> {
    try {
        const target = new URL(`/api/public-catalog?slug=${encodeURIComponent(slug)}`, origin);
        const res = await fetch(target, { headers: bypassHeaders() });
        if (res.status === 404) return { meta: null, notFound: true, error: null };
        if (!res.ok) return { meta: null, notFound: false, error: `upstream_status_${res.status}` };
        return { meta: (await res.json()) as PublicCatalogMeta, notFound: false, error: null };
    } catch (e: unknown) {
        return {
            meta: null,
            notFound: false,
            error: e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        };
    }
}

/** Escape per contesto attributo HTML double-quoted (e text node). */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Sostituisce il content di un <meta property|name="key" content="...">.
 * Replacer a funzione: una replacement string espanderebbe `$&`/`$1` presenti
 * nel valore (tenant-controlled), reintroducendo `"` non escapati.
 */
function setMetaContent(html: string, key: string, value: string): string {
    const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`);
    return html.replace(re, (_m, p1: string, p2: string) => p1 + value + p2);
}

/**
 * Header bypass per Deployment Protection sulle preview: senza, le self-fetch
 * (shell + /api/public-catalog) prenderebbero la pagina 401 di Vercel. No-op
 * se il secret non è configurato (es. produzione senza protection).
 */
function bypassHeaders(): Record<string, string> {
    const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
    return secret ? { "x-vercel-protection-bypass": secret } : {};
}

export default async function middleware(request: Request): Promise<Response | undefined> {
    try {
        if (request.method !== "GET") return undefined;

        const url = new URL(request.url);
        const slug = url.pathname.slice(1);

        // Difesa in profondità oltre il matcher: formato slug + deny-list.
        if (!SLUG_RE.test(slug) || slug.includes("--") || RESERVED_SEGMENTS.has(slug)) {
            return undefined;
        }

        const metaStart = Date.now();
        let metaDur = 0;
        let shellDur = 0;

        // Race, NON abort: su attesa scaduta la sub-request resta in volo e
        // viene completata in background (waitUntil) per popolare la cache CDN.
        const metaPromise = fetchTenantMeta(slug, url.origin).then((r) => {
            metaDur = Date.now() - metaStart;
            return r;
        });
        let waitTimer: ReturnType<typeof setTimeout> | undefined;
        const waitTimeout = new Promise<TenantMetaResult>((resolve) => {
            waitTimer = setTimeout(() => resolve(META_WAIT_TIMEOUT), META_WAIT_MS);
        });

        const [metaResult, shellRes] = await Promise.all([
            Promise.race([metaPromise, waitTimeout]),
            (async () => {
                const start = Date.now();
                const res = await fetch(new URL("/index.html", request.url), { headers: bypassHeaders() });
                shellDur = Date.now() - start;
                return res;
            })().catch(() => null)
        ]);
        clearTimeout(waitTimer);

        if (metaResult === META_WAIT_TIMEOUT) {
            // Self-healing: il completamento scalda la cache per il prossimo hit.
            // Solo un errore reale dell'upstream viene loggato (evento distinto
            // dal timeout normale); la pagina è già stata servita col fallback.
            waitUntil(
                metaPromise.then((r) => {
                    if (r.error) {
                        console.error(
                            JSON.stringify({ event: "meta_background_error", slug, reason: r.error })
                        );
                    }
                })
            );
        }

        const name = metaResult.meta?.business?.name?.trim();

        if (!shellRes || !shellRes.ok || !name) {
            let reason: string | null = null;
            if (!shellRes || !shellRes.ok) reason = `shell_${shellRes?.status ?? "fetch_failed"}`;
            // Wait-timeout = cold hit normale (self-healing in corso): silenzioso.
            else if (metaResult === META_WAIT_TIMEOUT) reason = null;
            else if (metaResult.error) reason = metaResult.error;
            else if (!metaResult.notFound) reason = "missing_business_name";

            // Solo errori reali: slug inesistente (notFound) resta silenzioso.
            if (reason) {
                console.error(
                    JSON.stringify({ event: "meta_injection_error", slug, reason, metaDur, shellDur })
                );
            }
            return undefined;
        }

        let html = await shellRes.text();
        if (!html.includes("</head>")) return undefined;

        const business = metaResult.meta?.business;
        const city = business?.city?.trim() ?? "";
        const coverRaw = business?.cover_image ?? metaResult.meta?.tenantLogoUrl ?? null;
        const cover = coverRaw && /^https:\/\//.test(coverRaw) ? coverRaw : null;

        const safeName = escapeHtml(name);
        const title = `${safeName} — Menu digitale`;
        // Template provvisorio: versione finale (+ differenziazione vertical) da decidere.
        const description = escapeHtml(`Menu digitale di ${name}${city ? ` · ${city}` : ""}`);
        const canonical = escapeHtml(`${url.origin}/${slug}`);

        html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${title}</title>`);
        html = setMetaContent(html, "description", description);
        html = setMetaContent(html, "og:title", title);
        html = setMetaContent(html, "og:description", description);
        html = setMetaContent(html, "og:url", canonical);
        html = setMetaContent(html, "twitter:title", safeName);
        html = setMetaContent(html, "twitter:description", description);
        html = html.replace(
            /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
            (_m, p1: string, p2: string) => p1 + canonical + p2
        );

        const extra: string[] = [];
        if (cover) {
            const safeCover = escapeHtml(cover);
            extra.push(`<meta property="og:image" content="${safeCover}" />`);
            extra.push(`<meta name="twitter:image" content="${safeCover}" />`);
            extra.push(`<link rel="preload" as="image" href="${safeCover}" fetchpriority="high" />`);
        }
        if (extra.length > 0) {
            html = html.replace("</head>", () => `    ${extra.join("\n    ")}\n  </head>`);
        }

        // Conserva gli header della response statica (security headers inclusi),
        // ma il body è cambiato: via content-length/encoding/etag.
        const headers = new Headers(shellRes.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        headers.delete("etag");
        headers.set("content-type", "text/html; charset=utf-8");
        headers.set("x-meta-injection", "hit");
        headers.set("Server-Timing", `meta;dur=${metaDur}, shell;dur=${shellDur}`);

        return new Response(html, { status: 200, headers });
    } catch {
        // Fallback duro: qualsiasi imprevisto → HTML originale invariato.
        return undefined;
    }
}
