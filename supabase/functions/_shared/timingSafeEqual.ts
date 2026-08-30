// Constant-time string comparison for shared secrets.
//
// A plain `===` on a secret leaks its prefix: the comparison exits at the first
// differing byte, so a caller who can time the response can recover the value
// one character at a time. The cost of doing it right is a loop over a handful
// of bytes, once per request.
//
// ⚠️ A byte-identical copy of this function still lives inline in
// `process-translation-jobs/index.ts`, which predates this module. Merging the
// two means editing a working authentication path outside the scope that
// created this file, so it is left as a deliberate, visible duplication rather
// than an unnoticed one. Consolidate when that function is next touched.

/**
 * Compares two strings without an early exit.
 *
 * Length differences are folded into the same accumulator instead of returning
 * early, so a wrong-length guess is not distinguishable from a wrong-value one.
 * The loop always runs over the longer of the two.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length === bBytes.length ? 0 : 1;
    for (let i = 0; i < maxLen; i++) {
        const x = i < aBytes.length ? aBytes[i] : 0;
        const y = i < bBytes.length ? bBytes[i] : 0;
        diff |= x ^ y;
    }
    return diff === 0;
}
