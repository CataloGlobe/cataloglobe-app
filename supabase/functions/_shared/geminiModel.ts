// =============================================================================
// geminiModel — nome modello Gemini in uso (Edge-only)
// =============================================================================
//
// Fonte unica per la stringa modello, usata da menu-ai-import e
// product-ai-enrich in 3 punti ciascuna (URL fetch, logAiUsage, metadata di
// risposta). Cambiare SOLO qui al prossimo cambio modello — deve restare
// allineata a una entry di MODEL_PRICES in aiPricing.ts.
// =============================================================================

export const GEMINI_MODEL = "gemini-3.5-flash-lite";
