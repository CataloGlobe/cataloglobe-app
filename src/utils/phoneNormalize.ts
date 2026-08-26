// ⚠️ SYNC: questo file è duplicato. L'altra copia è in
// supabase/functions/_shared/phoneNormalize.ts. Qualsiasi modifica va
// replicata in ENTRAMBI i file (stesso pattern di priceSummary.ts e
// resolveActivityCatalogs.ts). Unica differenza ammessa fra le due copie:
// lo specifier di import di libphonenumber-js (bundler qui, `npm:` in Deno).
//
// Canonicalizzazione del telefono cliente in E.164 (+393451559558).
// Il valore grezzo digitato dall'utente resta intatto in `customer_phone`:
// questa funzione produce SOLO la forma canonica salvata a fianco, pensata
// come chiave di lookup del profilo ospite.
//
// FAIL-SOFT: non lancia mai. Qualunque input non interpretabile → null.
// Una prenotazione non deve mai fallire per un numero che non sappiamo
// normalizzare.

import {
    isSupportedCountry,
    parsePhoneNumberFromString,
    type CountryCode
} from "libphonenumber-js";

/**
 * Paese assunto quando il numero NON è in forma internazionale.
 *
 * È una COSTANTE e non un dato letto dal DB per tre motivi:
 *
 *  1. `activities` non ha (ancora) un campo paese: l'indirizzo della sede è
 *     strutturato in address/city/province/postal_code e si ferma lì. Non
 *     esiste oggi una fonte corretta da cui derivare il paese della sede.
 *  2. NON usiamo `tenants.country`: è il paese dell'indirizzo di
 *     FATTURAZIONE, non quello della sede operativa, ed è oggi hardcodato a
 *     "IT" nel wizard di creazione azienda (`CreateBusinessWizard`). Leggerlo
 *     darebbe l'illusione di un dato configurato senza aggiungere alcuna
 *     correttezza, e maschererebbe il problema vero (punto 1).
 *  3. Il numero in forma internazionale (+39…, 0039…) ignora comunque questo
 *     valore: il default conta solo per i numeri scritti in forma nazionale.
 *
 * QUANDO `activities` AVRÀ UN CAMPO PAESE: leggerlo da lì e passarlo come
 * `defaultCountry`, tenendo questa costante come fallback per le sedi che non
 * l'hanno valorizzato. La firma della funzione è già pronta per farlo, non
 * serve toccare i chiamanti che non hanno il dato.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "IT";

/**
 * Converte un telefono grezzo nella sua forma canonica E.164, oppure null.
 *
 * @param raw            valore digitato dall'utente, in qualunque formato
 * @param defaultCountry paese assunto per i numeri in forma nazionale;
 *                       ignorato per i numeri in forma internazionale.
 *                       Valore assente o non riconosciuto → DEFAULT_PHONE_COUNTRY.
 */
export function normalizePhoneToE164(
    raw: string | null | undefined,
    defaultCountry?: string | null
): string | null {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length === 0) return null;

    const country: CountryCode =
        typeof defaultCountry === "string" && isSupportedCountry(defaultCountry)
            ? defaultCountry
            : DEFAULT_PHONE_COUNTRY;

    try {
        const parsed = parsePhoneNumberFromString(trimmed, country);
        if (!parsed || !parsed.isValid()) return null;
        // `.number` è già E.164 (`+` + prefisso + numero, nessun separatore).
        return parsed.number;
    } catch {
        // parsePhoneNumberFromString non dovrebbe lanciare (a differenza di
        // parsePhoneNumberWithError), ma il contratto fail-soft di questo
        // modulo non deve dipendere da quel dettaglio della libreria.
        return null;
    }
}
