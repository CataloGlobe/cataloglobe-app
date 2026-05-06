// Serializes an unknown error into a structured, JSON-safe object.
// Handles PostgrestError (plain object with code/message/details/hint),
// native Error, and arbitrary throwables.

export interface SerializedError {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
}

export function serializeError(err: unknown): SerializedError {
    if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        const rawMessage =
            typeof e.message === "string"
                ? e.message
                : safeJsonStringify(err);
        return {
            message: rawMessage,
            code: typeof e.code === "string" ? e.code : undefined,
            details: typeof e.details === "string" ? e.details : undefined,
            hint: typeof e.hint === "string" ? e.hint : undefined
        };
    }
    return { message: String(err) };
}

function safeJsonStringify(value: unknown): string {
    try {
        if (value instanceof Error) {
            return JSON.stringify(value, Object.getOwnPropertyNames(value));
        }
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

// Type guard for Postgres FK violation errors.
export function isFKViolation(
    err: unknown
): err is { code: "23503"; message?: string; details?: string } {
    return (
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: unknown }).code === "23503"
    );
}
