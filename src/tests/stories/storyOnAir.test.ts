import { describe, expect, it } from "vitest";
import { describeStoryOnAir, storyAbout, type AppearanceActivity } from "@/utils/ruleAppearance";

const centro: AppearanceActivity = { id: "c", name: "Centro", status: "active" };
const lago: AppearanceActivity = { id: "l", name: "Lago", status: "inactive" };
const story = (extra: Partial<{ status: string; activity_id: string | null; product_id: string | null; product: { name: string } | null }> = {}) => ({
    status: "published",
    activity_id: null,
    product_id: null,
    product: null,
    ...extra
});

describe("elenco Storie: di cosa parla (punto 18)", () => {
    it("un prodotto: il suo nome", () => {
        expect(storyAbout(story({ product_id: "p", product: { name: "Carbonara" } }), [centro, lago])).toEqual({ kind: "product", label: "Carbonara" });
    });
    it("il prodotto vince sulla sede, e se non c'è più lo dice", () => {
        expect(storyAbout(story({ product_id: "p", activity_id: "c" }), [centro, lago])).toEqual({ kind: "product", label: "Un prodotto che non c'è più" });
    });
    it("il locale: con più sedi dice quale", () => {
        expect(storyAbout(story({ activity_id: "c" }), [centro, lago]).label).toBe("Il locale · Centro");
        expect(storyAbout(story(), [centro, lago]).label).toBe("Il locale · tutte le sedi");
        expect(storyAbout(story({ activity_id: "x" }), [centro, lago]).label).toBe("Il locale · una sede che non c'è più");
    });
    it("con una sede sola: «Il locale»", () => {
        expect(storyAbout(story({ activity_id: "c" }), [centro]).label).toBe("Il locale");
        expect(storyAbout(story(), [centro]).label).toBe("Il locale");
    });
});

describe("elenco Storie: se è in onda (punto 18)", () => {
    it("bozza: pronta, non in onda", () => {
        expect(describeStoryOnAir(story({ status: "draft" }), [centro], false, null)).toEqual({ state: "off", label: "Pronta, non in onda", tone: "neutral" });
    });
    it("pubblicata: in onda", () => {
        expect(describeStoryOnAir(story(), [centro], false, null)).toEqual({ state: "on", label: "In onda", tone: "success" });
    });
    it("il prodotto non è in nessun menù in onda: nessuno la vede", () => {
        const r = describeStoryOnAir(story({ product_id: "p" }), [centro], false, false);
        expect(r.state).toBe("unseen");
        expect(r.label).toBe("In onda, ma nessuno la vede");
        expect(r.tone).toBe("warning");
    });
    it("se dei menù non si sa, per il prodotto non si dice niente", () => {
        expect(describeStoryOnAir(story({ product_id: "p" }), [centro], false, null).state).toBe("on");
        expect(describeStoryOnAir(story({ product_id: "p" }), [centro], false, true).state).toBe("on");
    });
    it("sede sospesa o abbonamento fermo: nessuno la vede, col perché", () => {
        expect(describeStoryOnAir(story({ activity_id: "l" }), [centro, lago], false, null)).toMatchObject({ state: "unseen", why: "Da nessuna parte: Lago è sospesa" });
        expect(describeStoryOnAir(story(), [centro], true, null)).toMatchObject({ state: "unseen", why: "Da nessuna parte: abbonamento non attivo" });
    });
});
