import { describe, it, expect } from "vitest";
import { APP_ORIGINS, appCorsHeaders, isAppOrigin } from "./cors";

describe("appCorsHeaders", () => {
    it("rimanda indietro un origin dell'app", () => {
        for (const o of APP_ORIGINS) {
            expect(appCorsHeaders(o)["Access-Control-Allow-Origin"]).toBe(o);
        }
    });

    it("lascia vuoto un origin estraneo o assente", () => {
        expect(appCorsHeaders("https://evil.example")["Access-Control-Allow-Origin"]).toBe("");
        expect(appCorsHeaders(null)["Access-Control-Allow-Origin"]).toBe("");
        expect(isAppOrigin("https://cataloglobe.com.evil.example")).toBe(false);
    });

    it("aggiunge Content-Type solo con json", () => {
        expect(appCorsHeaders("https://cataloglobe.com")["Content-Type"]).toBeUndefined();
        expect(appCorsHeaders("https://cataloglobe.com", { json: true })["Content-Type"]).toBe("application/json");
    });

    it("usa la regola passata al posto della lista", () => {
        const h = appCorsHeaders("https://anteprima.example", { allowed: o => o.endsWith(".example") });
        expect(h["Access-Control-Allow-Origin"]).toBe("https://anteprima.example");
        expect(h.Vary).toBe("Origin");
    });
});
