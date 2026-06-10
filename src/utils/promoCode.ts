const SESSION_KEY = "cg_promo";

export function capturePromoFromUrl(searchParams: URLSearchParams): void {
    const raw = searchParams.get("promo");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, code);
}

export function getStoredPromo(): string | undefined {
    return sessionStorage.getItem(SESSION_KEY) ?? undefined;
}

export function clearStoredPromo(): void {
    sessionStorage.removeItem(SESSION_KEY);
}
