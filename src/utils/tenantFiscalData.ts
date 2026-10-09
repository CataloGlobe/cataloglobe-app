import { BILLING_FIELD_MAX } from "@/components/Businesses/CreateBusinessWizard/steps/billingLimits";
import { billingRecipientRequired, hasBillingRecipient } from "@/pages/Business/components/billingDraft";
import type { TenantFiscalProfile } from "@/services/supabase/tenants";

/**
 * True when the tenant already carries the fiscal identity required for its
 * entity type. Drives whether the billing step is shown in resume flow
 * (CreateBusinessWizard) and whether SubscriptionPage may start a checkout.
 *
 * Un campo oltre `BILLING_FIELD_MAX` conta come dato MANCANTE, non come dato
 * presente: quei valori fanno rifiutare il customer da Stripe e bloccano il
 * checkout, quindi il resume deve ripassare da StepBilling (precompilato) e
 * obbligare l'utente a correggerli.
 */
export function tenantHasFiscalData(t: TenantFiscalProfile): boolean {
    if (!t.legal_entity_type) return false;
    // Presente E entro il limite: fuori limite equivale ad assente.
    const has = (v: string | null | undefined, max: number) => {
        const trimmed = v?.trim() ?? "";
        return trimmed.length > 0 && trimmed.length <= max;
    };
    const within = (v: string | null | undefined, max: number) => (v?.trim().length ?? 0) <= max;

    // Identity without a minimal legal address is incomplete for invoicing.
    const addressOk =
        has(t.address, BILLING_FIELD_MAX.address) &&
        !!t.postal_code?.trim() &&
        has(t.city, BILLING_FIELD_MAX.city) &&
        !!t.province?.trim() &&
        within(t.street_number, BILLING_FIELD_MAX.streetNumber);
    if (!addressOk) return false;

    // Campi facoltativi: se valorizzati devono comunque stare nei limiti.
    const optionalsOk =
        within(t.codice_destinatario, BILLING_FIELD_MAX.codiceDestinatario) &&
        within(t.pec, BILLING_FIELD_MAX.pec);
    if (!optionalsOk) return false;

    // Con una P.IVA serve un recapito e-fattura, come in Impostazioni e nel
    // gate di stripe-checkout: senza, il resume salterebbe Fatturazione e il
    // checkout risponderebbe `missing_einvoice_recipient`.
    const recipientOk =
        !billingRecipientRequired({ vatNumber: t.vat_number ?? "" }) ||
        hasBillingRecipient({ codiceDestinatario: t.codice_destinatario ?? "", pec: t.pec ?? "" });
    if (!recipientOk) return false;

    switch (t.legal_entity_type) {
        case "societa":
            return !!t.vat_number?.trim() && has(t.legal_name, BILLING_FIELD_MAX.legalName);
        case "professionista":
            return (
                !!t.vat_number?.trim() &&
                !!t.fiscal_code?.trim() &&
                has(t.first_name, BILLING_FIELD_MAX.firstName) &&
                has(t.last_name, BILLING_FIELD_MAX.lastName) &&
                within(t.legal_name, BILLING_FIELD_MAX.legalName)
            );
        case "associazione":
            return !!t.fiscal_code?.trim() && has(t.legal_name, BILLING_FIELD_MAX.legalName);
        default:
            return false;
    }
}
