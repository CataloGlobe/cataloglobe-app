/**
 * Stato della status page su Redis: fonte primaria per la pagina e per gli
 * avvisi. Il DB (`status_checks`, `status_service_state`) resta come storico,
 * scritto dal cron dopo Redis e con timeout.
 *
 * Perché Redis: la pagina deve poter dire che il database è giù, e gli
 * avvisi devono partire anche quando lo è. Con la lettura dal DB nessuna
 * delle due cose era possibile. In più `purge-status-checks` cancella le
 * righe oltre 7 giorni: l'uptime a 90 giorni vive solo qui.
 *
 * Chiavi (namespace per ambiente come gli snapshot, vedi redis.ts):
 *   cataloglobe:{env}:status:v1:current                    JSON StatusCurrent
 *   cataloglobe:{env}:status:v1:uptime:{service}:{YYYY-MM-DD}  hash up|degraded|down → conteggio
 *   cataloglobe:{env}:status:v1:alert:{service}            JSON AlertState
 *   cataloglobe:{env}:status:v1:history                    JSON UptimeHistory (giorni chiusi, 1 volta al giorno)
 *
 * Giorni in UTC.
 * Timeout: quello del client condiviso (`getRedis`, REDIS_TIMEOUT_MS).
 */

import { getEnvNamespace, getRedis } from "./redis.js";
import { SERVICE_KEYS, type CheckResult, type CheckStatus, type ServiceKey } from "./statusServices.js";

export const UPTIME_DAYS = 90;
/** Un giorno in più della finestra: il giorno più vecchio resta leggibile fino a fine giornata. */
const UPTIME_TTL_SECONDS = (UPTIME_DAYS + 1) * 24 * 60 * 60;
const CURRENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALERT_TTL_SECONDS = 7 * 24 * 60 * 60;

export type ServiceSnapshot = {
    status: CheckStatus;
    responseTimeMs: number | null;
    error: string | null;
};

export type StatusCurrent = {
    checkedAt: string;
    services: Record<ServiceKey, ServiceSnapshot>;
};

/** Stato per l'isteresi degli avvisi (vedi decideAlertWithHysteresis). */
export type AlertState = {
    /** Esito del controllo precedente (= previousObservedStatus). */
    lastObserved: CheckStatus;
    /** Ultimo stato per cui è partita un'email (null = mai). */
    lastNotified: CheckStatus | null;
    lastNotifiedAt: string | null;
};

export type DailyBucket = {
    date: string;
    worst: CheckStatus | "unknown";
    checkCount: number;
};

function prefix(): string {
    return `cataloglobe:${getEnvNamespace()}:status:v1`;
}

export function currentKey(): string {
    return `${prefix()}:current`;
}

export function uptimeKey(service: ServiceKey, day: string): string {
    return `${prefix()}:uptime:${service}:${day}`;
}

export function alertKey(service: ServiceKey): string {
    return `${prefix()}:alert:${service}`;
}

export function utcDay(iso: string): string {
    return iso.slice(0, 10);
}

/** Ultimi `days` giorni UTC fino a `now` compreso, dal più vecchio. */
export function lastUtcDays(now: Date, days: number): string[] {
    const out: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        out.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }
    return out;
}

/** Contatori di un giorno → bucket. Peggiore del giorno, come prima. */
export function bucketFromCounts(
    date: string,
    counts: Record<string, unknown> | null | undefined
): DailyBucket {
    const n = (k: CheckStatus) => {
        const v = Number(counts?.[k] ?? 0);
        return Number.isFinite(v) ? v : 0;
    };
    const up = n("up");
    const degraded = n("degraded");
    const down = n("down");
    const total = up + degraded + down;
    const worst: DailyBucket["worst"] =
        down > 0 ? "down" : degraded > 0 ? "degraded" : up > 0 ? "up" : "unknown";
    return { date, worst, checkCount: total };
}

function logRedisError(op: string, err: unknown): void {
    console.error(
        JSON.stringify({
            event: "status_redis_failed",
            op,
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        })
    );
}

/**
 * Scrive stato corrente + contatori uptime del ciclo. Best-effort: su
 * errore logga e ritorna false, il ciclo prosegue (DB, avvisi).
 */
export async function writeCycle(results: CheckResult[], checkedAt: string): Promise<boolean> {
    const services = {} as Record<ServiceKey, ServiceSnapshot>;
    for (const r of results) {
        services[r.serviceKey] = {
            status: r.status,
            responseTimeMs: r.responseTimeMs,
            error: r.error
        };
    }
    const current: StatusCurrent = { checkedAt, services };
    const day = utcDay(checkedAt);
    try {
        const p = getRedis().pipeline();
        p.set(currentKey(), current, { ex: CURRENT_TTL_SECONDS });
        for (const r of results) {
            const key = uptimeKey(r.serviceKey, day);
            p.hincrby(key, r.status, 1);
            p.expire(key, UPTIME_TTL_SECONDS);
        }
        await p.exec();
        return true;
    } catch (err) {
        logRedisError("write_cycle", err);
        return false;
    }
}

/**
 * Stato degli avvisi di un servizio. `ok: false` = lettura fallita (il
 * chiamante ripiega sul DB); `state: null` = chiave assente.
 */
export async function readAlertState(
    service: ServiceKey
): Promise<{ ok: true; state: AlertState | null } | { ok: false }> {
    try {
        const state = await getRedis().get<AlertState>(alertKey(service));
        return { ok: true, state: state ?? null };
    } catch (err) {
        logRedisError("read_alert", err);
        return { ok: false };
    }
}

export async function writeAlertState(service: ServiceKey, state: AlertState): Promise<void> {
    try {
        await getRedis().set(alertKey(service), state, { ex: ALERT_TTL_SECONDS });
    } catch (err) {
        logRedisError("write_alert", err);
    }
}

/** Stato corrente. Lancia su errore Redis (il chiamante risponde 503). */
export async function readCurrent(): Promise<StatusCurrent | null> {
    return (await getRedis().get<StatusCurrent>(currentKey())) ?? null;
}

/**
 * Riepilogo dei giorni chiusi (fino a ieri, UTC), ricalcolato una volta al
 * giorno. I giorni passati non cambiano più: rileggerli a ogni richiesta
 * costava 4 × 89 HGETALL, e una pagina di stato lasciata aperta ha
 * esaurito da sola la quota mensile di Upstash (ottobre 2026).
 */
export type UptimeHistory = {
    /** Ultimo giorno compreso (ieri rispetto a quando è stato calcolato). */
    through: string;
    days: Record<ServiceKey, DailyBucket[]>;
};

/** Due giorni: basta a coprire il cambio di giorno, poi si ricalcola. */
const HISTORY_TTL_SECONDS = 2 * 24 * 60 * 60;

export function historyKey(): string {
    return `${prefix()}:history`;
}

/**
 * Il riepilogo vale se copre esattamente i giorni chiusi richiesti (stesso
 * primo e ultimo giorno, stessa lunghezza) per tutti i servizi. Se cambia la
 * finestra (UPTIME_DAYS) si ricalcola invece di mostrare giorni vuoti.
 */
export function isHistoryFresh(
    history: UptimeHistory | null | undefined,
    pastDays: string[]
): history is UptimeHistory {
    if (!history || !history.days) return false;
    if (history.through !== pastDays[pastDays.length - 1]) return false;
    return SERVICE_KEYS.every(s => {
        const buckets = history.days[s];
        return (
            Array.isArray(buckets) &&
            buckets.length === pastDays.length &&
            buckets[0]?.date === pastDays[0]
        );
    });
}

/** Giorni chiusi (riepilogo) + oggi (contatori vivi) → finestra completa. */
export function mergeUptime(
    pastDays: string[],
    today: string,
    history: UptimeHistory | null,
    todayCounts: Array<Record<string, unknown> | null>
): Record<ServiceKey, DailyBucket[]> {
    const out = {} as Record<ServiceKey, DailyBucket[]>;
    SERVICE_KEYS.forEach((service, si) => {
        const byDate = new Map((history?.days[service] ?? []).map(b => [b.date, b]));
        out[service] = [
            ...pastDays.map(day => byDate.get(day) ?? bucketFromCounts(day, null)),
            bucketFromCounts(today, todayCounts[si])
        ];
    });
    return out;
}

/** Rilegge i contatori dei giorni chiusi e salva il riepilogo (best-effort). */
async function rebuildHistory(pastDays: string[]): Promise<UptimeHistory> {
    const redis = getRedis();
    const p = redis.pipeline();
    for (const service of SERVICE_KEYS) {
        for (const day of pastDays) p.hgetall(uptimeKey(service, day));
    }
    const raw = (await p.exec()) as Array<Record<string, unknown> | null>;
    const days = {} as Record<ServiceKey, DailyBucket[]>;
    SERVICE_KEYS.forEach((service, si) => {
        days[service] = pastDays.map((day, di) =>
            bucketFromCounts(day, raw[si * pastDays.length + di])
        );
    });
    const history: UptimeHistory = { through: pastDays[pastDays.length - 1], days };
    try {
        await redis.set(historyKey(), history, { ex: HISTORY_TTL_SECONDS });
    } catch (err) {
        logRedisError("write_history", err);
    }
    return history;
}

/**
 * Uptime degli ultimi `days` giorni per ogni servizio. Di solito 5 comandi
 * (riepilogo + 4 HGETALL di oggi); i giorni chiusi si ricalcolano alla
 * prima lettura del giorno. Giorni senza chiave → `unknown`. Lancia su
 * errore Redis.
 */
export async function readUptime(
    now: Date,
    days = UPTIME_DAYS
): Promise<Record<ServiceKey, DailyBucket[]>> {
    const dayList = lastUtcDays(now, days);
    const today = dayList[dayList.length - 1];
    const pastDays = dayList.slice(0, -1);

    const p = getRedis().pipeline();
    p.get(historyKey());
    for (const service of SERVICE_KEYS) p.hgetall(uptimeKey(service, today));
    const [historyRaw, ...todayCounts] = (await p.exec()) as [
        UptimeHistory | null,
        ...Array<Record<string, unknown> | null>
    ];

    let history: UptimeHistory | null = null;
    if (pastDays.length > 0) {
        history = isHistoryFresh(historyRaw, pastDays)
            ? historyRaw
            : await rebuildHistory(pastDays);
    }
    return mergeUptime(pastDays, today, history, todayCounts);
}
