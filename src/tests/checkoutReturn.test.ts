import { describe, it, expect } from "vitest";
import {
    CHECKOUT_SESSION_PARAM,
    readCheckoutSessionId,
    stripCheckoutSessionParam
} from "../utils/checkoutReturn";

describe("checkoutReturn — ?checkout_session= on the return from Stripe", () => {
    it("reads a Checkout Session id from the query string", () => {
        expect(readCheckoutSessionId("?checkout_session=cs_test_abc123")).toBe("cs_test_abc123");
        expect(readCheckoutSessionId(`?session=success&${CHECKOUT_SESSION_PARAM}=cs_live_X9`)).toBe("cs_live_X9");
    });

    it("ignores absent, empty or malformed values", () => {
        expect(readCheckoutSessionId("")).toBeNull();
        expect(readCheckoutSessionId("?session=success")).toBeNull();
        expect(readCheckoutSessionId("?checkout_session=")).toBeNull();
        // Stripe never substituted the placeholder (URL built by hand).
        expect(readCheckoutSessionId("?checkout_session=%7BCHECKOUT_SESSION_ID%7D")).toBeNull();
        expect(readCheckoutSessionId("?checkout_session=not-a-session")).toBeNull();
    });

    it("strips only its own param and keeps the rest", () => {
        expect(stripCheckoutSessionParam("?session=success&checkout_session=cs_test_a")).toBe("?session=success");
        expect(stripCheckoutSessionParam("?checkout_session=cs_test_a")).toBe("");
        expect(stripCheckoutSessionParam("?tab=hours")).toBe("?tab=hours");
    });
});
