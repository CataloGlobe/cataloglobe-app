import { describe, expect, it } from "vitest";
import { groupSupportQueue, matchesSupportFilter, supportFilterCounts, supportWaitIsLate } from "@/utils/supportQueue";

const NOW = new Date("2026-10-05T13:00:00Z");
type T = { id: string; status: "open" | "in_progress" | "closed"; last_message_kind: "customer" | "platform" | null; last_message_at: string };
const t = (id: string, status: T["status"], kind: T["last_message_kind"], at = "2026-10-05T12:00:00Z"): T => ({
    id,
    status,
    last_message_kind: kind,
    last_message_at: at
});
const ALL = [t("a", "open", "customer"), t("b", "in_progress", "platform"), t("c", "closed", "customer"), t("d", "in_progress", "customer")];

describe("coda di supporto (R5)", () => {
    it("i conteggi dei chip", () => {
        expect(supportFilterCounts(ALL)).toEqual({ da_gestire: 3, aspettano_voi: 2, open: 1, in_progress: 2, closed: 1, all: 4 });
    });

    it("una chiusa non aspetta mai voi, anche se l'ultima parola è del cliente", () => {
        expect(matchesSupportFilter(ALL[2], "aspettano_voi")).toBe(false);
    });

    it("«Aspettano voi» sopra, il resto sotto col nome giusto", () => {
        const open = ALL.filter(x => matchesSupportFilter(x, "da_gestire"));
        expect(groupSupportQueue(open, "da_gestire").map(g => [g.title, g.tickets.map(x => x.id)])).toEqual([
            ["Aspettano voi", ["a", "d"]],
            ["Aspettano il cliente", ["b"]]
        ]);
        expect(groupSupportQueue(ALL, "all")[1].title).toBe("Le altre");
    });

    it("in ritardo oltre le 4 ore, solo se tocca a voi", () => {
        expect(supportWaitIsLate(t("x", "open", "customer", "2026-10-05T08:00:00Z"), NOW)).toBe(true);
        expect(supportWaitIsLate(t("x", "open", "customer"), NOW)).toBe(false);
        expect(supportWaitIsLate(t("x", "open", "platform", "2026-10-05T08:00:00Z"), NOW)).toBe(false);
    });
});
