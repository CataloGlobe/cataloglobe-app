import { describe, expect, it } from "vitest";
import { navSidebarGroups } from "@/components/layout/Sidebar/navSidebarGroups";
import { NAV_MODELS } from "@/utils/navModel";

const B = "b1";
const items = (chosenActivityId: string | null, activityId: string | null = null) =>
    navSidebarGroups(NAV_MODELS.azienda, { businessId: B, activityId, chosenActivityId, catalogLabel: "Menù" })
        .groups.flatMap(g => g.items);
const item = (list: ReturnType<typeof items>, id: string) => list.find(i => i.id === id)!;

describe("la sede scelta in alto resta passando di sezione (D152)", () => {
    it("Andamento e Recensioni vanno nella sede scelta dal Calendario dell'azienda", () => {
        const list = items("s1");
        expect(item(list, "analytics").to).toBe(`/business/${B}/locations/s1/analitiche`);
        expect(item(list, "reviews").to).toBe(`/business/${B}/locations/s1/recensioni`);
        // la voce resta accesa anche sul totale dell'azienda
        expect(item(list, "analytics").matchPrefixes).toEqual([`/business/${B}/analytics`]);
    });

    it("Calendario e Regole restano la pagina dell'azienda", () => {
        const list = items("s1");
        expect(item(list, "calendario").to).toBe(`/business/${B}/scheduling?vista=calendario`);
        expect(item(list, "scheduling").to).toBe(`/business/${B}/scheduling`);
    });

    it("senza scelta, o con «Tutte», il totale; la sede dell'indirizzo vince", () => {
        expect(item(items(null), "analytics").to).toBe(`/business/${B}/analytics`);
        expect(item(items("s1", "s2"), "analytics").to).toBe(`/business/${B}/locations/s2/analitiche`);
    });
});
