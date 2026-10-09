import { afterEach, describe, expect, it } from "vitest";
import {
    __resetSediVistaForTests,
    claimConfronto,
    getConfrontoQui,
    getSediVista,
    isConfrontoAttivo,
    setConfrontaVista,
    setSedeVista,
    subscribeSediVista
} from "@/hooks/sediVistaStore";

const T = "tenant-1";
const sede = (id: string) => ({ kind: "sede" as const, id });

afterEach(() => __resetSediVistaForTests());

describe("sediVistaStore", () => {
    it("parte vuoto e un'altra azienda legge vuoto", () => {
        expect(getSediVista(T).sede).toBeNull();
        setSedeVista(T, sede("a"));
        expect(getSediVista(T).sede).toEqual(sede("a"));
        expect(getSediVista("tenant-2").sede).toBeNull();
        expect(getSediVista(null).sede).toBeNull();
    });

    it("cambiando azienda si riparte vuoti", () => {
        setSedeVista(T, sede("a"));
        setConfrontaVista(T, ["b"]);
        setSedeVista("tenant-2", { kind: "all" });
        expect(getSediVista("tenant-2").confronta).toEqual([]);
        expect(getSediVista(T).sede).toBeNull();
    });

    it("il confronto non contiene mai la sede scelta", () => {
        setSedeVista(T, sede("a"));
        setConfrontaVista(T, ["a", "b", "b", "c"]);
        expect(getSediVista(T).confronta).toEqual(["b", "c"]);
    });

    it("scegliendo come sede una del confronto, quella di prima entra nel confronto", () => {
        setSedeVista(T, sede("a"));
        setConfrontaVista(T, ["b", "c"]);
        setSedeVista(T, sede("b"));
        expect(getSediVista(T).sede).toEqual(sede("b"));
        expect(getSediVista(T).confronta).toEqual(["c", "a"]);
    });

    it("senza confronto acceso, cambiare sede non ne accende uno", () => {
        setSedeVista(T, sede("a"));
        setSedeVista(T, sede("b"));
        expect(getSediVista(T).confronta).toEqual([]);
    });

    it("da «tutte» a una sede già a confronto, in un colpo solo", () => {
        setSedeVista(T, { kind: "all" });
        setSedeVista(T, sede("b"), { confronta: ["a", "b", "c"] });
        expect(getSediVista(T).sede).toEqual(sede("b"));
        expect(getSediVista(T).confronta).toEqual(["a", "c"]);
    });

    it("con «tutte» o un gruppo il confronto resta salvato ma non si vede", () => {
        setSedeVista(T, sede("a"));
        setConfrontaVista(T, ["b"]);
        expect(isConfrontoAttivo(getSediVista(T), true)).toBe(true);
        setSedeVista(T, { kind: "gruppo", id: "g1" });
        expect(getSediVista(T).confronta).toEqual(["b"]);
        expect(isConfrontoAttivo(getSediVista(T), true)).toBe(false);
        setSedeVista(T, { kind: "all" });
        expect(isConfrontoAttivo(getSediVista(T), true)).toBe(false);
    });

    it("il confronto si vede solo dove la sezione lo dichiara, e non si perde fuori", () => {
        setSedeVista(T, sede("a"));
        setConfrontaVista(T, ["b"]);
        expect(getConfrontoQui()).toBe(false);
        expect(isConfrontoAttivo(getSediVista(T), getConfrontoQui())).toBe(false);
        const release = claimConfronto();
        expect(isConfrontoAttivo(getSediVista(T), getConfrontoQui())).toBe(true);
        release();
        release();
        expect(getConfrontoQui()).toBe(false);
        expect(getSediVista(T).confronta).toEqual(["b"]);
    });

    it("avvisa chi ascolta e lo snapshot resta lo stesso oggetto senza scritture", () => {
        let calls = 0;
        const off = subscribeSediVista(() => calls++);
        setSedeVista(T, sede("a"));
        expect(calls).toBe(1);
        expect(getSediVista(T)).toBe(getSediVista(T));
        expect(getSediVista("altro")).toBe(getSediVista(null));
        off();
        setConfrontaVista(T, ["b"]);
        expect(calls).toBe(1);
    });
});
