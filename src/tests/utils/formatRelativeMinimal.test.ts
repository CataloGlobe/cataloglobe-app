import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatRelativeMinimal } from "@/components/PublicCollectionView/OrderingSheet/formatRelativeMinimal";

const t = ((key: string, opts?: { count?: number }) =>
    opts?.count !== undefined ? `${key}:${opts.count}` : key) as unknown as TFunction;

const SENT = "2026-10-09T10:00:00Z";
const at = (min: number) => new Date(SENT).getTime() + min * 60_000;

describe("formatRelativeMinimal", () => {
    it("usa il `now` passato, non l'orologio", () => {
        expect(formatRelativeMinimal(SENT, t, at(0))).toBe("ordering.time_now");
        expect(formatRelativeMinimal(SENT, t, at(5))).toBe("ordering.time_min_ago:5");
    });

    it("lo stesso ordine cambia scritta quando `now` avanza (il tick)", () => {
        expect(formatRelativeMinimal(SENT, t, at(1))).toBe("ordering.time_min_ago:1");
        expect(formatRelativeMinimal(SENT, t, at(2))).toBe("ordering.time_min_ago:2");
    });

    it("passa alle ore dopo 60 minuti e alla data dopo 24 ore", () => {
        expect(formatRelativeMinimal(SENT, t, at(59))).toBe("ordering.time_min_ago:59");
        expect(formatRelativeMinimal(SENT, t, at(60))).toBe("ordering.time_hour_ago:1");
        expect(formatRelativeMinimal(SENT, t, at(24 * 60))).toMatch(/^\d{2}\/\d{2}, \d{2}:\d{2}$/);
    });
});
