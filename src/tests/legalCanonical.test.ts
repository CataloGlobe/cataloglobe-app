import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
// Arriva con @vercel/node, alla stessa versione che usa il routing di Vercel.
import { pathToRegexp } from "path-to-regexp";
import { applyCanonical } from "@/hooks/useCanonical";

/** Head finto: quanto basta ad applyCanonical. */
function fakeDocument(initialHref?: string) {
    const links: FakeLink[] = [];
    class FakeLink {
        attrs = new Map<string, string>();
        getAttribute(name: string) {
            return this.attrs.get(name) ?? null;
        }
        setAttribute(name: string, value: string) {
            this.attrs.set(name, value);
        }
        removeAttribute(name: string) {
            this.attrs.delete(name);
        }
        remove() {
            links.splice(links.indexOf(this), 1);
        }
    }
    const head = {
        querySelector: () => links.find(l => l.getAttribute("rel") === "canonical") ?? null,
        appendChild: (l: FakeLink) => links.push(l)
    };
    if (initialHref) {
        const l = new FakeLink();
        l.setAttribute("rel", "canonical");
        l.setAttribute("href", initialHref);
        links.push(l);
    }
    const doc = { head, createElement: () => new FakeLink() } as unknown as Document;
    return { doc, links };
}

describe("applyCanonical", () => {
    it("aggiunge il link e lo toglie all'uscita", () => {
        const { doc, links } = fakeDocument();
        const undo = applyCanonical(doc, "https://cataloglobe.com/legal/privacy");
        expect(links).toHaveLength(1);
        expect(links[0].getAttribute("href")).toBe("https://cataloglobe.com/legal/privacy");
        undo();
        expect(links).toHaveLength(0);
    });

    it("se c'è già, cambia l'href e poi lo rimette com'era", () => {
        const { doc, links } = fakeDocument("https://cataloglobe.com/");
        const undo = applyCanonical(doc, "https://cataloglobe.com/legal/termini");
        expect(links).toHaveLength(1);
        expect(links[0].getAttribute("href")).toBe("https://cataloglobe.com/legal/termini");
        undo();
        expect(links[0].getAttribute("href")).toBe("https://cataloglobe.com/");
    });
});

describe("pagine legali", () => {
    it.each([
        ["PrivacyPolicyPage.tsx", "privacyUrl"],
        ["TermsPage.tsx", "termsUrl"]
    ])("%s usa il canonical", (file, key) => {
        const source = readFileSync(path.resolve(__dirname, "../pages/Legal", file), "utf-8");
        expect(source).toContain(`useCanonical(COMPANY.web.${key})`);
    });
});

describe("vercel.json: /.well-known/* non cade sulla SPA", () => {
    const config = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf-8"));
    const toApp = (config.rewrites as { source: string; destination: string }[]).filter(
        r => r.destination === "/app.html"
    );
    const matchesApp = (url: string) => toApp.some(r => pathToRegexp(r.source).test(url));

    it.each(["/.well-known/ai-catalog.json", "/.well-known/security.txt"])("%s: 404", url => {
        expect(matchesApp(url)).toBe(false);
    });

    it.each(["/", "/dashboard", "/legal/privacy", "/qualcosa/di/nuovo"])("%s: SPA", url => {
        expect(matchesApp(url)).toBe(true);
    });
});
