import { supabase } from "./client";

/**
 * Dati parametrici dell'informativa privacy prenotazioni di una sede.
 *
 * Il testo NON passa da qui: vive lato pagina, nelle cinque lingue
 * (`ReservationPrivacyPage/notice.ts`). Questo servizio porta solo i fatti.
 */

export type ReservationPrivacyUnavailableReason =
    /** `tenants.legal_name` vuoto: il titolare del trattamento non è identificato. */
    | "missing_legal_name"
    /** Nessun recapito: né campo dedicato della sede, né email dell'owner. */
    | "missing_contact_email";

export type ReservationPrivacyData =
    | {
          available: true;
          venueName: string;
          legalName: string;
          address: string | null;
          contactEmail: string;
          /** Presente solo se la sede ha `phone_public = true`. */
          phone: string | null;
      }
    | {
          available: false;
          reason: ReservationPrivacyUnavailableReason;
          venueName: string;
      };

interface RawPayload {
    available?: unknown;
    reason?: unknown;
    venue_name?: unknown;
    legal_name?: unknown;
    address?: unknown;
    contact_email?: unknown;
    phone?: unknown;
}

function asString(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Legge i dati dell'informativa per lo slug della sede.
 *
 * Lancia su 404 / rete / 5xx: la pagina distingue "il locale non ha completato
 * i dati" (risposta 200 con `available: false`, che è uno stato legittimo da
 * comunicare al cliente) da "non ho potuto chiedere" (errore tecnico). I due
 * casi hanno messaggi diversi perché sono problemi di persone diverse.
 */
export async function getReservationPrivacyData(
    slug: string
): Promise<ReservationPrivacyData> {
    const { data, error } = await supabase.functions.invoke<RawPayload>(
        "resolve-reservation-privacy",
        { body: { slug } }
    );

    if (error) throw error;
    if (!data) throw new Error("EMPTY_PAYLOAD");

    if (data.available !== true) {
        const reason: ReservationPrivacyUnavailableReason =
            data.reason === "missing_contact_email"
                ? "missing_contact_email"
                : "missing_legal_name";
        return { available: false, reason, venueName: asString(data.venue_name) };
    }

    return {
        available: true,
        venueName: asString(data.venue_name),
        legalName: asString(data.legal_name),
        address: asNullableString(data.address),
        contactEmail: asString(data.contact_email),
        phone: asNullableString(data.phone)
    };
}
