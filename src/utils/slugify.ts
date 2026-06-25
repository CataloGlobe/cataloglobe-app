export function generateSlug(input: string): string {
    return (
        input
            .toLowerCase()
            .trim()
            // 🔑 separa lettere e accenti
            .normalize("NFD")
            // 🔑 rimuove SOLO gli accenti
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[\s_]+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/--+/g, "-")
            .replace(/^-+/, "")
            .replace(/-+$/, "")
    );
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

/**
 * Sanitizer PERMISSIVO per la digitazione live (onChange).
 * Identico a sanitizeSlugForSave MA senza collapse `--` e senza trim dei
 * trattini di bordo: permette stati intermedi legittimi come `isola-` mentre
 * l'utente continua a digitare. La forma canonica si ottiene a blur/submit via
 * sanitizeSlugForSave.
 */
export function sanitizeSlugForInput(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
}

export function sanitizeSlugForSave(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
}
