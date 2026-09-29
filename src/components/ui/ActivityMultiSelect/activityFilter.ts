/** Sopra quante sedi compare la ricerca: fino a 8 la lista si legge a colpo d'occhio. */
export const ACTIVITY_SEARCH_THRESHOLD = 8;

function fold(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Le sedi il cui nome contiene la ricerca, senza badare a maiuscole e accenti. */
export function filterActivityOptions<T extends { name: string }>(options: T[], query: string): T[] {
    const needle = fold(query);
    if (!needle) return options;
    return options.filter(option => fold(option.name).includes(needle));
}
