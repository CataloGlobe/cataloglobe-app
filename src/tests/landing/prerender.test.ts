import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAQ, PRICING } from "@/pages/CampaignLanding/content/landing";
import { buildLandingDocument, faqPageLdScript, inlineStylesheets, LANDING_ROOT_MARKER, prerenderedVariante } from "@/pages/CampaignLanding/prerender";

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

describe("FAQPage JSON-LD", () => {
    const FAQ_LD = /<script type="application\/ld\+json" data-landing-ld>([\s\S]*?)<\/script>/g;
    const faqBlocks = (html: string) =>
        [...html.matchAll(FAQ_LD)].map((m) => JSON.parse(m[1])).filter((ld) => ld["@type"] === "FAQPage");

    it("solo su /, una volta, nell'head e marcato data-landing-ld", () => {
        const form = buildLandingDocument(template, "", "form");
        const signup = buildLandingDocument(template, "", "signup");
        expect(faqBlocks(form)).toHaveLength(1);
        expect(faqBlocks(signup)).toHaveLength(0);
        expect(count(signup, '"FAQPage"')).toBe(0);
        const head = form.slice(0, form.indexOf("</head>"));
        expect(count(head, '"@type": "FAQPage"')).toBe(1);
    });

    it("domande e risposte coincidono con quelle della sezione FAQ, nello stesso ordine", () => {
        const [ld] = faqBlocks(buildLandingDocument(template, "", "form"));
        expect(ld["@context"]).toBe("https://schema.org");
        const pairs = ld.mainEntity.map((e: { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }) => {
            expect(e["@type"]).toBe("Question");
            expect(e.acceptedAnswer["@type"]).toBe("Answer");
            return { q: e.name, a: e.acceptedAnswer.text };
        });
        expect(pairs).toEqual(FAQ.items.map(({ q, a }) => ({ q, a })));
    });

    it("«Quanto costa?» usa i prezzi di PRICING", () => {
        const cost = FAQ.items.find((i) => i.q === "Quanto costa?");
        for (const plan of Object.values(PRICING.plans)) {
            expect(cost?.a).toContain(`${plan.month} al mese o ${plan.year} all’anno`);
        }
    });

    it("un testo con </script> non chiude il blocco", () => {
        const script = faqPageLdScript([{ q: "</script><b>x</b>", a: "a < b" }]);
        expect(count(script, "</script>")).toBe(1);
        expect(JSON.parse(script.replace(/^<script[^>]*>\n/, "").replace(/\n<\/script>$/, "")).mainEntity[0].name).toBe("</script><b>x</b>");
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
