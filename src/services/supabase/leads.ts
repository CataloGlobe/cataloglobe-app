/**
 * Contatti dal form «Richiedi una demo» della landing di campagna.
 *
 * Solo l'edge function pubblica `submit-lead` (verify_jwt=false): la tabella
 * `leads` non ha policy per il client, valida e scrive tutto il server.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type { LeadField, LeadFieldError, LeadInterest } from "@/utils/leadValidation";

export type SubmitLeadInput = {
    name: string;
    venue_name: string;
    phone: string;
    email?: string;
    interests: LeadInterest[];
    /** La prova del consenso (versione dell'informativa, ora) la scrive il server. */
    consent: boolean;
    variant: string;
    /** Honeypot: campo nascosto, resta vuoto per le persone. */
    website?: string;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    referrer?: string | null;
    landing_path?: string | null;
};

export type SubmitLeadErrorCode = "INVALID_PAYLOAD" | "RATE_LIMITED" | "SERVER_ERROR";

export class SubmitLeadError extends Error {
    readonly code: SubmitLeadErrorCode;
    /** Errori per campo quando il server rifiuta la validazione. */
    readonly fields: Partial<Record<LeadField, LeadFieldError>>;

    constructor(code: SubmitLeadErrorCode, fields: Partial<Record<LeadField, LeadFieldError>> = {}) {
        super(code);
        this.name = "SubmitLeadError";
        this.code = code;
        this.fields = fields;
    }
}

/**
 * Invia il contatto. Errori: `SubmitLeadError` con `code`
 *   INVALID_PAYLOAD → 400, `fields` con gli errori per campo
 *   RATE_LIMITED    → 429, troppi invii dallo stesso IP nell'ora
 *   SERVER_ERROR    → 500 / rete / risposta inattesa
 */
export async function submitLead(input: SubmitLeadInput): Promise<void> {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean }>("submit-lead", { body: input });

    if (error) {
        let code: SubmitLeadErrorCode = "SERVER_ERROR";
        let fields: Partial<Record<LeadField, LeadFieldError>> = {};
        if (error instanceof FunctionsHttpError) {
            try {
                const body = (await error.context.clone().json()) as {
                    error_code?: unknown;
                    details?: { fields?: Partial<Record<LeadField, LeadFieldError>> };
                };
                if (body?.error_code === "INVALID_PAYLOAD" || body?.error_code === "RATE_LIMITED") code = body.error_code;
                fields = body?.details?.fields ?? {};
            } catch {
                // corpo non JSON: resta SERVER_ERROR
            }
        }
        throw new SubmitLeadError(code, fields);
    }

    if (!data?.success) throw new SubmitLeadError("SERVER_ERROR");
}
