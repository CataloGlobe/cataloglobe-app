import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { blocker, effWhen, firstBlock, isDirty, kindOfSlug, newTunnel, steps, tunnelTitle, whenProblem, withAside, type FromMenu } from "@/pages/Dashboard/Crea/creaModel";
import { aspectOf, DARK_BG, isDarkHex, LIGHT_BG, sampleOf, styleTokens } from "@/pages/Dashboard/Crea/creaStyle";

// I tunnel di creazione (D124): i passi, cosa ferma «Avanti», la bozza del
// Calendario e lo stile fatto con le quattro scelte.

const ALL = { all: true, activityIds: [], groupIds: [] };
const OWNER = { owner: true, multi: true };

describe("tunnel di creazione: i passi", () => {
    it("ogni tipo ha i suoi passi, poi «Dove e quando» e Controlla (D134, D145)", () => {
        expect(steps(newTunnel("menu", ALL), OWNER)).toEqual(["tipo", "parti", "sezioni", "dove", "controlla"]);
        expect(steps(newTunnel("stile", ALL), OWNER)).toEqual(["serve", "nome", "aspetto", "dove", "controlla"]);
        expect(steps(newTunnel("storia", ALL), OWNER)).toEqual(["serve", "racconto", "blocchi", "dove", "controlla"]);
        const ev = newTunnel("evid", ALL);
        expect(steps(ev, OWNER)).toEqual(["cosa", "contenuto", "dove", "controlla"]);
        expect(steps({ ...ev, evType: "promo" }, OWNER)).toContain("piatti");
        expect(steps({ ...ev, evType: "bundle" }, OWNER)).toContain("piatti");
        expect(steps({ ...ev, evType: "evento" }, OWNER)).not.toContain("piatti");
    });

    it("chi non gestisce il Calendario non ha Dove e quando; con una sede sola solo il Quando", () => {
        expect(steps(newTunnel("menu", ALL), { owner: false, multi: true })).toEqual(["tipo", "parti", "sezioni", "controlla"]);
        expect(steps(newTunnel("menu", ALL), { owner: true, multi: false })).toEqual(["tipo", "parti", "sezioni", "quando", "controlla"]);
    });

    it("gli indirizzi: /crea/evidenza è il contenuto in evidenza, il resto non esiste", () => {
        expect(kindOfSlug("evidenza")).toBe("evid");
        expect(kindOfSlug("menu")).toBe("menu");
        expect(kindOfSlug("evid")).toBeNull();
        expect(kindOfSlug(undefined)).toBeNull();
    });
});

describe("tunnel di creazione: cosa ferma «Avanti»", () => {
    it("il menù: il tipo, il nome (non solo spazi), almeno un piatto", () => {
        const t = newTunnel("menu", ALL);
        expect(firstBlock(t, OWNER)).toEqual({ i: 0, why: "Scegli che menù è" });
        expect(firstBlock({ ...t, menuType: "classico", name: "   " }, OWNER)).toEqual({ i: 1, why: "Manca il nome del menù" });
        const named = { ...t, menuType: "classico" as const, name: "Pranzo" };
        expect(firstBlock(named, OWNER)).toEqual({ i: 2, why: "Aggiungi almeno un piatto" });
        expect(firstBlock({ ...named, source: "foto" }, OWNER)?.why).toBe("Carica la foto o il PDF del menù");
        const dish = { key: "d", productId: null, name: "Capricciosa", price: 9.5 };
        expect(firstBlock({ ...named, sections: [{ key: "s", name: "Pizze", dishes: [dish] }] }, OWNER)).toBeNull();
    });

    it("lo stile vuole un colore; copiato, lo stile di partenza", () => {
        const t = { ...newTunnel("stile", ALL), name: "Natale" };
        expect(blocker(t, "aspetto", OWNER)).toBe("Scegli un colore");
        expect(blocker({ ...t, color: "#be123c" }, "aspetto", OWNER)).toBe("");
        expect(blocker({ ...t, base: "copy" }, "nome", OWNER)).toBe("Scegli lo stile da cui partire");
    });

    it("in evidenza: il titolo, il link del bottone in https, il prezzo del bundle", () => {
        const t = { ...newTunnel("evid", ALL), evType: "bundle" as const };
        expect(blocker(t, "contenuto", OWNER)).toBe("Manca il titolo");
        expect(blocker({ ...t, title: "Menù degustazione", cta: true, ctaLink: "http://x.it" }, "contenuto", OWNER)).toBe("Il link del bottone deve cominciare con https://");
        expect(blocker({ ...t, title: "Menù degustazione", cta: true, ctaText: " " }, "contenuto", OWNER)).toBe("Manca il testo del bottone");
        expect(blocker(t, "piatti", OWNER)).toBe("Aggiungi almeno un piatto");
        expect(blocker({ ...t, dishes: ["p1"], bundle: "0" }, "piatti", OWNER)).toBe("Manca il prezzo del bundle");
        expect(blocker({ ...t, dishes: ["p1"], bundle: "24,50" }, "piatti", OWNER)).toBe("");
    });

    it("il Dove: almeno una sede; la storia per ora in una sede sola", () => {
        const none = { all: false, activityIds: [], groupIds: [] };
        expect(blocker(newTunnel("menu", none), "dove", OWNER)).toBe("Scegli almeno una sede");
        expect(blocker(newTunnel("menu", none), "dove", { owner: true, multi: false })).toBe("");
        expect(blocker(newTunnel("storia", { all: false, activityIds: ["a", "b"], groupIds: [] }), "dove", OWNER)).toMatch(/^Una storia in più sedi/);
        expect(blocker(newTunnel("storia", { all: false, activityIds: ["a"], groupIds: [] }), "dove", OWNER)).toBe("");
    });

    it("il Quando: «Sempre» non guarda il modulo; il modulo non passa cose che il database rifiuta", () => {
        const t = { ...newTunnel("menu", ALL), when: { days: [] } };
        expect(effWhen(t)).toEqual({});
        expect(blocker(t, "quando", OWNER)).toBe("");
        expect(blocker({ ...t, qmode: "momenti" }, "quando", OWNER)).toBe("Scegli almeno un giorno");
        expect(whenProblem({ ranges: [[900, 720]] })).toBe("Una fascia finisce prima di cominciare");
    });
});

describe("tunnel di creazione: la bozza tenuta da parte nel Calendario", () => {
    it("porta il suo quando e il suo dove, senza toccare la bozza", () => {
        const when = { days: [5, 6], ranges: [[720, 900]] as [number, number][] };
        const where = { all: false, activityIds: ["porto"], groupIds: [] };
        const t = withAside(newTunnel("menu", ALL), { when, where });
        expect(t).toMatchObject({ aside: true, qmode: "momenti", when: { days: [5, 6], ranges: [[720, 900]] }, where });
        t.when.days!.push(0);
        t.where.activityIds.push("centro");
        expect(when.days).toEqual([5, 6]);
        expect(where.activityIds).toEqual(["porto"]);
    });

    it("una bozza senza tempo resta «Sempre»", () => {
        const t = withAside(newTunnel("stile", ALL), { when: {}, where: ALL });
        expect(t.qmode).toBe("sempre");
        expect(t.aside).toBe(true);
    });

    it("lo stile aperto da «E adesso?» parte dal quando e dal dove del menù", () => {
        const from: FromMenu = { name: "Pranzo", catalogId: "m", ruleId: "r", productIds: [], when: { days: [0, 1, 2, 3, 4] }, where: { all: false, activityIds: ["porto"], groupIds: [] }, per: null };
        const t = newTunnel("stile", ALL, from);
        expect(t).toMatchObject({ qmode: "momenti", when: { days: [0, 1, 2, 3, 4] }, where: { activityIds: ["porto"] }, aside: false, per: null });
    });

    it("le ore diverse per sede del menù passano allo stile, copiate", () => {
        const per = { porto: { days: [0, 1, 2, 3, 4] }, lido: { days: [5, 6] } };
        const from: FromMenu = { name: "Pranzo", catalogId: "m", ruleId: "r", productIds: [], when: { days: [0, 1, 2, 3, 4] }, where: { all: false, activityIds: ["porto", "lido"], groupIds: [] }, per };
        const t = newTunnel("stile", ALL, from);
        expect(t.per).toEqual(per);
        expect(t.per).not.toBe(per);
    });
});

describe("tunnel di creazione: il titolo e cosa si perde uscendo", () => {
    it("il titolo dice cosa e come si chiama", () => {
        expect(tunnelTitle(newTunnel("menu", ALL))).toBe("Nuovo menù");
        expect(tunnelTitle({ ...newTunnel("menu", ALL), name: " Cena " })).toBe("Nuovo menù · Cena");
        expect(tunnelTitle({ ...newTunnel("evid", ALL), title: "Brunch" })).toBe("Nuovo contenuto in evidenza · Brunch");
        expect(tunnelTitle({ ...newTunnel("storia", ALL), name: "non conta" })).toBe("Nuova storia");
    });

    it("appena aperto non c'è niente da perdere; una scelta o un nome sì", () => {
        expect(isDirty(newTunnel("menu", ALL))).toBe(false);
        expect(isDirty({ ...newTunnel("menu", ALL), menuType: "classico" })).toBe(true);
        expect(isDirty({ ...newTunnel("storia", ALL), title: "Il forno" })).toBe(true);
        expect(isDirty({ ...newTunnel("stile", ALL), name: "  " })).toBe(false);
        expect(isDirty({ ...newTunnel("stile", ALL), i: 1 })).toBe(true);
    });
});

describe("tunnel di creazione: lo stile con le quattro scelte", () => {
    it("colore, tema, carattere e card sopra lo stile di partenza; il resto resta com'era", () => {
        const t = { ...newTunnel("stile", ALL), color: "#be123c", dark: true, font: "lora" as const, card: "compatti" as const };
        const tk = styleTokens(t, DEFAULT_STYLE_TOKENS);
        expect(tk.colors.primary).toBe("#be123c");
        expect(tk.colors.pageBackground).toBe(DARK_BG);
        expect(tk.typography.fontFamily).toBe("lora");
        expect(tk.card.productStyle).toBe("compact");
        expect(tk.header).toEqual(DEFAULT_STYLE_TOKENS.header);
        expect(tk.navigation).toEqual(DEFAULT_STYLE_TOKENS.navigation);
        expect(DEFAULT_STYLE_TOKENS.colors.primary).not.toBe("#be123c");
        expect(aspectOf(tk)).toEqual({ dark: true, font: "lora", card: "compatti" });
    });

    it("il tema chiaro su una base scura torna bianco; la card senza foto nasconde le foto", () => {
        const dark = styleTokens({ ...newTunnel("stile", ALL), dark: true }, DEFAULT_STYLE_TOKENS);
        const back = styleTokens({ ...newTunnel("stile", ALL), dark: false, card: "lista" }, dark);
        expect(back.colors.pageBackground).toBe(LIGHT_BG);
        expect(back.card.image.mode).toBe("hide");
        expect(aspectOf(back).card).toBe("lista");
    });

    it("scuro o chiaro dal colore", () => {
        expect(isDarkHex("#0F172A")).toBe(true);
        expect(isDarkHex("#FFFFFF")).toBe(false);
        expect(isDarkHex("#fef3c7")).toBe(false);
        expect(isDarkHex("non un colore")).toBe(false);
    });

    it("i piatti del telefono: due per sezione, al massimo tre sezioni, solo quelli scelti", () => {
        const p = (id: string, category: string | null) => ({ id, name: id, category, listPrice: 8, formats: [] });
        const pick = [p("a", "Pizze"), p("b", "Pizze"), p("c", "Pizze"), p("d", "Dolci"), p("e", null), p("f", "Vini")];
        expect(sampleOf(pick).map(s => [s.name, s.dishes.length])).toEqual([["Pizze", 2], ["Dolci", 1], ["Piatti", 1]]);
        expect(sampleOf(pick, new Set(["c", "f"])).map(s => s.dishes.map(d => d.name))).toEqual([["c"], ["f"]]);
    });
});
