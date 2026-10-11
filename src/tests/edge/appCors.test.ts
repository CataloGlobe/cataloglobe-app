import { describe, expect, it } from "vitest";
import { appCorsHeaders, withAppCors } from "../../../supabase/functions/_shared/cors";

function reqFrom(origin?: string): Request {
    return new Request("https://example.supabase.co/functions/v1/acknowledge-order", {
        method: "POST",
        headers: origin ? { origin } : {}
    });
}

describe("appCorsHeaders", () => {
    it("rimanda l'origin dell'app", () => {
        expect(appCorsHeaders("https://cataloglobe.com")["Access-Control-Allow-Origin"]).toBe("https://cataloglobe.com");
    });

    it("lascia vuoto un origin estraneo", () => {
        expect(appCorsHeaders("https://evil.example")["Access-Control-Allow-Origin"]).toBe("");
    });
});

describe("withAppCors", () => {
    it("mette gli header dell'app su una risposta già pronta, tenendo gli altri", () => {
        const res = withAppCors(
            reqFrom("https://staging.cataloglobe.com"),
            new Response("{}", { status: 409, headers: { "Content-Type": "application/json", "Retry-After": "5" } })
        );
        expect(res.status).toBe(409);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://staging.cataloglobe.com");
        expect(res.headers.get("Vary")).toBe("Origin");
        expect(res.headers.get("Content-Type")).toBe("application/json");
        expect(res.headers.get("Retry-After")).toBe("5");
    });

    it("non apre a un sito qualsiasi, nemmeno se la risposta aveva l'asterisco", () => {
        const res = withAppCors(
            reqFrom("https://evil.example"),
            new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } })
        );
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("");
    });

    it("senza origin (chiamata da server) l'header resta vuoto", () => {
        const res = withAppCors(reqFrom(), new Response("ok"));
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("");
    });
});
