import { timingSafeEqual } from "node:crypto";

/**
 * Confronto a tempo costante di due stringhe (es. secret Bearer vs atteso).
 *
 * `crypto.timingSafeEqual` LANCIA se i due buffer hanno lunghezza diversa,
 * quindi va gestita prima. Scelta: length-mismatch → `false` immediato.
 *
 * Trade-off del length-check: rivela SOLO la lunghezza del secret atteso, non i
 * suoi byte. Per un secret ad alta entropia (CRON_SECRET) è accettabile — la
 * lunghezza non è materiale segreto sfruttabile. In cambio evitiamo di allocare
 * un buffer di riferimento fittizio a ogni chiamata. La parte sensibile (il
 * confronto byte-a-byte del contenuto) resta a tempo costante.
 */
export function timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
