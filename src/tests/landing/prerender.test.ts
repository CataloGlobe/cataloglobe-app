import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLandingDocument, inlineStylesheets, LANDING_ROOT_MARKER, prerenderedVariante } from "@/pages/CampaignLanding/prerender";

const template = readFileSync(path.resolve(__dirname, "../../../landing.html"), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("buildLandingDocument", () => {
    it("landing.html ha il contenitore del prerender", () => {
        expect(count(template, LANDING_ROOT_MARKER)).toBe(1);
    });

    it("mette la pagina nel #root con la variante", () => {
        const html = buildLandingDocument(template, "<h1>Ciao</h1>", "form");
        expect(html).toContain('<div id="root" data-landing-prerender="form"><h1>Ciao</h1></div>');
        expect(html).not.toContain(LANDING_ROOT_MARKER);
    });

    it("/ resta indicizzabile, /b ha noindex e il canonical su / una volta sola", () => {
        const form = buildLandingDocument(template, "", "form");
        const signup = buildLandingDocument(template, "", "signup");
        expect(count(form, 'name="robots"')).toBe(0);
        expect(count(signup, '<meta name="robots" content="noindex" />')).toBe(1);
        expect(count(signup, 'rel="canonical"')).toBe(1);
        expect(signup).toContain('<link rel="canonical" href="https://cataloglobe.com/" />');
    });

    it("non interpreta i pattern di sostituzione nell'HTML", () => {
        expect(buildLandingDocument(template, "<p>$& $1 $'</p>", "form")).toContain("<p>$& $1 $'</p>");
    });

    it("si ferma se il template non ha il contenitore", () => {
        expect(() => buildLandingDocument('<div id="root"></div>', "", "form")).toThrow(/landing-ssr/);
    });
});

describe("prerenderedVariante", () => {
    it("legge solo le varianti note", () => {
        const el = (v?: string) => ({ dataset: v === undefined ? {} : { landingPrerender: v } }) as unknown as HTMLElement;
        expect(prerenderedVariante(el("form"))).toBe("form");
        expect(prerenderedVariante(el("signup"))).toBe("signup");
        expect(prerenderedVariante(el())).toBeNull();
        expect(prerenderedVariante(el("altro"))).toBeNull();
    });
});

describe("inlineStylesheets", () => {
    const head = '<head><link rel="preload" href="/f.woff2" as="font" /><link rel="stylesheet" crossorigin href="/assets/landing-X.css"><link rel="canonical" href="/" /></head>';

    it("mette il CSS al posto del link, nello stesso punto dell'head", () => {
        const out = inlineStylesheets(head, (href) => (href === "/assets/landing-X.css" ? '@charset "UTF-8";a{color:red}' : ""));
        expect(out).toBe('<head><link rel="preload" href="/f.woff2" as="font" /><style data-href="/assets/landing-X.css">a{color:red}</style><link rel="canonical" href="/" /></head>');
    });

    it("non interpreta i pattern di sostituzione nel CSS", () => {
        expect(inlineStylesheets(head, () => "a::after{content:\"$&\"}")).toContain('a::after{content:"$&"}');
    });

    it("si ferma senza fogli di stile o con </style> nel CSS", () => {
        expect(() => inlineStylesheets("<head></head>", () => "")).toThrow(/nessun foglio/);
        expect(() => inlineStylesheets(head, () => "a{}</style>")).toThrow(/<\/style>/);
    });

    it("landing.html non ha fogli di stile: li aggiunge Vite al build", () => {
        expect(template).not.toContain('rel="stylesheet"');
    });
});
