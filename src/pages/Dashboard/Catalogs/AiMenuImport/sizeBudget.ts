import { MAX_IMAGE_SIZE, MAX_PDF_SIZE, MAX_TOTAL_SIZE } from "./aiImportLimits";

/**
 * Helper puro e DOM-free per il partizionamento dei file dell'import AI menu
 * secondo i cap di dimensione. Estratto dalla logica inline di UploadStep
 * (FASE 2) per renderlo node-testabile: niente dipendenza dalla classe `File`,
 * input tipizzati strutturalmente, generico `T` per restituire al chiamante i
 * suoi oggetti originali.
 *
 * Semantica replicata 1:1 dalla FASE 2:
 * - cap per-tipo dal MIME (PDF → MAX_PDF_SIZE, altrimenti MAX_IMAGE_SIZE);
 * - i file che sforano il cap per-tipo sono rifiutati e NON consumano il budget;
 * - cap aggregato: parte da Σ existing.size, accumula gli accettati;
 * - overflow aggregato = SKIP-AND-CONTINUE (un candidato che non entra viene
 *   scartato, ma i successivi più piccoli possono ancora rientrare);
 * - ordine di input preservato negli accettati.
 */

export type SizeRejectReason = "image_too_large" | "pdf_too_large" | "aggregate_exceeded";

export interface SizeRejection<T> {
    file: T;
    reason: SizeRejectReason;
}

export function partitionBySizeBudget<T extends { size: number; type: string }>(
    existing: ReadonlyArray<{ size: number }>,
    candidates: ReadonlyArray<T>
): { accepted: T[]; rejected: SizeRejection<T>[] } {
    const accepted: T[] = [];
    const rejected: SizeRejection<T>[] = [];

    let runningTotal = existing.reduce((sum, f) => sum + f.size, 0);

    for (const candidate of candidates) {
        const isPdf = candidate.type === "application/pdf";
        const perFileCap = isPdf ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;

        if (candidate.size > perFileCap) {
            rejected.push({ file: candidate, reason: isPdf ? "pdf_too_large" : "image_too_large" });
            continue;
        }

        if (runningTotal + candidate.size <= MAX_TOTAL_SIZE) {
            accepted.push(candidate);
            runningTotal += candidate.size;
        } else {
            rejected.push({ file: candidate, reason: "aggregate_exceeded" });
        }
    }

    return { accepted, rejected };
}
