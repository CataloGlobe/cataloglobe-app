import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import { buildTenantInviteEmail } from "@shared/accountEmails";

describe("safeHttpHref", () => {
    it("tiene http e https", () => {
        expect(safeHttpHref("https://example.com/menu?x=1")).toBe("https://example.com/menu?x=1");
        expect(safeHttpHref("http://example.com")).toBe("http://example.com/");
    });

    it("senza schema aggiunge https, anche con la porta", () => {
        expect(safeHttpHref("www.example.com")).toBe("https://www.example.com/");
        expect(safeHttpHref("example.com:8080/menu")).toBe("https://example.com:8080/menu");
        expect(safeHttpHref("HTTPS://Example.com")).toBe("https://example.com/");
    });

    it.each([
        "javascript:alert(1)",
        "javascript:1",
        "javascript://%0aalert(1)",
        "JavaScript:alert(document.cookie)",
        "  javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "mailto:a@b.it",
        "ftp://example.com",
        "tel:+390212345"
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
            expect(src).toContain(`safeHttpHref(${field})`);
        }
    });
});

describe("mail di invito: escape dei dati dell'utente", () => {
    // Dal modello unico delle mail (#374) l'HTML sta in buildTenantInviteEmail:
    // l'edge deve usare quel builder, non un suo `html:` scritto a mano.
    it("send-tenant-invite usa buildTenantInviteEmail e non scrive HTML suo", () => {
        const src = readFileSync(path.resolve(__dirname, "../../supabase/functions/send-tenant-invite/index.ts"), "utf8");
        expect(src).toContain("...buildTenantInviteEmail({ tenantName, inviterEmail, inviteUrl })");
        expect(src).not.toMatch(/\bhtml\s*:/);
    });

    it("tenantName e inviterEmail non entrano grezzi nell'HTML, anteprima compresa", () => {
        const { html } = buildTenantInviteEmail({
            tenantName: 'Bar <a href="https://x.example">Rosso</a>',
            inviterEmail: "<img src=x onerror=alert(1)>@example.com",
            inviteUrl: 'https://app.example/invite/abc"><script>'
        });
        expect(html).not.toContain("<a href=\"https://x.example\">");
        expect(html).not.toContain("<img src=x");
        expect(html).not.toContain("<script>");
        expect(html).toContain("Bar &lt;a href=");
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });
});

describe("link non sicuro: l'elemento non si disegna", () => {
    const base = path.resolve(__dirname, "../components/PublicCollectionView");
    it.each([
        ["FeaturedCard/FeaturedCard.tsx", "!!safeHttpHref(block.cta_url)"],
        ["FeaturedBlock/FeaturedContentDetail.tsx", "!href) return null"],
        ["ReviewsView/ReviewsView.tsx", "showGoogleCard && safeGoogleReviewUrl &&"],
        ["StoryView/StoryView.tsx", "{safeHttpHref(cappello.website) && ("],
        ["CollectionView/CollectionView.tsx", "safeHttpHref(socialLinks.facebook) && ("]
    ])("%s", (file, guard) => {
        expect(readFileSync(path.join(base, file), "utf8")).toContain(guard);
    });
});
