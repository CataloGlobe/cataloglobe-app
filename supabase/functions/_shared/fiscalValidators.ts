// =============================================================================
// ⚠️ SYNC — mirror di src/utils/fiscalValidators.ts (stessa logica, stesso
// check digit). Il check-digit P.IVA esiste in 3 posti: questi due file .ts +
// la funzione SQL public.is_valid_partita_iva (migration
// 20260923120000_is_valid_partita_iva.sql), usata dal CHECK
// tenants_vat_number_valid e dalla RPC update_tenant_billing_details.
// Cambiando l'algoritmo, aggiorna i due .ts nello stesso commit e aggiungi una
// NUOVA migration per la funzione SQL. Qui vive solo la validazione P.IVA (gate
// server-side di stripe-checkout); il codice fiscale resta lato FE.
//
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
