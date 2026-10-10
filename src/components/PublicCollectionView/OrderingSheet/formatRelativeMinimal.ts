import type { TFunction } from "i18next";

/** Ogni quanto si ricalcola l'orario relativo nella tab Ordini. */
export const RELATIVE_TIME_TICK_MS = 30_000;

/**
 * "adesso" / "N min fa" / "N h fa" / data breve. `now` arriva dal chiamante
 * (stato che ticchetta ogni RELATIVE_TIME_TICK_MS), così il render è
 * deterministico e la scritta si aggiorna anche a sheet aperto.
 */
export function formatRelativeMinimal(iso: string, t: TFunction, now: number): string {
    const diffMs = now - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("ordering.time_now");
    if (diffMin < 60) return t("ordering.time_min_ago", { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t("ordering.time_hour_ago", { count: diffH });
    return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(iso));
}
