/**
 * Valida che il path sia interno all'app (previene open redirect).
 * Deve iniziare con / ma non con //, senza protocolli, backslash o caratteri
 * di controllo (il parser degli URL trasforma «/\x» in «//x»).
 */
export function isInternalPath(path: unknown): path is string {
    if (typeof path !== "string" || path.length === 0) return false;
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return false;
    // eslint-disable-next-line no-control-regex
    if (/[\\\u0000-\u001f]/.test(path)) return false;
    return true;
}

/** Pagine di accesso: dopo il login non si torna lì. */
const AUTH_PATHS = ["/login", "/verify-otp"];

/** Il deep link da cui si è arrivati al login, se è interno; altrimenti `fallback`. */
export function internalPathOr(path: unknown, fallback: string): string {
    if (!isInternalPath(path)) return fallback;
    const pathname = path.split(/[?#]/)[0];
    if (AUTH_PATHS.includes(pathname)) return fallback;
    return path;
}
