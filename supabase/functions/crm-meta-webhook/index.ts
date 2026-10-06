// @ts-nocheck
// =============================================================================
// crm-meta-webhook — lead dei moduli Meta in tempo reale
// =============================================================================
//
// Callback URL dell'app Meta, campo `leadgen` della Pagina.
//
// GET  verifica dell'iscrizione: hub.mode=subscribe e hub.verify_token =
//      META_VERIFY_TOKEN (confronto constant-time) → hub.challenge.
// POST evento: firma `X-Hub-Signature-256` sul corpo grezzo con
//      META_APP_SECRET, poi per ogni leadgen_id:
//        1. già entrato (crm_leads o crm_imported_refs) → niente;
//        2. lead dalla Graph API col token della Pagina nell'header
//           Authorization (mai nell'URL: finirebbe nei log) e appsecret_proof,
//           nome del modulo con una seconda chiamata (senza: «Modulo Meta»);
//        3. stessa mappatura dell'import CSV (`_shared/metaLeadFields.ts`),
//           source_ref = id del lead: un lead arrivato qui e poi reimportato
//           dal CSV è un doppione, e viceversa;
//        4. `crm_ingest_lead`: la notifica Telegram la manda crm-notify
//           dall'outbox, come per la landing.
//      Telefono non valido o assente: il lead NON entra, come nell'import CSV
//      (un numero in lista stop scritto male rientrerebbe senza impronta).
//      Avviso su Telegram al team con l'id del lead: resta nel Centro lead.
//
// Risposte: 200 quando ogni lead è entrato (o era già entrato); 500 su
// qualsiasi errore (rete, Graph, database, token), così Meta riprova per
// alcune ore. I doppioni dei tentativi li ferma il source_ref; un lead perso
// dopo i tentativi resta nel Centro lead, da importare col CSV.
// Fail-CLOSED: senza i segreti risponde 500 e non legge niente.
// Log senza dati personali: solo id dei lead Meta ed esito.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_APP_SECRET,
// META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, META_GRAPH_VERSION (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendToTeam } from "../_shared/crmTeamAlert.ts";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import { mapMetaLeadRecord } from "../_shared/metaLeadFields.ts";
import {
    appSecretProof,
    extractLeadgenEvents,
    GRAPH_LEAD_FIELDS,
    graphLeadToRecord,
    verifyMetaSignature
} from "../_shared/metaWebhook.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_SECRET = Deno.env.get("META_APP_SECRET");
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN");
const PAGE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v24.0";
const GRAPH_TIMEOUT_MS = 10_000;

function text(status: number, body: string): Response {
    return new Response(body, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
}

async function graphGet(path: string, fields: string, proof: string): Promise<Record<string, unknown>> {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(path)}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("appsecret_proof", proof);
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${PAGE_TOKEN}` },
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    // Niente eccezioni per «lead inesistente» (100/33): Graph dà lo stesso
    // codice a un token senza permesso, e un token sbagliato perderebbe i
    // lead in silenzio. Si riprova; i lead restano comunque nel Centro lead.
    const err = body?.error ?? {};
    throw new Error(`graph ${res.status}/${err.code ?? "?"}/${err.error_subcode ?? "-"}: ${err.type ?? "errore"}`);
}

function discardedLeadMessage(leadgenId: string, hadPhone: boolean): string {
    const why = hadPhone ? "il telefono scritto non è un numero valido" : "manca il telefono";
    return (
        `⚠️ Lead Meta non entrato nel CRM: ${why}.\n` +
        `Lo trovi nel Centro lead di Meta, id <code>${leadgenId.replace(/[^0-9A-Za-z_-]/g, "")}</code>. ` +
        `Se vuoi contattarlo, aggiungilo a mano col numero giusto.`
    );
}

async function alreadyIngested(supabase, leadgenId: string): Promise<boolean> {
    const [leads, refs] = await Promise.all([
        supabase.from("crm_leads").select("id").eq("source", "meta_form").eq("source_ref", leadgenId).limit(1),
        supabase
            .from("crm_imported_refs")
            .select("source_ref")
            .eq("source", "meta_form")
            .eq("source_ref", leadgenId)
            .limit(1)
    ]);
    if (leads.error) throw leads.error;
    if (refs.error) throw refs.error;
    return (leads.data?.length ?? 0) > 0 || (refs.data?.length ?? 0) > 0;
}

async function ingestOne(supabase, leadgenId: string, proof: string): Promise<string> {
    if (await alreadyIngested(supabase, leadgenId)) return "already";

    const lead = await graphGet(leadgenId, GRAPH_LEAD_FIELDS, proof);
    let formName: string | null = null;
    if (typeof lead.form_id === "string" && lead.form_id) {
        try {
            const form = await graphGet(lead.form_id, "name", proof);
            formName = typeof form.name === "string" && form.name.trim() ? form.name.trim() : null;
        } catch (err) {
            console.warn(`crm-meta-webhook: nome del modulo non letto (lead ${leadgenId}): ${err.message}`);
        }
    }

    const { record, headers } = graphLeadToRecord(lead, formName);
    const { leadId, rawPhone, ...fields } = mapMetaLeadRecord(record, headers);
    const phone = normalizePhoneToE164(rawPhone);
    if (!phone) {
        // Come l'import CSV: senza un E.164 non c'è impronta, e la lista stop
        // non lo fermerebbe. Il lead resta nel Centro lead di Meta.
        await sendToTeam(supabase, discardedLeadMessage(leadgenId, Boolean(rawPhone)), {
            logTag: "crm-meta-webhook"
        });
        return rawPhone ? "discarded_invalid_phone" : "discarded_missing_phone";
    }

    const { data, error } = await supabase.rpc("crm_ingest_lead", {
        p_source: "meta_form",
        p_source_ref: leadId || leadgenId,
        p_name: fields.name,
        p_venue_name: fields.venueName,
        p_phone_e164: phone,
        p_email: fields.email,
        p_city: fields.city,
        p_interests: [],
        p_form_answers: fields.formAnswers,
        p_ad_id: fields.adId,
        p_ad_name: fields.adName,
        p_campaign: fields.campaign,
        p_consent_at: fields.consentAt,
        p_consent_text: fields.consentText,
        p_received_at: fields.receivedAt,
        p_silent: false
    });
    if (error) throw error;
    return data?.[0]?.r_outcome ?? "?";
}

Deno.serve(async (req: Request) => {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !APP_SECRET || !VERIFY_TOKEN || !PAGE_TOKEN) {
        console.error("crm-meta-webhook: env mancante");
        return text(500, "not configured");
    }

    if (req.method === "GET") {
        const params = new URL(req.url).searchParams;
        const challenge = params.get("hub.challenge") ?? "";
        if (
            params.get("hub.mode") === "subscribe" &&
            timingSafeEqualStr(params.get("hub.verify_token") ?? "", VERIFY_TOKEN) &&
            challenge
        ) {
            return text(200, challenge);
        }
        return text(403, "forbidden");
    }

    if (req.method !== "POST") return text(405, "method not allowed");

    const rawBody = new Uint8Array(await req.arrayBuffer());
    if (!(await verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), APP_SECRET))) {
        console.warn("crm-meta-webhook: firma non valida");
        return text(401, "invalid signature");
    }

    let payload: unknown;
    try {
        payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
        return text(400, "invalid json");
    }

    const events = extractLeadgenEvents(payload);
    if (events.length === 0) return text(200, "ok");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const proof = await appSecretProof(PAGE_TOKEN, APP_SECRET);

    let retry = false;
    for (const event of events) {
        try {
            const outcome = await ingestOne(supabase, event.leadgenId, proof);
            console.log(`crm-meta-webhook: lead ${event.leadgenId} → ${outcome}`);
        } catch (err) {
            retry = true;
            console.error(`crm-meta-webhook: lead ${event.leadgenId} non entrato: ${err?.message ?? err}`);
        }
    }

    return retry ? text(500, "retry") : text(200, "ok");
});
