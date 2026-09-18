import { describe, expect, it } from "vitest";

import { visibleClosures } from "@/components/PublicCollectionView/PublicOpeningHours/visibleClosures";
import type { UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

// FASE 5.5 — la finestra dei DATI parte da ieri; la lista MOSTRATA da oggi.

function closure(closure_date: string, end_date: string | null = null): UpcomingClosure {
    return { closure_date, end_date, label: null, is_closed: true, slots: null };
}

describe("visibleClosures", () => {
    it("la chiusura di ieri non è una «prossima chiusura»", () => {
        const list = [closure("2026-09-17"), closure("2026-09-18"), closure("2026-09-20")];
        expect(visibleClosures(list, "2026-09-18").map(c => c.closure_date)).toEqual(["2026-09-18", "2026-09-20"]);
    });

    it("un intervallo iniziato ieri che finisce oggi o dopo resta visibile", () => {
        expect(visibleClosures([closure("2026-09-17", "2026-09-18")], "2026-09-18")).toHaveLength(1);
        expect(visibleClosures([closure("2026-09-10", "2026-09-17")], "2026-09-18")).toHaveLength(0);
    });
});
