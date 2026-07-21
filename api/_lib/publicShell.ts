import { buildSingleFamilyFontUrl } from "./publicFontUrl.js";
import { buildCoverImageSet } from "./imageTransform.js";

/**
 * Helper PURI per la shell HTML SSR della pagina pubblica (stage 4b).
 *
 * Nessun accesso DOM/Node a top-level: consumati sia dalla function Vercel
 * (`api/ssr-render`) sia dai test. Import SOLO relativi (niente alias @/ —
 * il builder @vercel/node non li risolve).
 *
 * SICUREZZA — due contesti di injection distinti:
 *   1. Attributi/tag HTML (meta, link): `escapeHtml` su ogni valore
 *      tenant-controlled + replacer-A-FUNZIONE in tutte le String.replace
 *      (una replacement string espanderebbe `$&`/`$1` presenti nel valore,
 *      permettendo il breakout dall'attributo anche con valore escapato —
 *      stesso schema a due livelli di middleware.ts).
 *   2. JSON inlinato in <script>: `serializeCatalogPayload` neutralizza
 *      `<`, `>`, `&`, U+2028/U+2029 in escape unicode JSON-validi — un
 *      `</script>` dentro un nome tenant non può chiudere il tag script.
 *
 * NOTA: la logica meta replica middleware.ts (righe 144-323). Duplicazione
 * TEMPORANEA e voluta: a 4e il ruolo del middleware su /:slug sparisce e
 * questa diventa l'unica implementazione.
 */

/* ── Tipi minimi del payload (strutturali, disaccoppiati dai tipi app) ──── */

export type PublicShellBusiness = {
    name?: string | null;
    slug?: string | null;
    cover_image?: string | null;
    city?: string | null;
};

export type PublicShellPayload = {
    business?: PublicShellBusiness | null;
    tenantLogoUrl?: string | null;
    resolved?: {
        style?: { config?: { typography?: { fontFamily?: unknown } } | null } | null;
        featured?: {
            before_catalog?: Array<{ media_id?: string | null }> | null;
            after_catalog?: Array<{ media_id?: string | null }> | null;
        } | null;
    } | null;
};

/* ── Escaping ───────────────────────────────────────────────────────────── */

/** Escape per contesto attributo HTML double-quoted (e text node). */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Serializza il payload per l'inline `window.__PUBLIC_CATALOG__ = …;`.
 * JSON valido anche dopo l'escape: `<` `>` `&` e i separatori di riga
 * U+2028/U+2029 diventano escape unicode DENTRO le stringhe JSON, quindi
 * `JSON.parse`/parser JS li ricostruiscono identici, ma il testo emesso non
 * può mai contenere `</script>` né aprire tag/entity nell'HTML circostante.
 */
export function serializeCatalogPayload(data: unknown): string {
    const json = JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
    return `window.__PUBLIC_CATALOG__ = ${json};`;
}

/* ── Sostituzioni head (replacer-funzione, mai replacement string) ──────── */

/** Sostituisce il content di un <meta property|name="key" content="…">. */
function setMetaContent(html: string, key: string, value: string): string {
    const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`);
    return html.replace(re, (_m, p1: string, p2: string) => p1 + value + p2);
}

/* ── Trasformazione shell ───────────────────────────────────────────────── */

export type TenantHeadOptions = {
    /** Origin assoluto per canonical/og:url (es. "https://cataloglobe.com"). */
    origin: string;
    slug: string;
};

/**
 * Applica al template di index.html i meta per-tenant + font dello stile
 * attivo (marker `id="mw-font"`, contratto col runtime: PublicCollectionPage
 * lo cerca per saltare il font fallback) + de-block Inter/Sora + cover
 * preload/og:image. Stessa semantica dell'injection del middleware.
 */
export function applyTenantHead(
    templateHtml: string,
    payload: PublicShellPayload,
    opts: TenantHeadOptions
): string {
    let html = templateHtml;

    const business = payload.business;
    if (!business) return html;
    const name = business.name?.trim();
    if (!name) return html;

    const city = business.city?.trim() ?? "";
    const coverRaw = business.cover_image ?? payload.tenantLogoUrl ?? null;
    const cover = coverRaw && /^https:\/\//.test(coverRaw) ? coverRaw : null;

    const safeName = escapeHtml(name);
    const title = `${safeName} — Menu digitale`;
    const description = escapeHtml(`Menu digitale di ${name}${city ? ` · ${city}` : ""}`);
    const canonical = escapeHtml(`${opts.origin}/${opts.slug}`);

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

    const fontToken = payload.resolved?.style?.config?.typography?.fontFamily;
    const fontHref = buildSingleFamilyFontUrl(fontToken);
    if (fontHref) {
        extra.push(`<link id="mw-font" rel="stylesheet" href="${escapeHtml(fontHref)}" />`);

        // De-block del link shell Inter+Sora (vedi middleware.ts Step 3a):
        // Sora rimossa; token "inter" → link shell app-inter.css omesso
        // (mw-font/public-inter.css copre); altri token → app-inter.css
        // async (preload→stylesheet + noscript).
        html = html.replace(/<link href="\/fonts\/app-sora\.css" rel="stylesheet" \/>\n?/, "");
        html = html.replace(
            /<link href="(\/fonts\/app-inter\.css)" rel="stylesheet" \/>/,
            (_m, shellHref: string) => {
                if (fontToken === "inter") return "";
                return (
                    `<link rel="preload" as="style" href="${shellHref}" ` +
                    `onload="this.onload=null;this.rel='stylesheet'" />` +
                    `<noscript><link rel="stylesheet" href="${shellHref}" /></noscript>`
                );
            }
        );
    }

    if (cover) {
        const safeCover = escapeHtml(cover);
        // og:image/twitter:image: SEMPRE l'immagine raw full-size (gli scraper
        // social vogliono l'originale, non la variante mobile). REPLACE del tag
        // generico del template (non append): i crawler usano il PRIMO og:image
        // del documento — un secondo tag appeso resterebbe ignorato.
        html = setMetaContent(html, "og:image", safeCover);
        html = setMetaContent(html, "twitter:image", safeCover);
        // width/height del template descrivono og-image.png (1200×630): rimossi
        // quando l'immagine è la cover della sede — dichiarare dimensioni di
        // un'altra immagine causerebbe crop sbagliati negli scraper.
        html = html.replace(
            /\s*<meta\s+property="og:image:(?:width|height)"\s+content="[^"]*"\s*\/>/g,
            () => ""
        );
        // Preload LCP: responsive set IDENTICO all'<img> della cover
        // (PublicCollectionHeader) → il browser scarica una sola variante. Se
        // l'URL non è storage-public (set null) → fallback href raw, come prima.
        const coverSet = buildCoverImageSet(cover);
        if (coverSet) {
            extra.push(
                `<link rel="preload" as="image" href="${escapeHtml(coverSet.src)}" ` +
                    `imagesrcset="${escapeHtml(coverSet.srcset)}" ` +
                    `imagesizes="${escapeHtml(coverSet.sizes)}" fetchpriority="high" />`
            );
        } else {
            extra.push(`<link rel="preload" as="image" href="${safeCover}" fetchpriority="high" />`);
        }
    }

    // Logo (sopra la fold, non LCP — nessun fetchpriority).
    const logoUrl = payload.tenantLogoUrl;
    if (logoUrl && /^https?:\/\//.test(logoUrl)) {
        extra.push(`<link rel="preload" as="image" href="${escapeHtml(logoUrl)}" />`);
    }

    // Featured: immagini above-fold (before_catalog + after_catalog, max 3).
    const beforeCatalog = payload.resolved?.featured?.before_catalog ?? [];
    const afterCatalog = payload.resolved?.featured?.after_catalog ?? [];
    const featuredUrls = [...beforeCatalog, ...afterCatalog]
        .filter(b => b?.media_id && /^https?:\/\//.test(b.media_id))
        .slice(0, 3)
        .map(b => escapeHtml(b.media_id!));
    for (const url of featuredUrls) {
        extra.push(`<link rel="preload" as="image" href="${url}" fetchpriority="high" />`);
    }

    // Preconnect all'origine immagini (host storage/render Supabase), il più in
    // alto possibile nell'head → scalda DNS+TCP+TLS prima del preload cover,
    // sovrapponendolo al parsing HTML e tagliando il "load delay" dell'LCP.
    // unshift: precede il preload immagine nell'output. NIENTE crossorigin:
    // l'<img> cover è no-cors, una connessione crossorigin non verrebbe riusata
    // → combacia col fetch immagine. dns-prefetch = fallback per chi ignora
    // preconnect. Cover e logo-fallback condividono lo stesso host → una sola
    // coppia. `cover` ingloba già il fallback logo (coverRaw = cover_image ??
    // tenantLogoUrl); il ?? gestisce il caso cover non-https ma logo https.
    const imageOriginSource =
        cover ?? (logoUrl && /^https:\/\//.test(logoUrl) ? logoUrl : null);
    if (imageOriginSource) {
        const imageOrigin = escapeHtml(new URL(imageOriginSource).origin);
        extra.unshift(
            `<link rel="preconnect" href="${imageOrigin}" />`,
            `<link rel="dns-prefetch" href="${imageOrigin}" />`
        );
    }

    if (extra.length > 0) {
        html = html.replace("</head>", () => `    ${extra.join("\n    ")}\n  </head>`);
    }

    return html;
}

/* ── Asset client dal manifest Vite ─────────────────────────────────────── */

type ViteManifestChunk = {
    file: string;
    css?: string[];
};

export type ViteManifest = Record<string, ViteManifestChunk>;

export type ClientAssets = {
    /** <link rel="stylesheet"> dell'entry client, da mettere nell'head. */
    styleTags: string;
    /** <script type="module"> dell'entry client, da mettere a fine body. */
    scriptTag: string;
};

/**
 * Estrae i tag asset dell'entry client pubblico dal manifest Vite.
 * `base` = base path del build client (es. "/public/").
 */
export function buildClientAssets(
    manifest: ViteManifest,
    entryKey: string,
    base: string
): ClientAssets {
    const entry = manifest[entryKey];
    if (!entry) {
        throw new Error(`publicShell: entry "${entryKey}" assente dal manifest client`);
    }
    const href = (file: string) => escapeHtml(`${base}${file}`);
    const styleTags = (entry.css ?? [])
        .map(file => `<link rel="stylesheet" href="${href(file)}" />`)
        .join("\n    ");
    const scriptTag = `<script type="module" src="${href(entry.file)}"></script>`;
    return { styleTags, scriptTag };
}

/* ── Assemblaggio finale ────────────────────────────────────────────────── */

export type SsrShellParts = {
    /** Tutto fino a `<div id="root">` incluso — flushabile prima del markup. */
    beforeApp: string;
    /** Chiusura root + payload inline + script client + chiusura documento. */
    afterApp: string;
};

export type BuildShellArgs = {
    /** index.html sorgente (template, con lo script /src/main.tsx). */
    template: string;
    payload: PublicShellPayload;
    /** Payload COMPLETO da inlinare per l'hydration (tipicamente = payload). */
    inlinePayload: unknown;
    origin: string;
    slug: string;
    clientAssets: ClientAssets;
    /** Valore per il preconnect %VITE_SUPABASE_URL% del template. */
    supabaseUrl: string;
};

/**
 * Costruisce le due metà della shell SSR. Il chiamante streama:
 * `beforeApp` → markup app → `afterApp`.
 */
export function buildSsrShell(args: BuildShellArgs): SsrShellParts {
    let html = args.template;

    // Placeholder env del template (in SPA lo sostituisce Vite a build-time).
    html = html.replace(/%VITE_SUPABASE_URL%/g, () => escapeHtml(args.supabaseUrl));

    html = applyTenantHead(html, args.payload, { origin: args.origin, slug: args.slug });

    // CSS dell'entry client nell'head (prima del primo paint del markup SSR).
    if (args.clientAssets.styleTags) {
        html = html.replace("</head>", () => `    ${args.clientAssets.styleTags}\n  </head>`);
    }

    // Script SPA del template → payload inline + entry client hashed.
    html = html.replace(
        /<script\s+type="module"\s+src="\/src\/main\.tsx"><\/script>/,
        () =>
            `<script>${serializeCatalogPayload(args.inlinePayload)}</script>\n    ` +
            args.clientAssets.scriptTag
    );

    const rootMarker = '<div id="root">';
    const rootIndex = html.indexOf(rootMarker);
    if (rootIndex === -1) {
        throw new Error("publicShell: template senza <div id=\"root\">");
    }
    const splitAt = rootIndex + rootMarker.length;

    return {
        beforeApp: html.slice(0, splitAt),
        afterApp: html.slice(splitAt)
    };
}
