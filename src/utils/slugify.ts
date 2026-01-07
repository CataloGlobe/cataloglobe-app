export function generateSlug(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-") // spazi e underscore -> trattino
        .replace(/[^a-z0-9-]/g, "") // mantiene solo lettere, numeri e trattini
        .replace(/--+/g, "-") // comprime doppie lineette
        .replace(/^-+/, "") // rimuove trattini iniziali
        .replace(/-+$/, ""); // rimuove trattini finali
}

export function generateRandomSuffix(length = 4): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * chars.length);
        result += chars[index];
    }

    return result;
}

export function sanitizeSlugForSave(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-") // spazi → trattini
        .replace(/[^a-z0-9-]/g, "") // rimuove caratteri speciali
        .replace(/-+/g, "-") // comprime trattini multipli
        .replace(/^-+/, "") // rimuove trattini iniziali
        .replace(/-+$/, ""); // rimuove trattini finali
}
