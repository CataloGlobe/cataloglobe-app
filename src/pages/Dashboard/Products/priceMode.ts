// Logica pura della card "Prezzo" (tab Prezzi & Opzioni) — estratta dal
// componente perche' i test Vitest girano in `environment: node` e non
// possono importare alberi UI .tsx.

export type PriceMode = "unico" | "formato";

/**
 * Modalita' effettiva della card Prezzo.
 * La derivazione dai dati (`hasPrimaryGroup`) resta autoritativa: l'override
 * locale serve solo alla finestra in cui l'utente ha scelto "Prezzo per
 * formato" ma non ha ancora inserito il primo formato (il gruppo
 * PRIMARY_PRICE nasce insieme al suo primo valore, mai vuoto).
 */
export function resolvePriceMode(
    modeOverride: PriceMode | null,
    hasPrimaryGroup: boolean
): PriceMode {
    return modeOverride ?? (hasPrimaryGroup ? "formato" : "unico");
}

/**
 * Il modale "I formati inseriti verranno eliminati" ha senso solo se c'e'
 * davvero qualcosa da perdere: gruppo esistente CON almeno un valore.
 */
export function shouldConfirmRevertToUnico(
    group: { values: unknown[] } | null
): boolean {
    return group !== null && group.values.length > 0;
}
