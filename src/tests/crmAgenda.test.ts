import { describe, expect, it } from "vitest";
import {
    callDraftFrom,
    callDraftOverlaps,
    callDraftStart,
    callDraftWarnings,
    callTemplateError,
    crmAgendaErrorMessage,
    describeCallEvent,
    describeCallTime,
    describeCallWindows,
    describeLeadMessages,
    validateCallDraft,
    windowsFromDraft
} from "@/utils/crm/agenda";
import { DEFAULT_CALL_WINDOWS, romeWallClock } from "@shared/crmCallSlots";

const NOW = romeWallClock(2026, 10, 5, 8, 0); // lunedì
const settings = { call_windows: DEFAULT_CALL_WINDOWS, call_min_notice_minutes: 60 };

describe("bozza della telefonata", () => {
    it("da una telefonata esistente", () => {
        const draft = callDraftFrom(
            { starts_at: "2026-10-08T15:45:00.000Z", ends_at: "2026-10-08T16:00:00.000Z", caller_user_id: "u2", note: "x" },
            { durationMinutes: 10, callerUserId: "u1" }
        );
        expect(draft).toEqual({ day: "2026-10-08", time: "17:45", duration: "15", callerUserId: "u2", note: "x" });
    });

    it("nuova, con i default", () => {
        expect(callDraftFrom(null, { durationMinutes: 10, callerUserId: "u1" })).toEqual({
            day: "",
            time: "",
            duration: "10",
            callerUserId: "u1",
            note: ""
        });
    });

    it("istante di Roma, cambio dell'ora compreso", () => {
        expect(callDraftStart({ day: "2026-10-08", time: "17:45" })?.toISOString()).toBe("2026-10-08T15:45:00.000Z");
        expect(callDraftStart({ day: "2026-12-08", time: "17:45" })?.toISOString()).toBe("2026-12-08T16:45:00.000Z");
        expect(callDraftStart({ day: "2027-03-28", time: "02:30" })).toBeNull();
        expect(callDraftStart({ day: "", time: "17:45" })).toBeNull();
    });

    it("validazione", () => {
        const ok = { day: "2026-10-05", time: "09:30", duration: "10", callerUserId: "u1", note: "" };
        expect(validateCallDraft(ok, NOW)).toEqual({});
        expect(validateCallDraft({ ...ok, time: "07:30" }, NOW).time).toBe("L'orario è già passato.");
        expect(validateCallDraft({ ...ok, duration: "3" }, NOW).duration).toBeDefined();
        expect(validateCallDraft({ ...ok, duration: "12.5" }, NOW).duration).toBeDefined();
        expect(validateCallDraft({ ...ok, callerUserId: "" }, NOW).callerUserId).toBeDefined();
        expect(validateCallDraft({ ...ok, day: "" }, NOW).day).toBeDefined();
    });

    it("avvisi: fuori fascia e poco preavviso, senza bloccare", () => {
        const draft = { day: "2026-10-05", time: "08:30", duration: "10", callerUserId: "u1", note: "" };
        const warnings = callDraftWarnings(draft, settings, NOW);
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("lun-ven 09:00-11:00, lun-ven 17:30-18:30");
        expect(callDraftWarnings({ ...draft, time: "09:30" }, settings, NOW)).toEqual([]);
    });

    it("accavallamenti, esclusa la telefonata che si sposta", () => {
        const busy = [
            { start: "2026-10-05T07:30:00.000Z", end: "2026-10-05T07:45:00.000Z", label: "Dentista", appointment_id: null, caller_user_id: null },
            { start: "2026-10-05T07:30:00.000Z", end: "2026-10-05T07:40:00.000Z", label: "Telefonata: Bar", appointment_id: "a1", caller_user_id: "u1" }
        ];
        const draft = { day: "2026-10-05", time: "09:35", duration: "10", callerUserId: "u1", note: "" };
        expect(callDraftOverlaps(draft, busy, null).map(b => b.label)).toEqual(["Dentista", "Telefonata: Bar"]);
        expect(callDraftOverlaps(draft, busy, "a1").map(b => b.label)).toEqual(["Dentista"]);
        expect(callDraftOverlaps({ ...draft, time: "09:45" }, busy, null)).toEqual([]);
    });
});

describe("parole", () => {
    it("orario della telefonata", () => {
        expect(describeCallTime({ starts_at: "2026-10-08T15:45:00.000Z", ends_at: "2026-10-08T15:55:00.000Z" })).toBe(
            "giovedì 8 alle 17:45, 10 minuti"
        );
    });

    it("messaggi al lead", () => {
        const a = { starts_at: "2026-10-08T15:45:00.000Z", time_set_at: "2026-10-05T08:00:00.000Z", status: "confirmed" as const, reminder_queued_at: null };
        const on = { call_confirm_message: "x", call_reminder_message: "y" };
        expect(describeLeadMessages(a, on)).toBe("Conferma al lead su WhatsApp. Promemoria mercoledì 7 alle 18:00.");
        expect(describeLeadMessages({ ...a, time_set_at: "2026-10-07T17:00:00.000Z" }, on)).toContain("Niente promemoria");
        expect(describeLeadMessages(a, { call_confirm_message: null, call_reminder_message: null })).toBe(
            "Conferma spenta (testo non impostato). Promemoria spento (testo non impostato)."
        );
        expect(describeLeadMessages({ ...a, status: "proposed" }, on)).toContain("chi chiama dice sì");
    });

    it("errori per codice", () => {
        expect(crmAgendaErrorMessage({ code: "CL001" })).toContain("un'altra telefonata");
        expect(crmAgendaErrorMessage({ code: "CL002" })).toContain("già una telefonata");
        expect(crmAgendaErrorMessage(new Error("invalid_duration"))).toBe("La durata va da 5 a 120 minuti.");
        expect(crmAgendaErrorMessage(null)).toBe("Qualcosa non ha funzionato. Riprova.");
    });
});

describe("impostazioni", () => {
    it("fasce descritte", () => {
        expect(describeCallWindows(DEFAULT_CALL_WINDOWS)).toBe("lun-ven 09:00-11:00, lun-ven 17:30-18:30");
        expect(describeCallWindows([{ days: [1, 3], start: "10:00", end: "11:00" }])).toBe("lun, mer 10:00-11:00");
        expect(describeCallWindows([])).toBe("nessuna fascia");
    });

    it("fasce dalla bozza", () => {
        expect(windowsFromDraft([{ days: [5, 1], start: "09:00", end: "10:00" }])).toEqual({
            ok: true,
            value: [{ days: [1, 5], start: "09:00", end: "10:00" }]
        });
        expect(windowsFromDraft([{ days: [], start: "09:00", end: "10:00" }]).ok).toBe(false);
        expect(windowsFromDraft([{ days: [1], start: "10:00", end: "09:00" }]).ok).toBe(false);
        expect(windowsFromDraft([])).toEqual({ ok: true, value: [] });
    });

    it("testi al lead", () => {
        expect(callTemplateError("")).toBeNull();
        expect(callTemplateError("Ciao {nome}, ti chiamo {giorno} alle {ora}. {mittente} di {locale}")).toBeNull();
        expect(callTemplateError("Ciao {cliente}")).toBe("Segnaposto sconosciuto: {cliente}.");
        expect(callTemplateError("x".repeat(1001))).toBe("Al massimo 1000 caratteri.");
    });
});

describe("storia della scheda", () => {
    const name = (id: string | null) => (id === "u1" ? "Alessandro" : id === "u2" ? "Lorenzo" : "—");
    it("una riga per evento", () => {
        expect(describeCallEvent("call_scheduled", { starts_at: "2026-10-08T15:45:00Z", caller: "u2", status: "proposed" }, name)).toBe(
            "giovedì 8 alle 17:45, chiama Lorenzo, da confermare"
        );
        expect(
            describeCallEvent("call_moved", { from: "2026-10-08T15:45:00Z", starts_at: "2026-10-09T07:00:00Z", caller: "u1", caller_from: "u1" }, name)
        ).toBe("Da giovedì 8 alle 17:45 a venerdì 9 alle 09:00");
        expect(describeCallEvent("call_cancelled", { starts_at: "2026-10-08T15:45:00Z", reason: "Malato" }, name)).toBe(
            "giovedì 8 alle 17:45: Malato"
        );
        expect(describeCallEvent("call_outcome", { starts_at: "2026-10-08T15:45:00Z", outcome: "no_show" }, name)).toBe(
            "giovedì 8 alle 17:45: non ha risposto"
        );
    });
});
