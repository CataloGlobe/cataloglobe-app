// =============================================================================
// fiscalValidators — format-only checks for Italian fiscal identifiers.
// No VIES / Agenzia delle Entrate lookups: shape + check digit only.
// =============================================================================

/**
 * Validate an Italian Partita IVA (VAT number).
 * Rules: exactly 11 digits + Luhn-style check digit (last digit included in sum).
 */
export function isValidPartitaIva(value: string): boolean {
    const s = value.replace(/\s/g, "");
    if (!/^\d{11}$/.test(s)) return false;

    let sum = 0;
    for (let i = 0; i < 11; i++) {
        let n = s.charCodeAt(i) - 48; // '0' => 0
        if (i % 2 === 1) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
    }
    return sum % 10 === 0;
}

/**
 * Validate an Italian Codice Fiscale (format only).
 * Accepts either:
 *  - persona fisica: 16 chars `LLLLLLNNLNNLNNNL` (6 letters, structured)
 *  - ente / organizzazione: 11 numeric digits
 */
export function isValidCodiceFiscale(value: string): boolean {
    const s = value.replace(/\s/g, "").toUpperCase();

    // Ente: 11 numeric digits.
    if (/^\d{11}$/.test(s)) return true;

    // Persona fisica: structured 16-char alphanumeric layout.
    return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(s);
}
