// Allergeni UE (Reg. 1169/2011, Allegato II) — sorgente unica dei 14 per il
// PDF: numero (ordinamento interno, mai mostrato dopo Stage 4c), code
// piattaforma e label IT hardcoded (la legenda mostra TUTTI e 14, anche gli
// assenti dal menù: label uniformi, non mischiate coi label DB).
export type EuAllergen = {
    code: string;
    euNumber: number;
    label: string;
};

export const ALL_ALLERGENS: EuAllergen[] = [
    { code: "gluten", euNumber: 1, label: "Glutine" },
    { code: "crustaceans", euNumber: 2, label: "Crostacei" },
    { code: "eggs", euNumber: 3, label: "Uova" },
    { code: "fish", euNumber: 4, label: "Pesce" },
    { code: "peanuts", euNumber: 5, label: "Arachidi" },
    { code: "soybeans", euNumber: 6, label: "Soia" },
    { code: "milk", euNumber: 7, label: "Latte" },
    { code: "nuts", euNumber: 8, label: "Frutta a guscio" },
    { code: "celery", euNumber: 9, label: "Sedano" },
    { code: "mustard", euNumber: 10, label: "Senape" },
    { code: "sesame", euNumber: 11, label: "Sesamo" },
    { code: "sulphites", euNumber: 12, label: "Solfiti" },
    { code: "lupin", euNumber: 13, label: "Lupini" },
    { code: "molluscs", euNumber: 14, label: "Molluschi" }
];

/** Sotto questa copertura la pagina finale aggiunge una riga di cautela sui non evidenziati. */
export const ALLERGEN_COVERAGE_THRESHOLD = 0.5;

export const ALLERGEN_EU_NUMBER: Record<string, number> = Object.fromEntries(
    ALL_ALLERGENS.map(a => [a.code, a.euNumber])
);

export function euNumberForCode(code: string): number | null {
    return ALLERGEN_EU_NUMBER[code] ?? null;
}
