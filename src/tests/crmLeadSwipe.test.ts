import { describe, expect, it } from "vitest";
import type { CrmAgentDraftRow, CrmNextStep } from "@/types/crm";
import { openDraftByVenue, snoozeDueOn, snoozeStepText, snoozedVenueIds, swipeOutcome, swipeThreshold } from "@/utils/crm/leadSwipe";

const draft = (id: string, venue: string, status: string, at: string) =>
    ({ id, venue_id: venue, status, created_at: at }) as unknown as CrmAgentDraftRow;
const step = (venue: string, due: string | null, text = "Chiamare", snoozed = true) =>
    ({ venue_id: venue, step: text, due_on: due, owner_user_id: null, set_by: "u", set_at: "", snoozed }) as CrmNextStep;

describe("gesti della lista lead", () => {
    it("vale oltre un terzo della riga, almeno 80 px", () => {
        expect(swipeThreshold(150)).toBe(80);
        expect(swipeThreshold(375)).toBe(125);
        expect(swipeOutcome(130, 375, true)).toBe("send");
        expect(swipeOutcome(130, 375, false)).toBeNull();
        expect(swipeOutcome(-130, 375, false)).toBe("snooze");
        expect(swipeOutcome(-60, 375, true)).toBeNull();
    });

    it("prende la bozza aperta più vecchia di ogni locale", () => {
        const map = openDraftByVenue([
            draft("b", "v1", "pending", "2026-10-05T10:00:00Z"),
            draft("a", "v1", "pending", "2026-10-05T09:00:00Z"),
            draft("c", "v2", "sent", "2026-10-05T09:00:00Z")
        ]);
        expect(map.get("v1")).toBe("a");
        expect(map.has("v2")).toBe(false);
    });

    it("rimandati fino al giorno del passo", () => {
        const ids = snoozedVenueIds(
            [step("v1", "2026-10-06"), step("v2", "2026-10-05"), step("v3", null), step("v4", "2026-10-06", "Chiamare", false)],
            "2026-10-05"
        );
        expect([...ids]).toEqual(["v1"]);
        expect(snoozeStepText(step("v1", null, "  "))).toBe("Riprendere il lead");
        expect(snoozeStepText(step("v1", null, "Mandare il menù"))).toBe("Mandare il menù");
        expect(snoozeStepText(undefined)).toBe("Riprendere il lead");
        expect(snoozeDueOn(undefined, "2026-10-06")).toBe("2026-10-06");
        expect(snoozeDueOn(step("v1", "2026-10-09"), "2026-10-06")).toBe("2026-10-09");
        expect(snoozeDueOn(step("v1", "2026-10-05"), "2026-10-06")).toBe("2026-10-06");
    });
});
