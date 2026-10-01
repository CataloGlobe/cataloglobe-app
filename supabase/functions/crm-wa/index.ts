// @ts-nocheck
// =============================================================================
// crm-wa — «Scrivi su WhatsApp» dal messaggio Telegram del CRM
// =============================================================================
//
// GET ?l=<lead>&u=<destinatario>&e=<scadenza>&s=<firma>, link generato da
// crm-notify per ciascun destinatario (_shared/crmWhatsapp.ts, HMAC con
// CRM_WA_LINK_SECRET, 30 giorni). Se la firma è buona:
//   1. crm_log_whatsapp_opened → evento nella storia e, da Nuovo, Contattato;
//   2. 302 verso wa.me col messaggio pronto di crm_settings.
// Un locale Perso per stop non si apre: ha chiesto di non essere contattato.
//
// Le risposte di errore sono testo semplice: le edge Supabase non servono HTML.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_WA_LINK_SECRET.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fillWhatsappTemplate, verifyWaLink, whatsappUrl } from "../_shared/crmWhatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINK_SECRET = Deno.env.get("CRM_WA_LINK_SECRET");

function text(status: number, body: string): Response {
    return new Response(body, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "GET") return text(405, "Metodo non consentito.");
    if (!LINK_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("crm-wa: env mancante");
        return text(500, "Il link non è configurato. Apri il lead da /admin.");
    }

    const params = Object.fromEntries(new URL(req.url).searchParams);
    const valid = await verifyWaLink(LINK_SECRET, params, Math.floor(Date.now() / 1000));
    if (!valid) return text(403, "Link non valido o scaduto. Apri il lead da /admin.");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    try {
        const [{ data: lead, error }, { data: settings }] = await Promise.all([
            supabase
                .from("crm_leads")
                .select("id, venue_id, crm_contacts(name, phone_e164), crm_venues(name, stage, lost_kind)")
                .eq("id", params.l)
                .maybeSingle(),
            supabase.from("crm_settings").select("whatsapp_template").eq("id", true).maybeSingle()
        ]);
        if (error) throw error;
        if (!lead || !lead.crm_venues) return text(404, "Questo lead non esiste più.");

        const venue = lead.crm_venues;
        if (venue.stage === "perso" && venue.lost_kind === "stop") {
            return text(409, "Ha chiesto di non essere contattato. Non scrivergli.");
        }
        const phone = lead.crm_contacts?.phone_e164;
        if (!phone) return text(422, "Questo lead non ha un telefono.");

        const { error: logError } = await supabase.rpc("crm_log_whatsapp_opened", {
            p_venue_id: lead.venue_id,
            p_lead_id: lead.id,
            p_actor_user_id: params.u
        });
        // Il contatto non registrato non deve impedire di scrivere.
        if (logError) console.error("crm-wa: log", logError.code, logError.message);

        const template = settings?.whatsapp_template ?? null;
        const message = template
            ? fillWhatsappTemplate(template, { contactName: lead.crm_contacts?.name ?? null, venueName: venue.name })
            : null;

        return new Response(null, {
            status: 302,
            headers: { Location: whatsappUrl(phone, message), "Cache-Control": "no-store" }
        });
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-wa: error", e?.code ?? "", e?.message ?? String(err));
        return text(500, "Qualcosa non ha funzionato. Apri il lead da /admin.");
    }
});
