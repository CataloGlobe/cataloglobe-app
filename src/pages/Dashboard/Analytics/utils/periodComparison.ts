export type PeriodKey = "today" | "7d" | "30d" | "90d" | "all";

export interface DateRange {
    from: Date;
    to: Date;
}

export function getPreviousRange(current: DateRange): DateRange {
    const durationMs = current.to.getTime() - current.from.getTime();
    return {
        from: new Date(current.from.getTime() - durationMs),
        to: new Date(current.to.getTime() - durationMs)
    };
}

export function calculateDelta(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

export function getPreviousPeriodLabel(period: PeriodKey): string {
    switch (period) {
        case "today":
            return "ieri";
        case "7d":
            return "7 giorni prima";
        case "30d":
            return "30 giorni prima";
        case "90d":
            return "90 giorni prima";
        case "all":
            return "periodo precedente";
    }
}
