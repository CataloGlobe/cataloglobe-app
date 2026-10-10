import { describe, expect, it } from "vitest";
import { asEdit, asInside, blocker, changed, changedSteps, firstBlock, isDirty, lit, newTunnel, stepFrom, stepLabel, steps, strays, tunnelTitle, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { aspectOf, styleTokens } from "@/pages/Dashboard/Crea/creaStyle";

// Modificare una cosa già creata nel tunnel (D140): il passo 0, i passi viola e
// grigi, «Avanti» solo fra quelli scelti, si salva solo quello che è cambiato.

const ALL = { all: true, activityIds: [], groupIds: [] };
const OWNER = { owner: true, multi: true };

function menu(rule: string | null = "r1"): Tunnel {
    const t = newTunnel("menu", ALL);
    t.menuType = "classico";
    t.name = "Pranzo";
    t.sections = [{ key: "a", id: "c1", sort: 0, name: "Primi", dishes: [{ key: "b", linkId: "l1", sort: 0, productId: "p1", name: "Risotto", price: 12 }] }];
    return asEdit(t, "m1", { id: rule, count: rule ? 1 : 0 });
}
const upd = (t: Tunnel, fn: (x: Tunnel) => void) => {
    const n = structuredClone(t);
    fn(n);
    return n;
};

describe("modifica nel tunnel: i passi", () => {
    it("il passo 0, poi solo i passi che cambiano la cosa, poi Controlla", () => {
        expect(steps(menu(), OWNER)).toEqual(["modifica", "parti", "sezioni", "dove", "controlla"]);
        expect(stepLabel(menu(), "parti")).toBe("Il nome");
        expect(tunnelTitle(menu())).toBe("Modifica il menù · Pranzo");
    });

    it("il «Dove e quando» c'è solo se nel Calendario ha una voce sola, e solo per chi lo gestisce", () => {
        expect(steps(menu(null), OWNER)).toEqual(["modifica", "parti", "sezioni", "controlla"]);
        expect(steps(menu(), { owner: false, multi: true })).toEqual(["modifica", "parti", "sezioni", "controlla"]);
        expect(steps(menu(), { owner: true, multi: false })).toContain("quando");
    });

    it("appena aperto non c'è niente da perdere e niente da salvare", () => {
        const t = menu();
        expect(isDirty(t)).toBe(false);
        expect(changedSteps(t, OWNER)).toEqual([]);
        expect(blocker(t, "modifica", OWNER)).toBe("Scegli almeno una cosa");
    });
});

describe("modifica nel tunnel: viola e grigi", () => {
    it("«Avanti» e «Indietro» si fermano solo sui passi scelti", () => {
        const t = upd(menu(), x => void x.edit!.picked.push("sezioni"));
        expect(lit(t, "sezioni")).toBe(true);
        expect(lit(t, "parti")).toBe(false);
        expect(stepFrom(t, OWNER, 0, 1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, 1)).toBe(4);
        expect(stepFrom(t, OWNER, 4, -1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, -1)).toBe(0);
    });

    it("un passo grigio in cui cambi qualcosa diventa viola, e Controlla chiede di guardarlo", () => {
        const t = upd(upd(menu(), x => void x.edit!.picked.push("sezioni")), x => void (x.name = "Pranzo veloce"));
        expect(changed(t, "parti")).toBe(true);
        expect(lit(t, "parti")).toBe(true);
        expect(strays(t, OWNER)).toEqual(["parti"]);
        expect(stepFrom(t, OWNER, 0, 1)).toBe(1);
        expect(isDirty(t)).toBe(true);
    });

    it("dal clic sulla riga si è già dentro: un passo alla volta finché non scegli niente", () => {
        const t = asInside(menu());
        expect(t.i).toBe(1);
        expect(stepFrom(t, OWNER, 1, 1)).toBe(2);
        expect(stepFrom(t, OWNER, 2, -1)).toBe(1);
        expect(lit(upd(t, x => void (x.name = "Altro")), "parti")).toBe(true);
        expect(stepFrom(upd(t, x => void x.edit!.picked.push("sezioni")), OWNER, 0, 1)).toBe(2);
    });

    it("rimettere com'era non conta come modifica", () => {
        const t = upd(upd(menu(), x => void (x.name = "Altro")), x => void (x.name = "Pranzo "));
        expect(changed(t, "parti")).toBe(false);
    });

    it("togliere un piatto o aggiungerne uno cambia «Sezioni e piatti»", () => {
        expect(changed(upd(menu(), x => void x.sections[0].dishes.pop()), "sezioni")).toBe(true);
        expect(changed(upd(menu(), x => void x.sections[0].dishes.push({ key: "n", productId: "p2", name: "Lasagne", price: 10 })), "sezioni")).toBe(true);
    });

    it("ferma il salvataggio solo quello che manca in un passo cambiato", () => {
        // un menù senza piatti si può rinominare: le sezioni non le ha toccate
        const empty = upd(menu(), x => void (x.edit!.orig.sections = x.sections = []));
        expect(firstBlock(upd(empty, x => void (x.name = "Cena")), OWNER)).toBeNull();
        expect(firstBlock(upd(menu(), x => void (x.name = " ")), OWNER)).toEqual({ i: 1, why: "Manca il nome del menù" });
    });
});

describe("modifica nel tunnel: lo stile", () => {
    it("le scelte non toccate lasciano i token com'erano", () => {
        const base = structuredClone(DEFAULT_STYLE_TOKENS);
        base.card.productStyle = "compact";
        base.card.image.mode = "hide";
        const t = newTunnel("stile", ALL);
        Object.assign(t, aspectOf(base), { color: base.colors.primary });
        expect(styleTokens(t, base)).toEqual(base);
        expect(styleTokens({ ...t, card: "foto" }, base).card.productStyle).toBe("card");
    });
});
