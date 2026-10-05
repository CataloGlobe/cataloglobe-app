/**
 * Costi: calendario del mese e schede (canvas K2 + K5, decisi da Alex il
 * 2026-10-05). Puro, sulle date «AAAA-MM-GG» del giorno di Roma; provato in
 * `src/tests/crmExpenseCalendar.test.ts`.
 */
import { daysBetween } from "@shared/crmExpenses";
import type { CrmBillingInterval } from "@shared/crmExpenses";
import type { CrmExpense, CrmExpenseCharge } from "@/types/crm";

const pad = (n: number) => String(n).padStart(2, "0");

function toIso(d: Date): string {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fromIso(date: string): Date {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

/** «2026-11» da «2026-10» e +1. */
export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** L'ultimo giorno del mese, «AAAA-MM-GG». */
export function lastDayOfMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return toIso(new Date(Date.UTC(y, m, 0)));
}

/** Un giorno in più o in meno. */
export function shiftDay(date: string, delta: number): string {
    const d = fromIso(date);
    d.setUTCDate(d.getUTCDate() + delta);
    return toIso(d);
}

export interface CalendarDay {
    date: string;
    day: number;
    inMonth: boolean;
}

/** Le settimane del mese da lunedì a domenica, con i giorni di confine. */
export function calendarDays(month: string): CalendarDay[] {
    const first = fromIso(`${month}-01`);
    const lead = (first.getUTCDay() + 6) % 7;
    const last = lastDayOfMonth(month);
    const days: CalendarDay[] = [];
    for (let date = shiftDay(`${month}-01`, -lead); ; date = shiftDay(date, 1)) {
        days.push({ date, day: Number(date.slice(8)), inMonth: date.slice(0, 7) === month });
        if (date >= last && days.length % 7 === 0) break;
    }
    return days;
}

/** Gli addebiti di ogni giorno. */
export function chargesByDay(charges: CrmExpenseCharge[]): Map<string, CrmExpenseCharge[]> {
    const map = new Map<string, CrmExpenseCharge[]>();
    for (const c of charges) map.set(c.chargedOn, [...(map.get(c.chargedOn) ?? []), c]);
    return map;
}

/** Il rinnovo prima di `next`: un mese o un anno indietro (col giorno del mese che c'è). */
export function previousChargeOn(next: string, interval: CrmBillingInterval): string {
    const [y, m, d] = next.split("-").map(Number);
    const months = interval === "year" ? 12 : 1;
    const target = new Date(Date.UTC(y, m - 1 - months, 1));
    const last = Number(lastDayOfMonth(`${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}`).slice(8));
    target.setUTCDate(Math.min(d, last));
    return toIso(target);
}

/** Quanto manca al rinnovo, da 0 (appena pagato) a 1 (si rinnova oggi). */
export function renewalProgress(next: string, interval: CrmBillingInterval, today: string): number {
    const prev = previousChargeOn(next, interval);
    const total = daysBetween(prev, next);
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, daysBetween(prev, today) / total));
}

export interface OneOffMonth {
    month: string;
    totalCents: number;
    expenses: CrmExpense[];
}

/** Le spese una tantum per mese, dal più recente; dentro il mese, dalla più cara. */
export function oneOffByMonth(expenses: CrmExpense[]): OneOffMonth[] {
    const map = new Map<string, OneOffMonth>();
    for (const e of expenses) {
        if (e.kind !== "one_off" || !e.paid_on) continue;
        const month = e.paid_on.slice(0, 7);
        const row = map.get(month) ?? { month, totalCents: 0, expenses: [] };
        row.totalCents += e.amount_cents;
        row.expenses.push(e);
        map.set(month, row);
    }
    return [...map.values()]
        .sort((a, b) => (a.month < b.month ? 1 : -1))
        .map(m => ({ ...m, expenses: m.expenses.sort((a, b) => b.amount_cents - a.amount_cents) }));
}
