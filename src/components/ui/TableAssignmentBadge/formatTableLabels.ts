// Fuori dal file del componente per la regola react-refresh (solo componenti
// esportati da un .tsx): la stessa frase serve anche al `title` delle chip
// della vista Settimana, al drawer e ai messaggi di conflitto.

// Molte sale etichettano i tavoli come "Tavolo 4" invece di "4": il prefisso
// non va raddoppiato ("Tavolo Tavolo 4"). Si toglie la parola dall'etichetta
// e la si rimette una volta sola, al singolare o al plurale.
const TABLE_WORD = /^tavol[oi]\s+/i;

/** "Tavolo 4" → "4"; "4" → "4"; "Dehor A" → "Dehor A". */
export function bareTableLabel(label: string): string {
    return label.replace(TABLE_WORD, "").trim();
}

/** "Tavolo 3" · "Tavoli 3 + 4" · "Tavoli 3 + 4 + 5" */
export function formatTableLabels(labels: string[]): string {
    if (labels.length === 0) return "";
    const bare = labels.map(bareTableLabel);
    if (bare.length === 1) return `Tavolo ${bare[0]}`;
    return `Tavoli ${bare.join(" + ")}`;
}
