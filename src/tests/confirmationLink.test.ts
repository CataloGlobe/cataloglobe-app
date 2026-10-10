import { describe, it, expect } from "vitest";
import { parseConfirmationLink } from "@/utils/confirmationLink";

const verifyUrl = "https://example.supabase.co/auth/v1/verify?token=abc123&type=signup&redirect_to=x";

describe("parseConfirmationLink", () => {
    it("modello personalizzato: confirmation_url codificato", () => {
        expect(parseConfirmationLink(`?confirmation_url=${encodeURIComponent(verifyUrl)}`)).toEqual({
            tokenHash: "abc123",
            type: "signup"
        });
    });

    it("confirmation_url codificato due volte", () => {
        const twice = encodeURIComponent(encodeURIComponent(verifyUrl));
        expect(parseConfirmationLink(`?confirmation_url=${twice}`)?.tokenHash).toBe("abc123");
    });

    it("formato standard: token_hash e type nella query", () => {
        expect(parseConfirmationLink("?token_hash=h1&type=signup")).toEqual({ tokenHash: "h1", type: "signup" });
    });

    it("link mancante, incompleto o con tipo sconosciuto: null", () => {
        expect(parseConfirmationLink("")).toBeNull();
        expect(parseConfirmationLink("?token_hash=h1")).toBeNull();
        expect(parseConfirmationLink("?token_hash=h1&type=boh")).toBeNull();
        expect(parseConfirmationLink("?confirmation_url=non-un-url")).toBeNull();
    });
});
