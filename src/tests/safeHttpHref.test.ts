import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { safeHttpHref } from "@/utils/sanitizeUrl";

describe("safeHttpHref", () => {
    it("tiene http e https", () => {
        expect(safeHttpHref("https://example.com/menu?x=1")).toBe("https://example.com/menu?x=1");
        expect(safeHttpHref("http://example.com")).toBe("http://example.com/");
    });

    it("senza schema aggiunge https", () => {
        expect(safeHttpHref("www.example.com")).toBe("https://www.example.com/");
    });

    it.each([
        "javascript:alert(1)",
        "JavaScript:alert(document.cookie)",
        "  javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "mailto:a@b.it",
        "ftp://example.com"
    ])("spegne %s", url => {
        expect(safeHttpHref(url)).toBeUndefined();
    });

    it("vuoto o assente: undefined", () => {
        expect(safeHttpHref("")).toBeUndefined();
        expect(safeHttpHref("   ")).toBeUndefined();
        expect(safeHttpHref(null)).toBeUndefined();
        expect(safeHttpHref(undefined)).toBeUndefined();
    });
});

describe("link del locale sulla pagina pubblica passano da safeHttpHref", () => {
    const base = path.resolve(__dirname, "../components/PublicCollectionView");
    const cases: Array<[string, string[]]> = [
        ["FeaturedCard/FeaturedCard.tsx", ["block.cta_url"]],
        ["FeaturedBlock/FeaturedContentDetail.tsx", ["block.cta_url"]],
        ["CollectionView/CollectionView.tsx", ["socialLinks.website", "socialLinks.facebook"]],
        ["ReviewsView/ReviewsView.tsx", ["googleReviewUrl"]],
        ["StoryView/StoryView.tsx", ["cappello.website"]]
    ];
    it.each(cases)("%s", (file, fields) => {
        const src = readFileSync(path.join(base, file), "utf8");
        for (const field of fields) {
            const raw = new RegExp(`href=\\{${field.replace(/\./g, "\\.")}!?\\}`);
            expect(src).not.toMatch(raw);
            expect(src).toContain(`href={safeHttpHref(${field})}`);
        }
    });
});

describe("mail di invito: escape dei dati dell'utente", () => {
    it("tenantName e inviterEmail non entrano grezzi nell'HTML", () => {
        const src = readFileSync(path.resolve(__dirname, "../../supabase/functions/send-tenant-invite/index.ts"), "utf8");
        const html = src.slice(src.indexOf("html: `"), src.indexOf("text: `"));
        expect(html).not.toMatch(/\$\{(tenantName|inviterEmail|inviteUrl)\}/);
        expect(html).toContain("${safeTenantName}");
        expect(html).toContain("${safeInviterEmail}");
    });
});
