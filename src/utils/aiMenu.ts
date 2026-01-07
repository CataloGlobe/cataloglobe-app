// src/types/aiMenu.ts

// Allergen "logici" che l'AI può usare.
// Adatta/aggiungi in base a come li gestisci nel DB.
export type ParsedAllergen =
    | "gluten"
    | "crustaceans"
    | "eggs"
    | "fish"
    | "peanuts"
    | "soy"
    | "milk"
    | "nuts"
    | "celery"
    | "mustard"
    | "sesame"
    | "sulphites"
    | "lupins"
    | "molluscs"
    | "altro";

// Un singolo piatto/voce di menu.
export type ParsedMenuItem = {
    /** ID temporaneo lato AI: lo useremo solo per mantenere i link tra categoria e item nella preview.
     * Nel DB userai gli ID reali (UUID di Supabase).
     */
    id: string;

    /** Nome del piatto così come appare nel menu. */
    name: string;

    /** Descrizione del piatto, se presente. */
    description?: string;

    /** Prezzo in formato numero, senza simbolo di valuta (es: 12.5). */
    price?: number;

    /** Valuta, default "EUR" se omessa. */
    currency?: string;

    /** Elenco allergeni principali, se riconoscibili. */
    allergens?: ParsedAllergen[];

    /** Note extra (es. "piatto vegetariano", "piatto del giorno"). */
    notes?: string;
};

// Una categoria del menu (Antipasti, Primi, Pizze, etc.)
export type ParsedMenuCategory = {
    /** ID temporaneo lato AI (come per gli item). */
    id: string;

    /** Nome della categoria (es. "Antipasti", "Secondi di carne"). */
    name: string;

    /** Eventuali note/descrizione della categoria. */
    notes?: string;

    /** Lista di piatti appartenenti a questa categoria. */
    items: ParsedMenuItem[];
};

// Il menu completo che l'AI restituisce.
export type ParsedMenu = {
    /** Lingua principale del menu, se rilevabile (es. "it", "en"). */
    language?: string;

    /** Elenco delle categorie estratte. */
    categories: ParsedMenuCategory[];
};
