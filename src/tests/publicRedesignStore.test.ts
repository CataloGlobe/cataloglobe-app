import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getActiveSectionId,
    setActiveSectionId,
    subscribeActiveSection
} from "@/components/PublicCollectionView/redesign/activeSectionStore";

afterEach(() => {
    setActiveSectionId(null);
    vi.unstubAllEnvs();
    vi.resetModules();
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

describe("interruttore VITE_PUBLIC_REDESIGN", () => {
    it("è spento se assente o diverso da \"true\"", async () => {
        vi.stubEnv("VITE_PUBLIC_REDESIGN", "");
        expect((await import("@/components/PublicCollectionView/redesign/flag")).PUBLIC_REDESIGN_ENABLED).toBe(false);
        vi.resetModules();
        vi.stubEnv("VITE_PUBLIC_REDESIGN", "1");
        expect((await import("@/components/PublicCollectionView/redesign/flag")).PUBLIC_REDESIGN_ENABLED).toBe(false);
    });

    it("è acceso solo con \"true\"", async () => {
        vi.stubEnv("VITE_PUBLIC_REDESIGN", "true");
        expect((await import("@/components/PublicCollectionView/redesign/flag")).PUBLIC_REDESIGN_ENABLED).toBe(true);
    });
});
