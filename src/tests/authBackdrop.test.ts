import { describe, expect, it } from "vitest";
import {
    WAKE_AFTER,
    WAVE_LIFE,
    WAVE_PERIOD,
    calmDown,
    createBackdropState,
    isModule,
    pulseAt,
    shouldWake,
    tick,
    wake,
    waveStrength
} from "@/layouts/AuthLayout/backdropWaves";

describe("sfondo delle pagine di accesso", () => {
    it("fa partire un'onda dal centro subito e poi una ogni periodo", () => {
        const s = createBackdropState();
        tick(s, 1000);
        expect(s.waves).toHaveLength(1);
        expect(s.waves[0]).toMatchObject({ fx: 0.5, fy: 0.5, start: 1000 });
        tick(s, 1000 + WAVE_PERIOD - 1);
        expect(s.waves).toHaveLength(1);
        tick(s, 1000 + WAVE_PERIOD);
        expect(s.waves).toHaveLength(2);
    });

    it("toglie le onde finite", () => {
        const s = createBackdropState();
        tick(s, 0);
        calmDown(s, 0);
        tick(s, WAVE_LIFE);
        expect(s.waves).toHaveLength(0);
    });

    it("quando l'utente scrive non parte nessuna onda nuova, ma quelle in corso finiscono", () => {
        const s = createBackdropState();
        tick(s, 0);
        calmDown(s, 100);
        tick(s, WAVE_PERIOD + 100);
        expect(s.waves.map((w) => w.start)).toEqual([0]);
    });

    it("riparte solo dopo il tempo di calma e col focus fuori dalla scheda", () => {
        const s = createBackdropState();
        calmDown(s, 1000);
        expect(shouldWake(s, 1000 + WAKE_AFTER - 1, false)).toBe(false);
        expect(shouldWake(s, 1000 + WAKE_AFTER, true)).toBe(false);
        expect(shouldWake(s, 1000 + WAKE_AFTER, false)).toBe(true);
        wake(s, 20000);
        tick(s, 20000);
        expect(s.waves).toHaveLength(1);
    });

    it("un clic sullo sfondo fa partire un'onda da lì anche con lo sfondo calmo", () => {
        const s = createBackdropState();
        calmDown(s, 0);
        pulseAt(s, 0.2, 0.8, 50);
        expect(s.waves).toEqual([{ fx: 0.2, fy: 0.8, start: 50, seed: 1 }]);
    });

    it("l'onda è più forte sul suo fronte e si spegne con l'età", () => {
        const reach = 1000;
        const age = 1000;
        const q = age / WAVE_LIFE;
        const front = reach * (1 - Math.pow(1 - q, 2.2));
        expect(waveStrength(front, age, reach)).toBeGreaterThan(waveStrength(front + 200, age, reach));
        expect(waveStrength(front, age, reach)).toBeGreaterThan(waveStrength(reach, WAVE_LIFE - 10, reach));
        expect(waveStrength(0, WAVE_LIFE, reach)).toBe(0);
    });

    it("ogni onda ha un disegno di moduli diverso, circa metà dei punti", () => {
        let a = 0;
        let diff = 0;
        for (let i = 0; i < 40; i++) {
            for (let j = 0; j < 40; j++) {
                if (isModule(i, j, 1)) a++;
                if (isModule(i, j, 1) !== isModule(i, j, 2)) diff++;
            }
        }
        expect(a / 1600).toBeGreaterThan(0.35);
        expect(a / 1600).toBeLessThan(0.55);
        expect(diff).toBeGreaterThan(400);
    });
});
