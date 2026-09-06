// @ts-nocheck
// =============================================================================
// purge-reservation-data — conservazione 36 mesi delle prenotazioni
// =============================================================================
//
// Invocata da pg_cron. Cancella i profili della rubrica la cui ultima
// prenotazione è oltre la soglia e anonimizza le prenotazioni collegate;
// stesso trattamento per le prenotazioni senza profilo.
//
// Esiste perché l'informativa privacy dichiara un periodo di conservazione:
// dichiararlo senza cancellare nulla è una promessa verificabile e non
// mantenuta.
//
// AUTENTICAZIONE — fail-CLOSED, sul modello di `process-translation-jobs`:
// segreto assente dall'env ⇒ 401. NON il pattern di `purge-tenants`, che se il
// segreto non è configurato logga e prosegue, lasciando aperto un endpoint di
// cancellazione.
//
// DRY-RUN DI DEFAULT: senza `{"dry_run": false}` esplicito nel body questa
// funzione non scrive nulla, riporta solo cosa cancellerebbe. La modalità
// distruttiva va chiesta, non ereditata da una dimenticanza.
//
// Logica pura (ordine delle operazioni, raggruppamento per tenant, limiti) in
// `_shared/reservationRetention.ts`, testata in `src/tests/reservationRetention.test.ts`.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    ANONYMIZED_PLACEHOLDER,
    retentionCutoffDate,
    runRetentionTick,
    type RetentionStore
} from "../_shared/reservationRetention.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("RESERVATION_RETENTION_SECRET")!;

/**
 * Mesi di conservazione dichiarati nell'informativa privacy (§7).
 *
 * 36 e non 24 per il ciclo stagionale: un locale turistico vede lo stesso
 * cliente una volta l'anno, e con due anni basta che ne salti uno per perdere
 * tutto lo storico. Tre anni coprono quel caso restando proporzionati alla
 * finalità dichiarata — riconoscere il cliente che torna.
 *
 * Costante di prodotto, NON un'impostazione della sede: il periodo dichiarato
 * nell'informativa e quello applicato dal job devono coincidere sempre, e un
 * ristoratore che li disallinea produce una promessa non mantenuta.
 *
 * ⚠️ SYNC: il §7 dell'informativa in `src/pages/ReservationPrivacyPage/notice.ts`
 * ripete questo numero in cinque lingue. Cambiarlo qui significa cambiarlo lì.
 */
const RETENTION_MONTHS = 36;

/** Tetti per esecuzione. Il superamento è LOGGATO, mai silenzioso. */
const MAX_GUESTS_PER_RUN = 500;
const MAX_ORPHAN_RESERVATIONS_PER_RUN = 2000;

// Confronto constant-time (no early-exit sul primo byte diverso, no leak via
// lunghezza) — stessa implementazione di process-translation-jobs.
function timingSafeEqualStr(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length === bBytes.length ? 0 : 1;
    for (let i = 0; i < maxLen; i++) {
        const x = i < aBytes.length ? aBytes[i] : 0;
        const y = i < bBytes.length ? bBytes[i] : 0;
        diff |= x ^ y;
    }
    return diff === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * Payload di anonimizzazione. UN SOLO oggetto, applicato in UN SOLO statement.
 *
 * ⚠️ `customer_phone_e164: null` NON È RIDONDANTE, ANCHE SE SEMBRA — e i motivi
 * sono due, entrambi coperti da test in src/tests/reservationRetention.test.ts.
 *
 * 1. QUELLA COLONNA È IL NUMERO DI TELEFONO, in forma canonica E.164. Non
 *    azzerarla significa lasciare in chiaro il dato personale che questo job
 *    esiste per rimuovere: `customer_phone` diventa il segnaposto e il numero
 *    vero resta lì accanto.
 *
 * 2. È L'UNICA VIA D'USCITA DAL TRIGGER `reservations_link_guest`, che è
 *    BEFORE INSERT OR UPDATE OF (tenant_id, customer_phone_e164, customer_name,
 *    customer_email): questo UPDATE tocca tre di quelle colonne, quindi il
 *    trigger SCATTA, e il suo corpo fa `INSERT … ON CONFLICT (tenant_id,
 *    phone_e164) DO UPDATE`. Con l'e164 valorizzato, un UPDATE che arrivi DOPO
 *    la cancellazione del profilo lo REINSERISCE dal numero della prenotazione.
 *    La guardia in testa al trigger —
 *      IF NEW.customer_phone_e164 IS NULL THEN NEW.guest_id := NULL; RETURN NEW;
 *    — evita l'INSERT del tutto e azzera `guest_id` sulla riga stessa.
 *
 * Corollario: mai spezzare questo UPDATE in due (prima i campi, poi l'e164), e
 * mai invertire l'ordine anonimizza → cancella.
 */
const ANONYMIZATION_PATCH = {
    customer_name: ANONYMIZED_PLACEHOLDER,
    customer_email: ANONYMIZED_PLACEHOLDER,
    customer_phone: ANONYMIZED_PLACEHOLDER,
    customer_phone_e164: null,
    notes: null,
    customer_language: null
};

function createStore(supabase: ReturnType<typeof createClient>): RetentionStore {
    return {
        async listExpiredGuests(cutoffDate, limit) {
            const { data, error } = await supabase.rpc("list_expired_reservation_guests", {
                p_cutoff: cutoffDate,
                p_limit: limit
            });
            return { data: data ?? [], error: error ? { message: error.message } : null };
        },

        async listExpiredOrphanReservations(cutoffDate, limit) {
            const { data, error } = await supabase.rpc("list_expired_orphan_reservations", {
                p_cutoff: cutoffDate,
                p_limit: limit
            });
            return { data: data ?? [], error: error ? { message: error.message } : null };
        },

        async anonymizeReservationsOfGuests(tenantId, guestIds) {
            // Nessun filtro sulla data: il criterio è la persona. Se il profilo
            // è scaduto, tutto il suo storico se ne va insieme — altrimenti la
            // rubrica direbbe "2 visite" a chi ne ha fatte dodici.
            const { data, error } = await supabase
                .from("reservations")
                .update(ANONYMIZATION_PATCH)
                .eq("tenant_id", tenantId)
                .in("guest_id", guestIds as string[])
                .select("id");
            return {
                data: data ? data.length : 0,
                error: error ? { message: error.message } : null
            };
        },

        async anonymizeReservationsById(tenantId, reservationIds) {
            const { data, error } = await supabase
                .from("reservations")
                .update(ANONYMIZATION_PATCH)
                .eq("tenant_id", tenantId)
                .in("id", reservationIds as string[])
                .select("id");
            return {
                data: data ? data.length : 0,
                error: error ? { message: error.message } : null
            };
        },

        async deleteGuests(tenantId, guestIds) {
            const { data, error } = await supabase
                .from("reservation_guests")
                .delete()
                .eq("tenant_id", tenantId)
                .in("id", guestIds as string[])
                .select("id");
            return {
                data: data ? data.length : 0,
                error: error ? { message: error.message } : null
            };
        }
    };
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    // Auth fail-closed: segreto mancante dall'env ⇒ rifiuta.
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("purge-reservation-data: env mancante (URL / service role)");
        return json(500, { error: "misconfigured" });
    }

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        // Body assente o non JSON: resta dry-run, che è il default sicuro.
        body = {};
    }

    // Distruttivo SOLO con `dry_run: false` esplicito. Qualunque altro valore
    // (assente, true, "false", null) resta simulazione.
    const dryRun = body.dry_run !== false;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const cutoffDate = retentionCutoffDate(new Date(), RETENTION_MONTHS);

    const summary = await runRetentionTick({
        store: createStore(supabase),
        cutoffDate,
        dryRun,
        maxGuestsPerRun: MAX_GUESTS_PER_RUN,
        maxOrphanReservationsPerRun: MAX_ORPHAN_RESERVATIONS_PER_RUN,
        log: (event, meta) => {
            console.log(JSON.stringify({ event, ...(meta ?? {}) }));
        }
    });

    return json(200, summary);
});
