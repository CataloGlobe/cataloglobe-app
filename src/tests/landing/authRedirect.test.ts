import { describe, expect, it } from "vitest";
import { authRedirectTarget } from "@/pages/CampaignLanding/authRedirect";

describe("authRedirectTarget", () => {
    it("lascia la landing senza token", () => {
        expect(authRedirectTarget("", "")).toBeNull();
        expect(authRedirectTarget("?utm_source=meta&promo=ESTATE", "")).toBeNull();
        expect(authRedirectTarget("", "#prezzi")).toBeNull();
    });

    it("manda al login un token implicito di conferma, con lo stesso hash", () => {
        const hash = "#access_token=abc&refresh_token=def&type=signup";
        expect(authRedirectTarget("", hash)).toBe(`/login${hash}`);
    });

    it("manda al reset della password un token di recupero", () => {
        const hash = "#access_token=abc&type=recovery";
        expect(authRedirectTarget("", hash)).toBe(`/reset-password${hash}`);
        expect(authRedirectTarget("?token_hash=xyz&type=recovery", "")).toBe("/reset-password?token_hash=xyz&type=recovery");
    });

    it("riconosce il codice PKCE e il token_hash in query", () => {
        expect(authRedirectTarget("?code=123", "")).toBe("/login?code=123");
        expect(authRedirectTarget("?token_hash=xyz&type=signup", "")).toBe("/login?token_hash=xyz&type=signup");
    });

    it("porta nell'app anche gli errori di un link scaduto", () => {
        const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid";
        expect(authRedirectTarget("", hash)).toBe(`/login${hash}`);
        expect(authRedirectTarget("?error=access_denied&error_description=x", "")).toBe("/login?error=access_denied&error_description=x");
    });

    it("conserva query e hash insieme", () => {
        expect(authRedirectTarget("?promo=X", "#access_token=a&type=signup")).toBe("/login?promo=X#access_token=a&type=signup");
    });
});
