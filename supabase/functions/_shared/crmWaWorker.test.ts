import { describe, expect, it } from "vitest";
import {
    buildChannelAlert,
    buildInboundAlert,
    isFromMe,
    parsePrePlainText,
    parseSnapshotBatch,
    parseSnapshotChat,
    phoneFromWaId,
    romeWallClockToIso,
    WA_MAX_CHATS,
    WA_MAX_MESSAGES
} from "./crmWaWorker";

describe("phoneFromWaId / isFromMe", () => {
    it("legge il numero delle chat private", () => {
        expect(phoneFromWaId("false_393331112222@c.us_3EB0ABC")).toBe("+393331112222");
        expect(phoneFromWaId("true_393331112222@c.us_3EB0ABC")).toBe("+393331112222");
    });
    it("scarta gruppi e id anonimi", () => {
        expect(phoneFromWaId("false_120363000000@g.us_ABC_39333")).toBeNull();
        expect(phoneFromWaId("false_123456789012@lid_ABC")).toBeNull();
        expect(phoneFromWaId("qualcosa")).toBeNull();
    });
    it("chi ha scritto", () => {
        expect(isFromMe("true_39333@c.us_A")).toBe(true);
        expect(isFromMe("false_39333@c.us_A")).toBe(false);
        expect(isFromMe("39333@c.us_A")).toBeNull();
    });
});

describe("ora di Roma", () => {
    it("ora legale e solare", () => {
        expect(romeWallClockToIso(2026, 10, 5, 10, 32)).toBe("2026-10-05T08:32:00.000Z");
        expect(romeWallClockToIso(2026, 12, 1, 10, 32)).toBe("2026-12-01T09:32:00.000Z");
    });
    it("a cavallo del cambio d'ora", () => {
        expect(romeWallClockToIso(2026, 10, 25, 1, 30)).toBe("2026-10-24T23:30:00.000Z");
        expect(romeWallClockToIso(2026, 10, 25, 4, 0)).toBe("2026-10-25T03:00:00.000Z");
    });
    it("data-pre-plain-text", () => {
        expect(parsePrePlainText("[10:32, 5/10/2026] Anna: ")).toBe("2026-10-05T08:32:00.000Z");
        expect(parsePrePlainText("[9:05, 01/12/2026] +39 333 111 2222: ")).toBe("2026-12-01T08:05:00.000Z");
        expect(parsePrePlainText("[25:00, 5/10/2026] Anna: ")).toBeNull();
        expect(parsePrePlainText("Anna")).toBeNull();
        expect(parsePrePlainText(null)).toBeNull();
    });
});

describe("parseSnapshotChat", () => {
    it("ricava telefono e autore dal data-id, pulisce i campi", () => {
        const r = parseSnapshotChat({
            messages: [
                { id: "false_393331112222@c.us_A", text: "  Ciao  ", at: "2026-10-05T08:00:00Z" },
                { id: "true_393331112222@c.us_B", kind: "voice" },
                { id: "false_393331112222@c.us_C", kind: "gif", text: "" },
                { text: "senza id" },
                "rumore"
            ]
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.phone).toBe("+393331112222");
        expect(r.value.messages).toEqual([
            { id: "false_393331112222@c.us_A", from_me: false, kind: "text", text: "Ciao", at: "2026-10-05T08:00:00.000Z" },
            { id: "true_393331112222@c.us_B", from_me: true, kind: "voice", text: null, at: null },
            { id: "false_393331112222@c.us_C", from_me: false, kind: "other", text: null, at: null }
        ]);
    });
    it("from_me esplicito vince sul data-id", () => {
        const r = parseSnapshotChat({ phone: "+393331112222", messages: [{ id: "x", from_me: true }] });
        expect(r.ok && r.value.messages[0].from_me).toBe(true);
    });
    it("rifiuta telefono non valido e troppi messaggi", () => {
        expect(parseSnapshotChat({ phone: "333", messages: [] })).toEqual({ ok: false, error: "invalid_phone" });
        expect(parseSnapshotChat({ messages: [] })).toEqual({ ok: false, error: "invalid_phone" });
        expect(parseSnapshotChat({ phone: "+393331112222" })).toEqual({ ok: false, error: "invalid_messages" });
        const many = Array.from({ length: WA_MAX_MESSAGES + 1 }, (_, i) => ({ id: `false_39333@c.us_${i}` }));
        expect(parseSnapshotChat({ phone: "+393331112222", messages: many })).toEqual({ ok: false, error: "too_many_messages" });
    });
    it("tronca testo lunghissimo", () => {
        const r = parseSnapshotChat({ phone: "+393331112222", messages: [{ id: "false_1", text: "a".repeat(5000) }] });
        expect(r.ok && r.value.messages[0].text?.length).toBe(4000);
    });
    it("lotto: limite di chat e primo errore", () => {
        expect(parseSnapshotBatch({})).toEqual({ ok: false, error: "invalid_chats" });
        expect(parseSnapshotBatch({ chats: Array(WA_MAX_CHATS + 1).fill({}) })).toEqual({ ok: false, error: "too_many_chats" });
        expect(parseSnapshotBatch({ chats: [{ phone: "+393331112222", messages: [] }, { phone: "x", messages: [] }] }))
            .toEqual({ ok: false, error: "invalid_phone" });
    });
});

describe("testi Telegram", () => {
    it("messaggi del lead, con vocali e HTML escapato", () => {
        const text = buildInboundAlert({
            contactName: "Anna <b>",
            venueName: "Bar & Co",
            messages: [{ kind: "text", body: "Sì, domani" }, { kind: "voice", body: null }, { kind: "image", body: "menu" }],
            adminUrl: "https://example.com/admin/lead/1"
        });
        expect(text).toContain("<b>Anna &lt;b&gt;</b> (Bar &amp; Co) ha scritto su WhatsApp:");
        expect(text).toContain("• «Sì, domani»");
        expect(text).toContain("• un vocale, da ascoltare su WhatsApp");
        expect(text).toContain("• una foto, da guardare su WhatsApp: «menu»");
        expect(text).toContain('<a href="https://example.com/admin/lead/1">Apri nel CRM</a>');
    });
    it("senza nome e senza link", () => {
        const text = buildInboundAlert({ contactName: null, venueName: "Locale", messages: [{ kind: "text", body: "x".repeat(700) }], adminUrl: null });
        expect(text.startsWith("💬 <b>Il lead</b>")).toBe(true);
        expect(text).toContain("…»");
        expect(text).not.toContain("Apri nel CRM");
    });
    it("avvisi del canale", () => {
        expect(buildChannelAlert("needs_relink")).toContain("QR");
        expect(buildChannelAlert("warning", "Telefono <offline>")).toContain("«Telefono &lt;offline&gt;»");
        expect(buildChannelAlert("warning")).toContain("un avviso.");
        expect(buildChannelAlert("silent")).toContain("15 minuti");
        expect(buildChannelAlert("failures")).toContain("Tre invii");
    });
});
