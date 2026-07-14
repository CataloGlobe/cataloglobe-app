/**
 * Per-icon scale factor applied ONLY when an icon is shown inside the circular
 * chip container (Style Editor iconStyle = "pill"). In plain / bare mode no
 * scaling is applied — there is no fixed circle to fill optically.
 *
 * Rationale: all 45 icons already have a normalized bounding box (~90–94% of
 * their square), but the bounding box measures the drawing *outline*, not the
 * actual *ink* (filled/traced surface) inside it. Thin, elongated shapes
 * (peppers, wine, dropper…) look emptier inside the circle than compact ones
 * (trending chart, clock) even at the same bounding-box size.
 *
 * These factors were computed by rasterizing each icon at render size inside
 * the chip's circular mask and measuring the % of inked pixels, then scaling
 * the under-benchmark icons up to the reference ink range (benchmarks: clock /
 * signature / trending-up). Safety constraint: the scaled drawing never exceeds
 * 92% of the circle diameter, so it can't touch/overflow the chip border.
 *
 * Keys: characteristic icons use their `custom:<name>` id (same string
 * CharacteristicIcon receives); allergen icons would use their bare `code`.
 * Icons not listed here are already balanced → factor 1 (no scaling).
 */
export const CHIP_SCALE_OVERRIDES: Record<string, number> = {
    "custom:coravin-drop": 1.13,
    "custom:fish-leaf": 1.12,
    "custom:pepper-3": 1.12,
    "custom:pepper-2": 1.1,
    "custom:pepper-1": 1.07,
    "custom:wine": 1.05,
    "custom:award": 1.04,
    "custom:organic-leaf": 1.02,
    "custom:raw-fish": 1.02,
    "custom:sparkles": 1.02
};

/** Returns the chip-mode scale for an icon key, or 1 if already balanced. */
export function getChipScale(key: string): number {
    return CHIP_SCALE_OVERRIDES[key] ?? 1;
}
