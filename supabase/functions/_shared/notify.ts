// Ingresso unico delle notifiche dalle edge function: chiama la RPC
// `public.notify` (motore, mig 20261015010000), che risolve i destinatari,
// rispetta le preferenze, scrive la campanella e mette in coda le email.
//
// Requires a service_role client: `notify` è concessa solo a service_role.
//
// Mai bloccante: una notifica che non parte non deve mai far fallire l'azione
// vera (prenotazione salvata, ticket risposto...). Errori solo nel log, con
// il tag di chi chiama; ritorna il numero di righe scritte in campanella
// (0 anche in caso di errore).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { buildNotifyArgs, type NotifyInput } from "./notifyArgs.ts";

export type { NotifyInput, NotifyRecipients } from "./notifyArgs.ts";

export async function notify(
    supabase: SupabaseClient,
    input: NotifyInput,
    logTag: string
): Promise<number> {
    try {
        const { data, error } = await supabase.rpc("notify", buildNotifyArgs(input));
        if (error) {
            console.error(`${logTag} notify(${input.eventType}) failed:`, error);
            return 0;
        }
        const count = typeof data === "number" ? data : 0;
        console.log(`${logTag} notify(${input.eventType}) rows=${count}`);
        return count;
    } catch (err) {
        console.error(`${logTag} notify(${input.eventType}) threw:`, err);
        return 0;
    }
}
