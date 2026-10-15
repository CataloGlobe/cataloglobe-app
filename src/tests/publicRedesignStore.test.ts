import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getActiveSectionId,
    setActiveSectionId,
    subscribeActiveSection
} from "@/components/PublicCollectionView/redesign/activeSectionStore";

afterEach(() => {
    setActiveSectionId(null);
});

describe("store della sezione attiva", () => {
    it("parte vuoto e salva l'ultimo valore", () => {
        expect(getActiveSectionId()).toBeNull();
        setActiveSectionId("antipasti");
        expect(getActiveSectionId()).toBe("antipasti");
    });

    it("avvisa chi ascolta solo se il valore cambia", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeActiveSection(listener);
        setActiveSectionId("primi");
        setActiveSectionId("primi");
        setActiveSectionId("secondi");
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        setActiveSectionId("dolci");
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
