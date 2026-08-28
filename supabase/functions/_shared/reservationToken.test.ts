import { webcrypto } from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";
import {
    InvalidReservationTokenError,
    signReservationToken,
    verifyReservationToken
} from "./reservationToken.ts";

// Il modulo gira su Deno, dove `crypto` è sempre globale. Node 18 lo espone
// solo nel realm principale e non dentro il contesto vm in cui vitest esegue i
// test, quindi qui va fornito a mano: senza, l'esito dipenderebbe dalla
// versione di Node della macchina, ed è il tipo di test che passa in locale e
// cade in CI (o viceversa).
if (typeof globalThis.crypto === "undefined") {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

// The module reads RESERVATION_TOKEN_SECRET lazily on every call, so stubbing
// `globalThis.Deno` per test is enough — no module reset needed.
const SECRET = "test-reservation-secret-0123456789abcdef";
const OTHER_SECRET = "a-completely-different-secret-value-000";
const RID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function setSecret(value: string | undefined): void {
    (globalThis as { Deno?: unknown }).Deno = {
        env: { get: (key: string) => (key === "RESERVATION_TOKEN_SECRET" ? value : undefined) }
    };
}

afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
});

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mints a correctly-signed token over an arbitrary payload, to probe payload validation. */
async function signRawPayload(payload: unknown, secret = SECRET): Promise<string> {
    const body = `v1.${toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

describe("token valido", () => {
    it("firma e verifica restituiscono lo stesso reservation id", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        await expect(verifyReservationToken(token)).resolves.toEqual({ reservationId: RID });
    });

    it("ha il formato v1.<payload>.<firma>", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        const parts = token.split(".");
        expect(parts).toHaveLength(3);
        expect(parts[0]).toBe("v1");
        // Nessun carattere che vada percent-encodato in una query string.
        expect(token).toMatch(/^[A-Za-z0-9._-]+$/);
    });

    it("non è un JWT: nessun header decodificabile con alg", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        // Un JWT avrebbe un header JSON in prima posizione; qui c'è "v1".
        expect(() => JSON.parse(atob(token.split(".")[0]))).toThrow();
    });

    it("normalizza l'id a minuscolo", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID.toUpperCase());
        await expect(verifyReservationToken(token)).resolves.toEqual({ reservationId: RID });
    });

    it("token diversi per prenotazioni diverse", async () => {
        setSecret(SECRET);
        const a = await signReservationToken(RID);
        const b = await signReservationToken("11111111-2222-3333-4444-555555555555");
        expect(a).not.toBe(b);
    });
});

describe("firma manomessa", () => {
    it("rifiuta un token con l'ultimo carattere della firma cambiato", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
        await expect(verifyReservationToken(flipped)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it("rifiuta un token senza firma", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        const [v, p] = token.split(".");
        await expect(verifyReservationToken(`${v}.${p}.`)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it("rifiuta la firma di un'altra prenotazione", async () => {
        setSecret(SECRET);
        const mine = await signReservationToken(RID);
        const other = await signReservationToken("11111111-2222-3333-4444-555555555555");
        const spliced = `${mine.split(".").slice(0, 2).join(".")}.${other.split(".")[2]}`;
        await expect(verifyReservationToken(spliced)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });
});

describe("payload manomesso", () => {
    it("rifiuta un payload riscritto su un'altra prenotazione", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        const forged = toBase64Url(
            new TextEncoder().encode(
                JSON.stringify({ rid: "11111111-2222-3333-4444-555555555555" })
            )
        );
        const tampered = `v1.${forged}.${token.split(".")[2]}`;
        await expect(verifyReservationToken(tampered)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it("rifiuta un payload firmato correttamente ma senza rid", async () => {
        setSecret(SECRET);
        const token = await signRawPayload({ foo: "bar" });
        await expect(verifyReservationToken(token)).rejects.toThrow(/no valid rid/);
    });

    it("rifiuta un rid che non è un UUID", async () => {
        setSecret(SECRET);
        const token = await signRawPayload({ rid: "not-a-uuid" });
        await expect(verifyReservationToken(token)).rejects.toThrow(/no valid rid/);
    });

    it("rifiuta un rid non stringa", async () => {
        setSecret(SECRET);
        const token = await signRawPayload({ rid: 42 });
        await expect(verifyReservationToken(token)).rejects.toThrow(/no valid rid/);
    });

    it("rifiuta un payload che non è JSON, pur firmato correttamente", async () => {
        setSecret(SECRET);
        const body = `v1.${toBase64Url(new TextEncoder().encode("non-json"))}`;
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
        await expect(
            verifyReservationToken(`${body}.${toBase64Url(new Uint8Array(sig))}`)
        ).rejects.toThrow(/payload is not JSON/);
    });
});

describe("segreto diverso", () => {
    it("un token firmato con un altro segreto non verifica", async () => {
        setSecret(OTHER_SECRET);
        const foreign = await signReservationToken(RID);
        setSecret(SECRET);
        await expect(verifyReservationToken(foreign)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it("la rotazione del segreto invalida i token precedenti", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        setSecret(`${SECRET}-rotated`);
        await expect(verifyReservationToken(token)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });
});

describe("formato non valido", () => {
    it.each([
        ["stringa vuota", ""],
        ["un solo segmento", "abcdef"],
        ["due segmenti", "v1.abcdef"],
        ["quattro segmenti", "v1.a.b.c"],
        ["payload vuoto", "v1..abc"],
        ["versione ignota", "v2.abc.def"],
        ["versione vuota", ".abc.def"],
        ["solo punti", ".."],
        ["caratteri fuori da base64url", "v1.abc.***"],
        ["JWT di altro tipo", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln"]
    ])("rifiuta %s", async (_label, value) => {
        setSecret(SECRET);
        await expect(verifyReservationToken(value)).rejects.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it.each([null, undefined, 42, {}, ["v1.a.b"]])(
        "rifiuta il non-stringa %j",
        async value => {
            setSecret(SECRET);
            await expect(verifyReservationToken(value)).rejects.toBeInstanceOf(
                InvalidReservationTokenError
            );
        }
    );
});

describe("segreto mancante — fail closed", () => {
    it("la verifica fallisce se il segreto non è configurato", async () => {
        setSecret(SECRET);
        const token = await signReservationToken(RID);
        setSecret(undefined);
        await expect(verifyReservationToken(token)).rejects.toThrow(
            /RESERVATION_TOKEN_SECRET environment variable is not set/
        );
    });

    it("il segreto vuoto o solo spazi vale come mancante", async () => {
        setSecret("   ");
        await expect(signReservationToken(RID)).rejects.toThrow(
            /RESERVATION_TOKEN_SECRET environment variable is not set/
        );
    });

    it("il segreto mancante NON è un token invalido (è un guasto di deploy)", async () => {
        setSecret(undefined);
        await expect(verifyReservationToken("v1.abc.def")).rejects.not.toBeInstanceOf(
            InvalidReservationTokenError
        );
    });

    it("la firma fallisce se il segreto non è configurato", async () => {
        setSecret(undefined);
        await expect(signReservationToken(RID)).rejects.toThrow(
            /RESERVATION_TOKEN_SECRET environment variable is not set/
        );
    });
});

describe("firma — validazione dell'input", () => {
    it.each(["", "not-a-uuid", "3f2504e0-4f89-41d3-9a0c", "  "])(
        "rifiuta di firmare %j",
        async value => {
            setSecret(SECRET);
            await expect(signReservationToken(value)).rejects.toThrow(/must be a UUID/);
        }
    );
});
