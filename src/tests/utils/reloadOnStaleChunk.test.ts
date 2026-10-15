import { describe, expect, it } from "vitest";
import {
    RELOAD_COOLDOWN_MS,
    RELOAD_STORAGE_KEY,
    shouldReloadForStaleChunk
} from "@/utils/reloadOnStaleChunk";

function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        data
    };
}

describe("shouldReloadForStaleChunk", () => {
    it("ricarica la prima volta e segna l'ora", () => {
        const storage = memoryStorage();
        expect(shouldReloadForStaleChunk(storage, 1_000_000)).toBe(true);
        expect(storage.data.get(RELOAD_STORAGE_KEY)).toBe("1000000");
    });

    it("non ricarica di nuovo entro il tempo di attesa (niente cicli)", () => {
        const storage = memoryStorage({ [RELOAD_STORAGE_KEY]: "1000000" });
        expect(shouldReloadForStaleChunk(storage, 1_000_000 + RELOAD_COOLDOWN_MS - 1)).toBe(false);
    });

    it("ricarica di nuovo passato il tempo di attesa (deploy successivo)", () => {
        const storage = memoryStorage({ [RELOAD_STORAGE_KEY]: "1000000" });
        expect(shouldReloadForStaleChunk(storage, 1_000_000 + RELOAD_COOLDOWN_MS)).toBe(true);
    });

    it("ricarica se lo storage manca o non funziona", () => {
        expect(shouldReloadForStaleChunk(null, 1)).toBe(true);
        const broken = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: () => undefined
        };
        expect(shouldReloadForStaleChunk(broken, 1)).toBe(true);
    });

    it("ignora un valore salvato non numerico", () => {
        const storage = memoryStorage({ [RELOAD_STORAGE_KEY]: "boh" });
        expect(shouldReloadForStaleChunk(storage, 5)).toBe(true);
    });
});
