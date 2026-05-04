export function isValidLangFormat(lang: string | undefined | null): boolean {
    if (!lang) return false;
    return /^[a-z]{2,5}$/i.test(lang);
}
