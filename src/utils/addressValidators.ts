// =============================================================================
// addressValidators — format checks for Italian postal addresses.
// Single source of truth for the Italian province (sigla automobilistica) set.
// Bias is toward permissiveness: better to accept a historical/abolished sigla
// than to reject a valid Italian address.
// =============================================================================

/**
 * Canonical set of Italian province codes (sigle automobilistiche, 2 letters).
 * 107 current provinces + 4 abolished Sardinian provinces (CI, VS, OG, OT) still
 * found on legacy documents — kept for permissiveness. = 111 entries.
 */
export const PROVINCE_SIGLE_IT: ReadonlySet<string> = new Set([
    // Current 107 provinces
    "AG", "AL", "AN", "AO", "AR", "AP", "AT", "AV",
    "BA", "BT", "BL", "BN", "BG", "BI", "BO", "BZ", "BS", "BR",
    "CA", "CL", "CB", "CE", "CT", "CZ", "CH", "CO", "CS", "CR", "KR", "CN",
    "EN", "FM", "FE", "FI", "FG", "FC", "FR",
    "GE", "GO", "GR",
    "IM", "IS", "AQ", "SP", "LT", "LE", "LC", "LI", "LO", "LU",
    "MC", "MN", "MS", "MT", "ME", "MI", "MO", "MB",
    "NA", "NO", "NU", "OR",
    "PD", "PA", "PR", "PV", "PG", "PU", "PE", "PC", "PI", "PT", "PN", "PZ", "PO",
    "RG", "RA", "RC", "RE", "RI", "RN", "RM", "RO",
    "SA", "SS", "SV", "SI", "SR", "SO", "SU",
    "TA", "TE", "TR", "TO", "TP", "TN", "TV", "TS",
    "UD", "VA", "VE", "VB", "VC", "VR", "VV", "VI", "VT",
    // Abolished Sardinian provinces (still on legacy documents)
    "CI", "VS", "OG", "OT",
]);

/**
 * Italian CAP: exactly 5 digits. Catches the 4-digit case of a foreign address
 * auto-filled by the autocomplete.
 */
export function isValidCapIT(cap: string): boolean {
    return /^\d{5}$/.test(cap.trim());
}

/**
 * Italian province: 2-letter sigla in the canonical set (case-insensitive).
 * Empty / non-Italian sigle return false.
 */
export function isValidProvinciaIT(sigla: string): boolean {
    return PROVINCE_SIGLE_IT.has(sigla.trim().toUpperCase());
}
