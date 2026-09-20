import { isValidPartitaIva, isValidCodiceFiscale } from "@/utils/fiscalValidators";
import { isValidCapIT, isValidProvinciaIT } from "@/utils/addressValidators";
import { BILLING_FIELD_MAX } from "@/components/Businesses/CreateBusinessWizard/steps/billingLimits";
import type { TenantBillingDetails, TenantFiscalProfile } from "@/services/supabase/tenants";
import type { LegalEntityType } from "@/types/tenant";

/**
 * Bozza modificabile dei dati di fatturazione (tutte stringhe controllate).
 *
 * Nasce per la sezione "Dati di fatturazione" di BusinessSettingsPage, dove un
 * owner corregge i campi DOPO la creazione. La regola di validazione rispecchia
 * quella del wizard (`StepBilling`/`canProceedFromStepBilling`) ma NON ne riusa
 * il codice: qui non c'è stato di wizard, solo un draft della pagina.
 */
export interface BillingDraft {
    entityType: LegalEntityType | "";
    legalName: string;
    vatNumber: string;
    fiscalCode: string;
    firstName: string;
    lastName: string;
    pec: string;
    codiceDestinatario: string;
    address: string;
    streetNumber: string;
    postalCode: string;
    city: string;
    province: string;
    /** Conservato dal profilo esistente; default "IT" se assente. */
    country: string;
}

const s = (v: string | null | undefined): string => (v ?? "").toString();

/** Draft dai campi fiscali del tenant (null → ""). */
export function billingDraftFromProfile(p: TenantFiscalProfile): BillingDraft {
    return {
        entityType: (p.legal_entity_type ?? "") as LegalEntityType | "",
        legalName: s(p.legal_name),
        vatNumber: s(p.vat_number),
        fiscalCode: s(p.fiscal_code),
        firstName: s(p.first_name),
        lastName: s(p.last_name),
        pec: s(p.pec),
        codiceDestinatario: s(p.codice_destinatario),
        address: s(p.address),
        streetNumber: s(p.street_number),
        postalCode: s(p.postal_code),
        city: s(p.city),
        province: s(p.province),
        country: s(p.country) || "IT"
    };
}

/** Payload per `updateTenantBillingDetails` (trim, "" → null; country default "IT"). */
export function billingDraftToPayload(d: BillingDraft): TenantBillingDetails {
    const t = (v: string): string | null => (v.trim().length > 0 ? v.trim() : null);
    return {
        legal_entity_type: (d.entityType || null) as LegalEntityType | null,
        legal_name: t(d.legalName),
        vat_number: t(d.vatNumber),
        fiscal_code: t(d.fiscalCode),
        first_name: t(d.firstName),
        last_name: t(d.lastName),
        pec: t(d.pec),
        codice_destinatario: t(d.codiceDestinatario),
        address: t(d.address),
        street_number: t(d.streetNumber),
        postal_code: t(d.postalCode),
        city: t(d.city),
        province: t(d.province),
        country: d.country.trim() || "IT"
    };
}

/** Con una P.IVA valorizzata serve un recapito e-fattura (SDI o PEC). */
export function billingRecipientRequired(d: BillingDraft): boolean {
    return d.vatNumber.trim().length > 0;
}

function lengthsOk(d: BillingDraft): boolean {
    return (
        d.legalName.trim().length <= BILLING_FIELD_MAX.legalName &&
        d.firstName.trim().length <= BILLING_FIELD_MAX.firstName &&
        d.lastName.trim().length <= BILLING_FIELD_MAX.lastName &&
        d.codiceDestinatario.trim().length <= BILLING_FIELD_MAX.codiceDestinatario &&
        d.pec.trim().length <= BILLING_FIELD_MAX.pec &&
        d.address.trim().length <= BILLING_FIELD_MAX.address &&
        d.streetNumber.trim().length <= BILLING_FIELD_MAX.streetNumber &&
        d.city.trim().length <= BILLING_FIELD_MAX.city
    );
}

/**
 * Draft salvabile: stesse regole del wizard.
 *   - indirizzo completo (via, CAP valido, comune, provincia valida)
 *   - societa: P.IVA valida + ragione sociale (+ CF valido se presente)
 *   - professionista: P.IVA valida + CF valido + nome + cognome
 *   - associazione: CF valido + denominazione (+ P.IVA valida se presente)
 *   - con P.IVA: recapito (SDI o PEC) obbligatorio
 *   - lunghezze entro i massimi
 */
export function isBillingDraftComplete(d: BillingDraft): boolean {
    if (!lengthsOk(d)) return false;

    const addressOk =
        d.address.trim().length > 0 &&
        isValidCapIT(d.postalCode) &&
        d.city.trim().length > 0 &&
        isValidProvinciaIT(d.province);
    if (!addressOk) return false;

    const vatFilled = d.vatNumber.trim().length > 0;
    const cfFilled = d.fiscalCode.trim().length > 0;
    const vatFormatOk = !vatFilled || isValidPartitaIva(d.vatNumber);
    const cfFormatOk = !cfFilled || isValidCodiceFiscale(d.fiscalCode);

    if (billingRecipientRequired(d)) {
        const recipientOk =
            d.codiceDestinatario.trim().length > 0 || d.pec.trim().length > 0;
        if (!recipientOk) return false;
    }

    switch (d.entityType) {
        case "societa":
            return vatFilled && isValidPartitaIva(d.vatNumber) && d.legalName.trim().length > 0 && cfFormatOk;
        case "professionista":
            return (
                vatFilled &&
                isValidPartitaIva(d.vatNumber) &&
                cfFilled &&
                isValidCodiceFiscale(d.fiscalCode) &&
                d.firstName.trim().length > 0 &&
                d.lastName.trim().length > 0
            );
        case "associazione":
            return cfFilled && isValidCodiceFiscale(d.fiscalCode) && d.legalName.trim().length > 0 && vatFormatOk;
        default:
            return false;
    }
}
