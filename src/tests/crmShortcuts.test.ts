import { describe, expect, it } from "vitest";
import { crmShortcutLabel, matchesCrmShortcut } from "@/utils/crm/crmShortcuts";

type Ev = Parameters<typeof matchesCrmShortcut>[0];

function ev(over: Partial<Ev> = {}): Ev {
    return {
        code: "KeyJ",
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        target: null,
        ...over
    };
}

function field(tag: string): EventTarget {
    return { closest: (sel: string) => (sel.includes(tag) ? {} : null) } as unknown as EventTarget;
}

describe("matchesCrmShortcut", () => {
    it("Alt più la lettera, letta dal tasto e non dal carattere", () => {
        expect(matchesCrmShortcut(ev(), "j")).toBe(true);
        expect(matchesCrmShortcut(ev({ code: "KeyK" }), "k")).toBe(true);
        expect(matchesCrmShortcut(ev({ code: "KeyK" }), "j")).toBe(false);
    });

    it("la lettera da sola non basta più (dettatura, tasto per sbaglio)", () => {
        expect(matchesCrmShortcut(ev({ altKey: false }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ code: "KeyI", altKey: false }), "i")).toBe(false);
    });

    it("con altri modificatori, tasto tenuto o composizione: no", () => {
        expect(matchesCrmShortcut(ev({ metaKey: true }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ ctrlKey: true }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ shiftKey: true }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ repeat: true }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ isComposing: true }), "j")).toBe(false);
    });

    it("dentro un campo di testo: no", () => {
        expect(matchesCrmShortcut(ev({ target: field("textarea") }), "j")).toBe(false);
        expect(matchesCrmShortcut(ev({ target: field("nessuno") }), "j")).toBe(true);
    });
});

describe("crmShortcutLabel", () => {
    it("⌥ sul Mac, Alt+ altrove", () => {
        expect(crmShortcutLabel("j", "MacIntel")).toBe("⌥J");
        expect(crmShortcutLabel("i", "Win32")).toBe("Alt+I");
    });
});
