import type { PlanCode } from "@/types/plan";

/**
 * Features e badge di default per piano, usati dal PlanSeatsSelector quando
 * il chiamante non li passa esplicitamente. Tenuti fuori dal file del
 * componente per la regola react-refresh/only-export-components.
 */

export const DEFAULT_PLAN_FEATURES: Record<PlanCode, string[]> = {
    base: [
        "Menu digitale illimitato",
        "QR code per ogni sede",
        "Programmazione disponibilità",
        "Gestione catalogo (prodotti, categorie, varianti)",
        "Stili e branding personalizzati",
        "Multilingua",
        "Analitiche e recensioni"
    ],
    pro: [
        "Tutto del piano Base",
        "Prenotazione tavolo",
        "Ordinazione al tavolo",
        "Gestione sale e tavoli"
    ]
};

export const DEFAULT_PLAN_BADGES: Partial<Record<PlanCode, string>> = {
    pro: "Più scelto"
};
