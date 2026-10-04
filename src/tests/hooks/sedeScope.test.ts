import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    SCOPE_ALL,
    clearSedeScopeLocal,
    readSedeScopeLocal,
    rememberLastSede,
    resolveSedeScope,
    resolveSedeScopeSingle,
    subscribeSedeScope,
    writeSedeScopeLocal
} from "@/hooks/sedeScopeStore";

// ============================================================
// Storage polyfill — `vitest.config.ts` usa environment "node",
// quindi `window.localStorage` non esiste di default. Lo scope in
// sessionStorage è uscito con la navigazione v2 (§51).
// ============================================================

function makeStorage(): Storage {
    const map = new Map<string, string>();
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        removeItem: (k: string) => {
            map.delete(k);
        },
        setItem: (k: string, v: string) => {
            map.set(k, v);
        }
    };
}

function installStorageMock(): void {
    // jsdom non disponibile: definiamo `window` minimal con session+local storage.
    (globalThis as unknown as { window: { sessionStorage: Storage; localStorage: Storage } }).window = {
        sessionStorage: makeStorage(),
        localStorage: makeStorage()
    };
}

function uninstallStorageMock(): void {
    delete (globalThis as unknown as { window?: unknown }).window;
}

const ACT_1 = "11111111-1111-1111-1111-111111111111";
const ACT_2 = "22222222-2222-2222-2222-222222222222";
const ACT_3 = "33333333-3333-3333-3333-333333333333";

// Subscriber registry per test: il `listeners` Set è module-level
// e non riazzerabile dall'esterno. Tracciamo le unsubscribe locali
// e le scarichiamo in `afterEach` così un eventuale `expect` che
// throwa a metà test non lascia listener leaked nei test successivi.
const pendingUnsubs: Array<() => void> = [];

function track(unsub: () => void): () => void {
    pendingUnsubs.push(unsub);
    return unsub;
}

beforeEach(() => {
    installStorageMock();
});

afterEach(() => {
    while (pendingUnsubs.length > 0) {
        try {
            pendingUnsubs.pop()!();
        } catch {
            /* best effort */
        }
    }
    uninstallStorageMock();
});

// ============================================================
// resolveSedeScope — pure resolver
// ============================================================

describe("resolveSedeScope — default single vs multi-site", () => {
    it("single-site: forza l'unica sede, isForcedSingleSite=true, ignora stored", () => {
        const res = resolveSedeScope({ storedValue: SCOPE_ALL, readableActivityIds: [ACT_1] });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(true);
    });

    it("single-site: anche se stored punta a un id diverso (perm revocato?), forza l'unica", () => {
        const res = resolveSedeScope({ storedValue: "other", readableActivityIds: [ACT_1] });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(true);
    });

    it("multi-site senza stored: default SCOPE_ALL", () => {
        const res = resolveSedeScope({ storedValue: null, readableActivityIds: [ACT_1, ACT_2] });
        expect(res.value).toBe(SCOPE_ALL);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site con stored=SCOPE_ALL: rispetta", () => {
        const res = resolveSedeScope({
            storedValue: SCOPE_ALL,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(SCOPE_ALL);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site con stored=activityId valido: rispetta", () => {
        const res = resolveSedeScope({
            storedValue: ACT_2,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(ACT_2);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site con stored=activityId NON più leggibile (perm revocato): fallback SCOPE_ALL", () => {
        const res = resolveSedeScope({
            storedValue: ACT_3,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(SCOPE_ALL);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("zero sedi leggibili: SCOPE_ALL placeholder, isForcedSingleSite=false (UI nasconde)", () => {
        const res = resolveSedeScope({ storedValue: SCOPE_ALL, readableActivityIds: [] });
        expect(res.value).toBe(SCOPE_ALL);
        expect(res.isForcedSingleSite).toBe(false);
    });
});

// ============================================================
// Store primitive — subscriber notification
// ============================================================

describe("sedeScopeStore — subscriber sync intra-tab", () => {
    it("write notifica tutti i subscriber", () => {
        const l1 = vi.fn();
        const l2 = vi.fn();
        track(subscribeSedeScope(l1));
        track(subscribeSedeScope(l2));

        writeSedeScopeLocal(ACT_1);

        expect(l1).toHaveBeenCalledTimes(1);
        expect(l2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe ferma la notifica per quel listener", () => {
        const l1 = vi.fn();
        const u1 = subscribeSedeScope(l1);

        writeSedeScopeLocal(ACT_1);
        expect(l1).toHaveBeenCalledTimes(1);

        u1();

        writeSedeScopeLocal(ACT_2);
        expect(l1).toHaveBeenCalledTimes(1);
    });

    it("clearSedeScopeLocal notifica i subscriber", () => {
        writeSedeScopeLocal(ACT_1);

        const l = vi.fn();
        track(subscribeSedeScope(l));

        clearSedeScopeLocal();
        expect(l).toHaveBeenCalledTimes(1);
    });
});

// ============================================================
// resolveSedeScopeSingle — modalità sede singola (mai SCOPE_ALL)
// ============================================================

describe("resolveSedeScopeSingle — modalità sede singola", () => {
    it("zero sedi leggibili: SCOPE_ALL placeholder (UI gestisce con empty-state)", () => {
        const res = resolveSedeScopeSingle({ storedValue: null, readableActivityIds: [] });
        expect(res.value).toBe(SCOPE_ALL);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("single-site: forza l'unica sede, isForcedSingleSite=true", () => {
        const res = resolveSedeScopeSingle({ storedValue: null, readableActivityIds: [ACT_1] });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(true);
    });

    it("multi-site con stored=activityId valido: rispetta", () => {
        const res = resolveSedeScopeSingle({
            storedValue: ACT_2,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(ACT_2);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site senza stored: default prima sede dell'array (mai SCOPE_ALL)", () => {
        const res = resolveSedeScopeSingle({
            storedValue: null,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site con stored=SCOPE_ALL (legacy/altra route): scarta, fallback prima sede", () => {
        const res = resolveSedeScopeSingle({
            storedValue: SCOPE_ALL,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(false);
    });

    it("multi-site con stored=activityId NON più leggibile: fallback prima sede", () => {
        const res = resolveSedeScopeSingle({
            storedValue: ACT_3,
            readableActivityIds: [ACT_1, ACT_2]
        });
        expect(res.value).toBe(ACT_1);
        expect(res.isForcedSingleSite).toBe(false);
    });
});

// ============================================================
// Store primitive — localStorage (modalità sede singola)
// ============================================================

describe("sedeScopeStore — localStorage single-site", () => {
    it("read/write su localStorage, NON tenant-scoped (key globale)", () => {
        writeSedeScopeLocal(ACT_1);
        expect(readSedeScopeLocal()).toBe(ACT_1);
    });

    it("overwrite: vince l'ultimo write", () => {
        writeSedeScopeLocal(ACT_1);
        writeSedeScopeLocal(ACT_2);
        expect(readSedeScopeLocal()).toBe(ACT_2);
    });

    it("clear rimuove l'entry localStorage", () => {
        writeSedeScopeLocal(ACT_1);
        clearSedeScopeLocal();
        expect(readSedeScopeLocal()).toBeNull();
    });

    it("write su localStorage notifica i subscriber del pub/sub condiviso", () => {
        const l = vi.fn();
        track(subscribeSedeScope(l));

        writeSedeScopeLocal(ACT_1);
        expect(l).toHaveBeenCalledTimes(1);
    });

    it("rememberLastSede scrive l'ultima sede e notifica solo quando cambia (§51.9)", () => {
        const l = vi.fn();
        track(subscribeSedeScope(l));

        rememberLastSede(ACT_1);
        rememberLastSede(ACT_1);
        expect(readSedeScopeLocal()).toBe(ACT_1);
        expect(l).toHaveBeenCalledTimes(1);

        rememberLastSede(ACT_2);
        expect(readSedeScopeLocal()).toBe(ACT_2);
        expect(l).toHaveBeenCalledTimes(2);
    });
});
