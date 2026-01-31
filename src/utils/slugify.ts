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
