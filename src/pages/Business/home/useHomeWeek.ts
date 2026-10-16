import { useEffect, useState } from "react";
import {
    getOrdersOverview,
    getOverviewStats,
    getReservationsOverview,
    getReviewMetrics
} from "@/services/supabase/analytics";
import { getPreviousRange, periodToDateRange } from "@/pages/Dashboard/Analytics/utils/periodComparison";

/** «Com'è andata» della Home: ultimi 7 giorni contro i 7 prima, per l'azienda
 *  (la RLS tiene solo le sedi di chi guarda). `null` = numero non disponibile. */
export type HomeWeekPair = { now: number; before: number } | null;
export type HomeWeek = {
    visits: HomeWeekPair;
    revenue: HomeWeekPair;
    covers: HomeWeekPair;
    rating: { now: number; before: number; total: number; beforeTotal: number } | null;
};

export type HomeWeekState = { status: "loading" } | { status: "ready"; week: HomeWeek };

async function maybe<T>(enabled: boolean, load: () => Promise<T>, label: string): Promise<T | null> {
    if (!enabled) return null;
    try {
        return await load();
    } catch (error) {
        console.error(`[Home] ${label} failed:`, error);
        return null;
    }
}

export function useHomeWeek(
    tenantId: string | null | undefined,
    enabled: boolean,
    show: { visits: boolean; revenue: boolean; covers: boolean; rating: boolean }
): HomeWeekState {
    const [state, setState] = useState<HomeWeekState>({ status: "loading" });
    const { visits, revenue, covers, rating } = show;

    useEffect(() => {
        if (!tenantId || !enabled) return;
        let cancelled = false;
        setState({ status: "loading" });
        const now = periodToDateRange("7d");
        const before = getPreviousRange(now);
        const pair = <T,>(load: (range: typeof now) => Promise<T>, pick: (value: T) => number, on: boolean, label: string) =>
            Promise.all([maybe(on, () => load(now), label), maybe(on, () => load(before), label)]).then(([a, b]) =>
                a == null || b == null ? null : { now: pick(a), before: pick(b) }
            );

        Promise.all([
            pair(range => getOverviewStats(tenantId, range), s => s.total_views, visits, "visits"),
            pair(range => getOrdersOverview(tenantId, range), s => s.revenue, revenue, "revenue"),
            pair(range => getReservationsOverview(tenantId, range), s => s.covers, covers, "covers"),
            Promise.all([
                maybe(rating, () => getReviewMetrics(tenantId, now), "rating"),
                maybe(rating, () => getReviewMetrics(tenantId, before), "rating")
            ])
        ]).then(([v, r, c, [rNow, rBefore]]) => {
            if (cancelled) return;
            setState({
                status: "ready",
                week: {
                    visits: v,
                    revenue: r,
                    covers: c,
                    rating:
                        rNow && rBefore
                            ? { now: rNow.avg_rating, before: rBefore.avg_rating, total: rNow.total, beforeTotal: rBefore.total }
                            : null
                }
            });
        });
        return () => {
            cancelled = true;
        };
    }, [tenantId, enabled, visits, revenue, covers, rating]);

    return state;
}
