// Helper puro per la stima del peso del payload dell'import AI menu.
// ZERO import Deno (solo aritmetica) → importabile sia dall'edge function
// (Deno) sia da Vitest (node). Estratto dal guard inline di menu-ai-import
// (FASE 2) per renderlo testabile; semantica invariata.

export const MAX_DECODED_PAYLOAD_BYTES = 35 * 1024 * 1024;

/**
 * Stima i byte DECODIFICATI a partire dalla lunghezza delle stringhe base64
 * (~0.75x), evitando di materializzare i binari. Identico al calcolo inline
 * della FASE 2: Σ data.length * 0.75.
 */
export function estimateDecodedBytes(images: ReadonlyArray<{ data: string }>): number {
    return images.reduce((sum, img) => sum + img.data.length * 0.75, 0);
}

/**
 * True se il payload stimato supera la soglia (default MAX_DECODED_PAYLOAD_BYTES).
 * Backstop difesa-in-profondità per proteggere l'isolate dell'edge function.
 */
export function exceedsPayloadBudget(
    images: ReadonlyArray<{ data: string }>,
    maxBytes: number = MAX_DECODED_PAYLOAD_BYTES
): boolean {
    return estimateDecodedBytes(images) > maxBytes;
}
