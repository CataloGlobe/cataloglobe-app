import { describe, expect, it } from "vitest";
import {
    GoogleCalendarError,
    buildCallEvent,
    deleteEvent,
    getAccessToken,
    insertEvent,
    parseCalendarEvents,
    parseServiceAccount,
    signServiceJwt
} from "./crmGoogleCalendar";

async function testAccount() {
    const pair = await crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["sign", "verify"]
    );
    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    let binary = "";
    for (const b of der) binary += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
    return { account: { clientEmail: "agenda@progetto.iam.gserviceaccount.com", privateKey: pem }, publicKey: pair.publicKey };
}

function fromBase64Url(s: string): Uint8Array {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}

const jsonResponse = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status });

describe("parseServiceAccount", () => {
    it("legge client_email e private_key", () => {
        const raw = JSON.stringify({ client_email: "a@b.iam", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----" });
        expect(parseServiceAccount(raw)?.clientEmail).toBe("a@b.iam");
    });
    it.each([null, "", "non json", JSON.stringify({ client_email: "a@b" }), JSON.stringify({ private_key: "PRIVATE KEY" })])(
        "rifiuta %s",
        raw => expect(parseServiceAccount(raw as string | null)).toBeNull()
    );
});

describe("signServiceJwt", () => {
    it("firma RS256 verificabile con lo scope del calendario", async () => {
        const { account, publicKey } = await testAccount();
        const jwt = await signServiceJwt(account, 1_800_000_000);
        const [h, c, sig] = jwt.split(".");
        expect(JSON.parse(new TextDecoder().decode(fromBase64Url(h)))).toEqual({ alg: "RS256", typ: "JWT" });
        const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(c)));
        expect(claims).toMatchObject({
            iss: account.clientEmail,
            scope: "https://www.googleapis.com/auth/calendar.events",
            aud: "https://oauth2.googleapis.com/token",
            iat: 1_800_000_000,
            exp: 1_800_003_600
        });
        const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, fromBase64Url(sig), new TextEncoder().encode(`${h}.${c}`));
        expect(ok).toBe(true);
    });

    it("accetta la chiave con i \\n scritti come testo (copiata dal JSON)", async () => {
        const { account } = await testAccount();
        const escaped = { ...account, privateKey: account.privateKey.replace(/\n/g, "\\n") };
        await expect(signServiceJwt(escaped, 1)).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
});

describe("getAccessToken", () => {
    it("scambia il JWT con il token", async () => {
        const { account } = await testAccount();
        let body = "";
        const token = await getAccessToken(account, (async (_url: string, init: RequestInit) => {
            body = String(init.body);
            return jsonResponse(200, { access_token: "ya29.x", expires_in: 3599 });
        }) as unknown as typeof fetch);
        expect(token).toBe("ya29.x");
        expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    });

    it("errore leggibile se Google rifiuta", async () => {
        const { account } = await testAccount();
        await expect(
            getAccessToken(account, (async () => jsonResponse(400, { error: "invalid_grant" })) as unknown as typeof fetch)
        ).rejects.toBeInstanceOf(GoogleCalendarError);
    });
});

describe("buildCallEvent", () => {
    it("titolo, descrizione, fuso di Roma, id della telefonata", () => {
        const e = buildCallEvent({
            appointmentId: "ap-1",
            venueName: "Bar Roma",
            city: "Milano",
            contactName: "Mario",
            phone: "+393331112233",
            callerName: "Alessandro",
            startsAt: "2026-10-08T15:45:00.000Z",
            endsAt: "2026-10-08T15:55:00.000Z",
            leadUrl: "https://x/admin/lead/v1",
            note: null
        });
        expect(e.summary).toBe("Telefonata: Bar Roma (Mario)");
        expect(e.description).toBe("Telefono: +393331112233\nCittà: Milano\nChiama: Alessandro\nScheda: https://x/admin/lead/v1");
        expect(e.start).toEqual({ dateTime: "2026-10-08T15:45:00.000Z", timeZone: "Europe/Rome" });
        expect(e.extendedProperties).toEqual({ private: { crm_appointment_id: "ap-1" } });
        expect(e).not.toHaveProperty("attendees");
    });
});

describe("parseCalendarEvents", () => {
    const dayStart = (day: string) => `${day}T00:00:00+02:00`;
    it("tiene gli impegni veri e scarta liberi e annullati", () => {
        const busy = parseCalendarEvents(
            [
                { summary: "Dentista", start: { dateTime: "2026-10-08T09:00:00+02:00" }, end: { dateTime: "2026-10-08T10:00:00+02:00" } },
                { summary: "Libero", transparency: "transparent", start: { dateTime: "2026-10-08T11:00:00+02:00" }, end: { dateTime: "2026-10-08T12:00:00+02:00" } },
                { status: "cancelled", start: { dateTime: "2026-10-08T13:00:00+02:00" }, end: { dateTime: "2026-10-08T14:00:00+02:00" } },
                { summary: "Ferie", start: { date: "2026-10-09" }, end: { date: "2026-10-10" } },
                {
                    summary: "Telefonata: Bar",
                    start: { dateTime: "2026-10-08T17:30:00+02:00" },
                    end: { dateTime: "2026-10-08T17:40:00+02:00" },
                    extendedProperties: { private: { crm_appointment_id: "ap-9" } }
                },
                { start: {}, end: {} },
                "spazzatura"
            ],
            dayStart
        );
        expect(busy.map(b => b.label)).toEqual(["Dentista", "Ferie", "Telefonata: Bar"]);
        expect(busy[0]).toMatchObject({ start: "2026-10-08T07:00:00.000Z", end: "2026-10-08T08:00:00.000Z", appointmentId: null });
        expect(busy[1]).toMatchObject({ start: "2026-10-08T22:00:00.000Z", end: "2026-10-09T22:00:00.000Z" });
        expect(busy[2].appointmentId).toBe("ap-9");
    });

    it("senza titolo: «Impegno»", () => {
        const [b] = parseCalendarEvents(
            [{ start: { dateTime: "2026-10-08T09:00:00Z" }, end: { dateTime: "2026-10-08T10:00:00Z" } }],
            dayStart
        );
        expect(b.label).toBe("Impegno");
    });
});

describe("chiamate", () => {
    it("insertEvent restituisce l'id", async () => {
        let url = "";
        const id = await insertEvent("t", "cal@group.calendar.google.com", {}, (async (u: string) => {
            url = u;
            return jsonResponse(200, { id: "ev1" });
        }) as unknown as typeof fetch);
        expect(id).toBe("ev1");
        expect(url).toContain("/calendars/cal%40group.calendar.google.com/events");
    });

    it("deleteEvent: già tolto conta come riuscito, il resto no", async () => {
        await expect(deleteEvent("t", "c", "e", (async () => jsonResponse(410, {})) as unknown as typeof fetch)).resolves.toBeUndefined();
        await expect(deleteEvent("t", "c", "e", (async () => jsonResponse(204, null)) as unknown as typeof fetch)).resolves.toBeUndefined();
        await expect(
            deleteEvent("t", "c", "e", (async () => jsonResponse(403, { error: { message: "no" } })) as unknown as typeof fetch)
        ).rejects.toThrow("Google Calendar 403: no");
    });
});
