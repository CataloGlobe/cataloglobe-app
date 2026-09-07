import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
    SUNMI_API_BASE,
    SUNMI_CODES,
    buildSunmiHeaders,
    buildSunmiSignature,
    categorizeSunmiCode,
    sunmiNonce,
    sunmiRequest,
    sunmiTimestamp
} from "./sunmi";

const CREDS = { appId: "app-123", appKey: "key-abc" };

function nodeHmac(body: string, ts: string, nonce: string): string {
    return createHmac("sha256", CREDS.appKey)
        .update(body + CREDS.appId + ts + nonce)
        .digest("hex");
}

describe("buildSunmiSignature", () => {
    it("matches HMAC-SHA256(body+appid+ts+nonce, appkey) hex lowercase", async () => {
        const body = JSON.stringify({ sn: "N411ABC", shop_id: 1000 });
        const ts = "1725600000";
        const nonce = "123456";
        const sig = await buildSunmiSignature(body, CREDS.appId, ts, nonce, CREDS.appKey);
        expect(sig).toBe(nodeHmac(body, ts, nonce));
        expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("buildSunmiHeaders", () => {
    it("sets every mandatory header including Source: openapi", async () => {
        const body = JSON.stringify({ sn: "X" });
        const h = await buildSunmiHeaders(body, CREDS, "1725600000", "654321");
        expect(h["Content-Type"]).toBe("application/json");
        expect(h["Source"]).toBe("openapi");
        expect(h["Sunmi-Appid"]).toBe(CREDS.appId);
        expect(h["Sunmi-Timestamp"]).toBe("1725600000");
        expect(h["Sunmi-Nonce"]).toBe("654321");
        expect(h["Sunmi-Sign"]).toBe(nodeHmac(body, "1725600000", "654321"));
    });
});

describe("timestamp / nonce", () => {
    it("timestamp is 10-digit unix seconds", () => {
        expect(sunmiTimestamp(1725600000123)).toBe("1725600000");
    });
    it("nonce is 6 digits, non-zero leading", () => {
        for (let i = 0; i < 50; i++) {
            expect(sunmiNonce()).toMatch(/^[1-9][0-9]{5}$/);
        }
    });
});

describe("categorizeSunmiCode", () => {
    it("maps known codes", () => {
        expect(categorizeSunmiCode(SUNMI_CODES.AUTH_FAILED)).toBe("config");
        expect(categorizeSunmiCode(SUNMI_CODES.NO_ABILITY)).toBe("config");
        expect(categorizeSunmiCode(SUNMI_CODES.BAD_SIGNATURE)).toBe("config");
        expect(categorizeSunmiCode(SUNMI_CODES.DEVICE_UNKNOWN)).toBe("device");
        expect(categorizeSunmiCode(SUNMI_CODES.NOT_IN_CHANNEL)).toBe("device");
        expect(categorizeSunmiCode(SUNMI_CODES.ALREADY_BOUND)).toBe("state");
        expect(categorizeSunmiCode(999999)).toBe("unknown");
    });
});

describe("sunmiRequest", () => {
    function fakeFetch(
        reply: { status?: number; json?: unknown; text?: string },
        capture: { url?: string; init?: RequestInit } = {}
    ): typeof fetch {
        return (async (url: string | URL | Request, init?: RequestInit) => {
            capture.url = String(url);
            capture.init = init;
            const bodyText = reply.text ?? JSON.stringify(reply.json);
            return new Response(bodyText, {
                status: reply.status ?? 200,
                headers: { "Content-Type": "application/json" }
            });
        }) as typeof fetch;
    }

    it("signs exactly the serialized body it sends, against the global gateway", async () => {
        const capture: { url?: string; init?: RequestInit } = {};
        const res = await sunmiRequest(
            "/v2/printer/open/open/device/bindShop",
            { sn: "N411ABC", shop_id: 1000 },
            {
                credentials: CREDS,
                fetchImpl: fakeFetch({ json: { code: 1, msg: "ok", data: null } }, capture),
                timestamp: "1725600000",
                nonce: "111111"
            }
        );
        expect(res.kind).toBe("ok");
        expect(capture.url).toBe(`${SUNMI_API_BASE}/v2/printer/open/open/device/bindShop`);
        const sentBody = capture.init?.body as string;
        expect(sentBody).toBe(JSON.stringify({ sn: "N411ABC", shop_id: 1000 }));
        const headers = capture.init?.headers as Record<string, string>;
        expect(headers["Sunmi-Sign"]).toBe(nodeHmac(sentBody, "1725600000", "111111"));
        expect(headers["Source"]).toBe("openapi");
        expect(capture.init?.method).toBe("POST");
    });

    it("maps a non-1 code to sunmi_error with category", async () => {
        const res = await sunmiRequest(
            "/x",
            { sn: "A" },
            { credentials: CREDS, fetchImpl: fakeFetch({ json: { code: 10071702, msg: "bound" } }) }
        );
        expect(res).toEqual({
            kind: "sunmi_error",
            code: 10071702,
            msg: "bound",
            category: "state"
        });
    });

    it("maps non-JSON body to transport_error", async () => {
        const res = await sunmiRequest(
            "/x",
            { sn: "A" },
            { credentials: CREDS, fetchImpl: fakeFetch({ status: 502, text: "<html>bad gateway" }) }
        );
        expect(res.kind).toBe("transport_error");
    });

    it("maps fetch rejection (timeout/network) to transport_error", async () => {
        const failing = (async () => {
            const e = new Error("aborted");
            e.name = "TimeoutError";
            throw e;
        }) as unknown as typeof fetch;
        const res = await sunmiRequest("/x", { sn: "A" }, { credentials: CREDS, fetchImpl: failing });
        expect(res.kind).toBe("transport_error");
        if (res.kind === "transport_error") expect(res.message).toMatch(/Timeout/);
    });

    it("returns config_error when credentials are missing", async () => {
        const res = await sunmiRequest("/x", { sn: "A" }, { fetchImpl: fakeFetch({ json: { code: 1 } }) });
        expect(res.kind).toBe("config_error");
    });
});
