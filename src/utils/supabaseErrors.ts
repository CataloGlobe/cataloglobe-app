export interface PostgrestErrorLike {
    code: string;
    message?: string;
    details?: string;
    hint?: string;
}

export function isPostgrestError(err: unknown): err is PostgrestErrorLike {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as { code: unknown }).code === "string"
    );
}

export function isPostgrestFKError(
    err: unknown
): err is PostgrestErrorLike & { code: "23503" } {
    return isPostgrestError(err) && err.code === "23503";
}
