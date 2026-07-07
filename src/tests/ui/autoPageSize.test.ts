// src/tests/ui/autoPageSize.test.ts
import { describe, it, expect } from "vitest";
import {
    AUTO_MIN_ROWS,
    AUTO_MAX_ROWS,
    FALLBACK_PAGE_SIZE,
    computeFit,
    resolveAvailable,
    applyHysteresis,
    averageRowHeight,
    resolveNumericPageSize,
    withAutoOption,
    type HysteresisState
} from "@/components/ui/DataTable/autoPageSize";

describe("computeFit", () => {
    it("calcola floor((available - chrome) / avgRow)", () => {
        // 900 disponibili, 92 di chrome (header 44 + footer 48), righe da 56px
        expect(computeFit(900, 92, 56)).toBe(14); // floor(808/56) = 14
    });

    it("clampa al minimo 5 su spazi piccoli", () => {
        expect(computeFit(200, 92, 56)).toBe(AUTO_MIN_ROWS);
    });

    it("clampa al massimo 100 su spazi enormi", () => {
        expect(computeFit(20000, 92, 56)).toBe(AUTO_MAX_ROWS);
    });

    it("ritorna null con avgRow non positivo o available non positivo", () => {
        expect(computeFit(900, 92, 0)).toBeNull();
        expect(computeFit(0, 92, 56)).toBeNull();
    });

    it("ritorna null con input NaN (misure DOM non affidabili)", () => {
        expect(computeFit(NaN, 92, 56)).toBeNull();
        expect(computeFit(900, NaN, 56)).toBeNull();
        expect(computeFit(900, 92, NaN)).toBeNull();
    });
});

describe("resolveAvailable — euristica vincolato/non vincolato", () => {
    it("probe ≠ contenuto (non ambiguo), maxHeight DEFAULT → usa il probe reale, NON cappato", () => {
        // probe stretchato dal flex parent (spazio reale 700), contenuto naturale 1400
        expect(
            resolveAvailable({
                probeHeightPx: 700,
                contentHeightPx: 1400,
                maxHeightPx: 800,
                maxHeightIsExplicit: false,
                isProbeStretched: true
            })
        ).toBe(700);
        // probe più grande del contenuto (parent vincolato, poche righe): il default
        // maxHeight (800) NON deve cappare la misura reale (900) — bug regression:
        // Prodotti misurava probe=667 valido e veniva cappato a maxHeight=548.
        expect(
            resolveAvailable({
                probeHeightPx: 900,
                contentHeightPx: 300,
                maxHeightPx: 800,
                maxHeightIsExplicit: false,
                isProbeStretched: true
            })
        ).toBe(900);
    });

    it("probe ≈ contenuto MA probe STRETCHED (tabella riempie il probe vincolato) → usa il probe, NON fallback: niente oscillazione al fixpoint", () => {
        // Il caso che causava il ping-pong 548↔667: diff piccolo (≤4px) ma il probe
        // è flex-stretched da un genitore vincolato → segnale strutturale vince.
        expect(
            resolveAvailable({
                probeHeightPx: 667,
                contentHeightPx: 663,
                maxHeightPx: 548,
                maxHeightIsExplicit: false,
                isProbeStretched: true
            })
        ).toBe(667);
    });

    it("probe ≠ contenuto (non ambiguo), maxHeight ESPLICITO più piccolo → cappa (tetto voluto dal chiamante)", () => {
        expect(
            resolveAvailable({
                probeHeightPx: 667,
                contentHeightPx: 492,
                maxHeightPx: 500,
                maxHeightIsExplicit: true,
                isProbeStretched: true
            })
        ).toBe(500);
    });

    it("probe ≠ contenuto (non ambiguo), maxHeight ESPLICITO più grande del probe → resta il probe", () => {
        expect(
            resolveAvailable({
                probeHeightPx: 667,
                contentHeightPx: 492,
                maxHeightPx: 800,
                maxHeightIsExplicit: true,
                isProbeStretched: true
            })
        ).toBe(667);
    });

    it("caso AMBIGUO (probe ≈ contenuto E probe NON stretched) → fallback CONSERVATIVO su maxHeight", () => {
        // Contenitore block NON vincolato: il probe cresce col contenuto.
        // Usare probeHeight qui innescherebbe un loop di crescita.
        expect(
            resolveAvailable({
                probeHeightPx: 1400,
                contentHeightPx: 1400,
                maxHeightPx: 800,
                maxHeightIsExplicit: false,
                isProbeStretched: false
            })
        ).toBe(800);
        // Entro la tolleranza (±4px) resta ambiguo
        expect(
            resolveAvailable({
                probeHeightPx: 1403,
                contentHeightPx: 1400,
                maxHeightPx: 800,
                maxHeightIsExplicit: false,
                isProbeStretched: false
            })
        ).toBe(800);
        // ambiguo con maxHeight esplicito → resta il fallback su maxHeight
        expect(
            resolveAvailable({
                probeHeightPx: 1400,
                contentHeightPx: 1400,
                maxHeightPx: 800,
                maxHeightIsExplicit: true,
                isProbeStretched: false
            })
        ).toBe(800);
    });

    it("misure NaN → fallback conservativo su maxHeight", () => {
        expect(
            resolveAvailable({
                probeHeightPx: NaN,
                contentHeightPx: 1400,
                maxHeightPx: 800,
                maxHeightIsExplicit: false,
                isProbeStretched: true
            })
        ).toBe(800);
    });
});

describe("applyHysteresis — anti oscillazione", () => {
    it("delta ≥ 2 righe: applica subito", () => {
        const s: HysteresisState = { applied: 25, pending: null };
        expect(applyHysteresis(s, 34)).toEqual({ applied: 34, pending: null });
    });

    it("sequenza oscillante 34↔33 si stabilizza (non balla)", () => {
        let s: HysteresisState = { applied: 34, pending: null };
        s = applyHysteresis(s, 33); // ±1, prima vista → pending
        expect(s).toEqual({ applied: 34, pending: 33 });
        s = applyHysteresis(s, 34); // torna al corrente → pending azzerato
        expect(s).toEqual({ applied: 34, pending: null });
        s = applyHysteresis(s, 33);
        expect(s).toEqual({ applied: 34, pending: 33 });
        s = applyHysteresis(s, 34);
        expect(s.applied).toBe(34); // MAI applicato 33: stabile
    });

    it("valore adiacente confermato 2 volte consecutive: applicato", () => {
        let s: HysteresisState = { applied: 34, pending: null };
        s = applyHysteresis(s, 33);
        s = applyHysteresis(s, 33); // seconda conferma
        expect(s).toEqual({ applied: 33, pending: null });
    });
});

describe("averageRowHeight", () => {
    it("media dei valori positivi, ignora zeri", () => {
        expect(averageRowHeight([56, 56, 80, 0])).toBe(64);
    });
    it("null se nessun valore valido", () => {
        expect(averageRowHeight([])).toBeNull();
        expect(averageRowHeight([0, 0])).toBeNull();
    });
});

describe("resolveNumericPageSize — transizioni mode e fallback", () => {
    it("auto senza misura (null) → fallback 25", () => {
        expect(resolveNumericPageSize("auto", null, 500)).toBe(FALLBACK_PAGE_SIZE);
    });
    it("auto con misura → fit calcolato", () => {
        expect(resolveNumericPageSize("auto", 42, 500)).toBe(42);
    });
    it("manual numerico → il numero scelto (il resize non c'entra)", () => {
        expect(resolveNumericPageSize(50, 42, 500)).toBe(50);
    });
    it("'all' → tutta la lista", () => {
        expect(resolveNumericPageSize("all", 42, 500)).toBe(500);
    });
    it("transizione auto→manual→auto: torna a rispettare il fit", () => {
        expect(resolveNumericPageSize("auto", 42, 500)).toBe(42);
        expect(resolveNumericPageSize(100, 42, 500)).toBe(100);
        expect(resolveNumericPageSize("auto", 42, 500)).toBe(42);
    });
});

describe("withAutoOption", () => {
    it("inietta 'auto' in testa se assente", () => {
        expect(withAutoOption([25, 50, 100, "all"])).toEqual(["auto", 25, 50, 100, "all"]);
    });
    it("non duplica se già presente", () => {
        expect(withAutoOption(["auto", 25])).toEqual(["auto", 25]);
    });
    it("sposta 'auto' in testa se presente in mezzo alla lista", () => {
        expect(withAutoOption([25, "auto", 50])).toEqual(["auto", 25, 50]);
    });
});
