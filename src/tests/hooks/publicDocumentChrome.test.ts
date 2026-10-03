import { describe, expect, it } from "vitest";
import {
    applyPublicDocumentChrome,
    type ChromeDocument
} from "@/components/PublicCollectionView/hooks/publicDocumentChrome";

type FakeStyle = Record<string, string>;
type FakeMeta = { name: string; content: string; removed: boolean; remove: () => void };

function makeMeta(content: string): FakeMeta {
    const meta: FakeMeta = {
        name: "theme-color",
        content,
        removed: false,
        remove: () => { meta.removed = true; }
    };
    return meta;
}

function fakeDocument(themeColor: string | null) {
    const html: FakeStyle = { backgroundColor: "", colorScheme: "" };
    const body: FakeStyle = { backgroundColor: "#0f172a", transition: "background 0.3s ease" };
    const metas: FakeMeta[] = themeColor === null
        ? []
        : [makeMeta(themeColor)];
    const doc: ChromeDocument = {
        documentElement: { style: html },
        body: { style: body },
        findThemeColorMeta: () => metas.find(m => !m.removed) ?? null,
        createThemeColorMeta: () => {
            const meta = makeMeta("");
            metas.push(meta);
            return meta;
        }
    };
    return { doc, html, body, metas };
}

describe("applyPublicDocumentChrome", () => {
    it("porta lo sfondo dello stile su html e body, theme-color compreso", () => {
        const { doc, html, body, metas } = fakeDocument("#6B2DE6");
        applyPublicDocumentChrome(doc, "#fcfcfc");
        expect(html.backgroundColor).toBe("#fcfcfc");
        expect(body.backgroundColor).toBe("#fcfcfc");
        expect(body.transition).toBe("none");
        expect(metas[0].content).toBe("#fcfcfc");
    });

    it("color-scheme segue la luminanza dello stile, non il tema admin", () => {
        const light = fakeDocument("#6B2DE6");
        applyPublicDocumentChrome(light.doc, "#fcfcfc");
        expect(light.html.colorScheme).toBe("light");

        const dark = fakeDocument("#6B2DE6");
        applyPublicDocumentChrome(dark.doc, "#111111");
        expect(dark.html.colorScheme).toBe("dark");
    });

    it("il ripristino rimette i valori di prima", () => {
        const { doc, html, body, metas } = fakeDocument("#6B2DE6");
        const restore = applyPublicDocumentChrome(doc, "#fcfcfc");
        restore();
        expect(html.backgroundColor).toBe("");
        expect(html.colorScheme).toBe("");
        expect(body.backgroundColor).toBe("#0f172a");
        expect(body.transition).toBe("background 0.3s ease");
        expect(metas[0].content).toBe("#6B2DE6");
    });

    it("senza meta theme-color la crea e al ripristino la toglie", () => {
        const { doc, metas } = fakeDocument(null);
        const restore = applyPublicDocumentChrome(doc, "#fcfcfc");
        expect(metas).toHaveLength(1);
        expect(metas[0].content).toBe("#fcfcfc");
        restore();
        expect(metas[0].removed).toBe(true);
    });
});
