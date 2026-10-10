/** Solo cifre, al massimo `length`: «482 913», «Codice: 482913» e simili diventano «482913». */
export function sanitizeCode(raw: string, length: number): string {
    return raw.replace(/\D/g, "").slice(0, length);
}
