import type { Review } from "@/types/database";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * La media del voto settimana per settimana, nelle ultime `weeks` (la più
 * vecchia per prima). Le settimane senza recensioni si saltano; con meno di
 * due settimane piene non c'è niente da disegnare e torna vuoto.
 */
export function weeklyAverages(
  list: readonly Review[],
  now = Date.now(),
  weeks = 7,
): number[] {
  const sums = Array.from({ length: weeks }, () => ({ sum: 0, n: 0 }));
  for (const r of list) {
    const age = Math.floor((now - new Date(r.created_at).getTime()) / WEEK);
    if (age < 0 || age >= weeks) continue;
    const slot = sums[weeks - 1 - age];
    slot.sum += r.rating;
    slot.n += 1;
  }
  const out = sums
    .filter((s) => s.n > 0)
    .map((s) => Math.round((s.sum / s.n) * 10) / 10);
  return out.length >= 2 ? out : [];
}

/** Una linea morbida fra i punti (Catmull-Rom in curve di Bézier). */
export function smoothPath(points: readonly [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
}

