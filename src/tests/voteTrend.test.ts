import { describe, expect, it } from "vitest";
import type { Review } from "@/types/database";
import { smoothPath, weeklyAverages } from "@/pages/Dashboard/Reviews/voteTrend";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12);

const review = (daysAgo: number, rating: number) =>
    ({ created_at: new Date(NOW - daysAgo * DAY).toISOString(), rating }) as Review;

describe("weeklyAverages", () => {
    it("media per settimana, la più vecchia per prima", () => {
        const list = [review(1, 5), review(2, 4), review(9, 3), review(20, 2)];
        expect(weeklyAverages(list, NOW)).toEqual([2, 3, 4.5]);
    });

    it("salta le settimane vuote e quelle fuori dalla finestra", () => {
        const list = [review(1, 4), review(30, 2), review(60, 1)];
        expect(weeklyAverages(list, NOW, 7)).toEqual([2, 4]);
    });

    it("con una settimana sola non c'è niente da disegnare", () => {
        expect(weeklyAverages([review(1, 5), review(3, 3)], NOW)).toEqual([]);
        expect(weeklyAverages([], NOW)).toEqual([]);
    });

    it("ignora le recensioni con la data nel futuro", () => {
        expect(weeklyAverages([review(-2, 1), review(1, 5), review(8, 3)], NOW)).toEqual([3, 5]);
    });
});

describe("smoothPath", () => {
    it("parte dal primo punto e fa una curva per tratto", () => {
        const d = smoothPath([
            [0, 10],
            [10, 0],
            [20, 10],
        ]);
        expect(d.startsWith("M0,10")).toBe(true);
        expect(d.match(/C/g)).toHaveLength(2);
        expect(d.endsWith("20,10.0")).toBe(true);
    });

    it("senza punti è vuoto", () => {
        expect(smoothPath([])).toBe("");
    });
});
