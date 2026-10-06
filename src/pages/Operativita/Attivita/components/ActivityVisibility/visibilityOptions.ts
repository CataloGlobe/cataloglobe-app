import type { ProductVisibilityState } from "@/services/supabase/activeCatalog";

// I tre stati con l'etichetta scritta (§19.4, D3): tre icone senza legenda
// visibile non si leggevano, e i filtri sopra erano già a parole.
export const VISIBILITY_OPTIONS: { value: ProductVisibilityState; label: string }[] = [
    { value: "visible", label: "Visibile" },
    { value: "hidden", label: "Nascosto" },
    { value: "unavailable", label: "Non disponibile" }
];

// Con la spiegazione la prima voce dice cosa fa davvero (§19.4): toglie la
// modifica a mano e torna a quello che dicono le regole, che può essere
// «nascosto». Chiamarla «Visibile» sarebbe falso; la riga dice dove porta.
export const EXPLAINED_OPTIONS: { value: ProductVisibilityState; label: string }[] = [
    { value: "visible", label: "Come dice la regola" },
    { value: "hidden", label: "Nascosto" },
    { value: "unavailable", label: "Non disponibile" }
];

// Sotto 768 «Come dice la regola» non sta nella riga con le altre due (§50.20):
// a vista «Regola», il nome intero resta il nome accessibile.
export const EXPLAINED_OPTIONS_SHORT = EXPLAINED_OPTIONS.map(option =>
    option.value === "visible" ? { ...option, label: "Regola", ariaLabel: option.label } : option
);
