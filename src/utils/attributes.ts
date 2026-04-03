export function getDisplayValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === "boolean") return value ? "Sì" : "No";

    if (typeof value === "number") return value.toString();

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(", ") : null;
    }

    return null;
}
