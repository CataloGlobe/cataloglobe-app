import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    applyTenantHead,
    buildClientAssets,
    buildSsrShell,
    escapeHtml,
    serializeCatalogPayload,
    type PublicShellPayload,
    type ViteManifest
} from "../../../api/_lib/publicShell";

const TEMPLATE = readFileSync(join(process.cwd(), "index.html"), "utf-8");

const MANIFEST: ViteManifest = {
    "src/entry-client.tsx": {
        file: "assets/entry-client-Dx27gO3c.js",
        css: ["assets/entry-client-C00LWXyq.css"]
    }
};

function makePayload(overrides: Partial<PublicShellPayload> = {}): PublicShellPayload {
    return {
        business: {
            name: "San Pietro",
            slug: "san-pietro",
            city: "Milano",
            cover_image: "https://cdn.example.com/cover.jpg"
        },
        tenantLogoUrl: null,
        resolved: { style: { config: { typography: { fontFamily: "poppins" } } } },
        ...overrides
    };
}

const OPTS = { origin: "https://cataloglobe.com", slug: "san-pietro" };

describe("escapeHtml", () => {
    it("neutralizza tutti i metacaratteri HTML", () => {
        expect(escapeHtml(`<img src=x onerror="x"> & 'q'`)).toBe(
            "&lt;img src=x onerror=&quot;x&quot;&gt; &amp; &#39;q&#39;"
        );
    });
});

describe("serializeCatalogPayload", () => {
    it("un </script> nel dato non può chiudere il tag script", () => {
        const out = serializeCatalogPayload({ name: `Bar </script><script>alert(1)</script>` });
        expect(out).not.toContain("</script");
        expect(out).not.toContain("<script");
        expect(out).not.toContain("&");
    });

    it("roundtrip: l'escape resta JSON valido e ricostruisce il dato identico", () => {
        const data = {
            name: `Trattoria <"Da Mario"> & C. </script>`,
            note: "linea separata qui"
        };
        const out = serializeCatalogPayload(data);
        const json = out.replace(/^window\.__PUBLIC_CATALOG__ = /, "").replace(/;$/, "");
        expect(JSON.parse(json)).toEqual(data);
    });
});

describe("applyTenantHead", () => {
    it("inietta title/description/og/canonical per-tenant", () => {
        const html = applyTenantHead(TEMPLATE, makePayload(), OPTS);
        expect(html).toContain("<title>San Pietro — Menu digitale</title>");
        expect(html).toContain('content="Menu digitale di San Pietro · Milano"');
        expect(html).toContain('href="https://cataloglobe.com/san-pietro"');
        expect(html).toContain('content="https://cataloglobe.com/san-pietro"');
    });

    it("nome tenant ostile: niente breakout da attributi o tag", () => {
        const html = applyTenantHead(
            TEMPLATE,
            makePayload({
                business: {
                    name: `"><script>alert(1)</script> $& $1`,
                    slug: "evil",
                    city: `"><img src=x>`,
                    cover_image: null
                }
            }),
            OPTS
        );
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).not.toContain('"><img src=x>');
        // $& in replacement-string espanderebbe il match: deve restare literal
        expect(html).toContain("$&amp; $1");
    });

    it("emette il font dello stile attivo col marker mw-font e de-blocca Inter+Sora", () => {
        const html = applyTenantHead(TEMPLATE, makePayload(), OPTS);
        expect(html).toContain('id="mw-font"');
        expect(html).toContain("family=Poppins");
        // shell Inter trasformata in preload async, Sora rimossa
        expect(html).toContain('rel="preload" as="style"');
        expect(html).not.toMatch(/family=Inter[^"]*family=Sora/);
    });

    it("token inter: link shell omesso del tutto", () => {
        const html = applyTenantHead(
            TEMPLATE,
            makePayload({ resolved: { style: { config: { typography: { fontFamily: "inter" } } } } }),
            OPTS
        );
        expect(html).toContain('id="mw-font"');
        expect(html).not.toContain('rel="preload" as="style"');
        expect(html).not.toMatch(/<link\s+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*"\s+rel="stylesheet"/);
    });

    it("cover https: og:image + twitter:image + preload fetchpriority", () => {
        const html = applyTenantHead(TEMPLATE, makePayload(), OPTS);
        expect(html).toContain('property="og:image" content="https://cdn.example.com/cover.jpg"');
        expect(html).toContain('rel="preload" as="image" href="https://cdn.example.com/cover.jpg"');
    });

    it("cover storage Supabase: preload responsive (imagesrcset) ma og:image resta raw", () => {
        const storageCover =
            "https://proj.supabase.co/storage/v1/object/public/business-covers/t/act/cover.jpg?v=1";
        const html = applyTenantHead(
            TEMPLATE,
            makePayload({
                business: { name: "San Pietro", slug: "san-pietro", city: "Milano", cover_image: storageCover }
            }),
            OPTS
        );
        // og:image/twitter:image = raw full-size (per gli scraper social)
        expect(html).toContain(`property="og:image" content="${escapeHtml(storageCover)}"`);
        // preload responsive: imagesrcset + imagesizes + render path, NO href raw object/public
        expect(html).toContain("imagesrcset=");
        expect(html).toContain('imagesizes="100vw"');
        expect(html).toContain("/storage/v1/render/image/public/");
        expect(html).toContain("width=760&amp;quality=82");
        // il cache-buster ?v=1 preservato come &param dentro lo srcset
        expect(html).toContain("&amp;v=1");
    });

    it("cover non-https scartata", () => {
        const html = applyTenantHead(
            TEMPLATE,
            makePayload({
                business: { name: "X", slug: "x", city: null, cover_image: "javascript:alert(1)" }
            }),
            OPTS
        );
        expect(html).not.toContain("javascript:alert(1)");
        expect(html).not.toContain('property="og:image"');
    });

    it("senza nome business: template invariato", () => {
        expect(applyTenantHead(TEMPLATE, { business: { name: "  " } }, OPTS)).toBe(TEMPLATE);
    });
});

describe("buildSsrShell", () => {
    function build(extra: Partial<Parameters<typeof buildSsrShell>[0]> = {}) {
        return buildSsrShell({
            template: TEMPLATE,
            payload: makePayload(),
            inlinePayload: { payload: makePayload(), allergens: null },
            origin: OPTS.origin,
            slug: OPTS.slug,
            clientAssets: buildClientAssets(MANIFEST, "src/entry-client.tsx", "/public/"),
            supabaseUrl: "https://example.supabase.co",
            ...extra
        });
    }

    it("divide la shell al <div id=\"root\"> e chiude il documento", () => {
        const { beforeApp, afterApp } = build();
        expect(beforeApp.endsWith('<div id="root">')).toBe(true);
        expect(afterApp).toContain("</div>");
        expect(afterApp).toContain("</body>");
        expect(afterApp).toContain("</html>");
    });

    it("payload inline PRIMA dello script client, script main.tsx rimosso", () => {
        const { afterApp } = build();
        const inlineIdx = afterApp.indexOf("window.__PUBLIC_CATALOG__");
        const clientIdx = afterApp.indexOf("/public/assets/entry-client-Dx27gO3c.js");
        expect(inlineIdx).toBeGreaterThan(-1);
        expect(clientIdx).toBeGreaterThan(inlineIdx);
        expect(afterApp).not.toContain("/src/main.tsx");
    });

    it("css dell'entry client nell'head, placeholder env sostituito", () => {
        const { beforeApp } = build();
        expect(beforeApp).toContain('rel="stylesheet" href="/public/assets/entry-client-C00LWXyq.css"');
        expect(beforeApp).toContain('href="https://example.supabase.co"');
        expect(beforeApp).not.toContain("%VITE_SUPABASE_URL%");
    });

    it("integration: payload reale → head per-tenant + inline escaped", () => {
        const real = JSON.parse(
            readFileSync(join(process.cwd(), "spike-ssr", "payload.json"), "utf-8")
        ) as PublicShellPayload;
        const { beforeApp, afterApp } = buildSsrShell({
            template: TEMPLATE,
            payload: real,
            inlinePayload: { payload: real, allergens: null },
            origin: "https://cataloglobe.com",
            slug: "san-pietro-porta-venezia",
            clientAssets: buildClientAssets(MANIFEST, "src/entry-client.tsx", "/public/"),
            supabaseUrl: "https://example.supabase.co"
        });
        expect(beforeApp).toContain("San Pietro — Menu digitale");
        expect(beforeApp).toContain('id="mw-font"');
        expect(afterApp).toContain("window.__PUBLIC_CATALOG__");
        expect(afterApp.indexOf("</script")).toBe(
            afterApp.indexOf('</script>') // unico </script> = chiusura dei tag legittimi
        );
    });
});
