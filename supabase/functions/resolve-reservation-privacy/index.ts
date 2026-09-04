// @ts-nocheck
// Dati della sede necessari a compilare l'informativa privacy prenotazioni.
//
// Restituisce SOLO i fatti parametrici (titolare, indirizzo, recapiti): il testo
// dell'informativa vive lato frontend, nelle cinque lingue. Qui non c'e' copy.
//
// Perche' una edge function e non il payload di `resolve-public-catalog`:
//
//   1. `tenants.legal_name` e l'email dell'owner non hanno motivo di viaggiare
//      con ogni catalogo aperto da un QR. Sono dati che servono a una pagina
//      che quasi nessuno apre.
//   2. L'email dell'owner vive in `auth.users` e si legge solo con
//      service_role: non e' esponibile da nessun payload pubblico esistente.
//
// ── Il titolare e' un requisito, non un campo opzionale ─────────────────────
// `tenants.legal_name` e' nullable e appartiene ai dati di fatturazione: chi non
// ha completato il billing ce l'ha vuoto (oggi ~2 tenant su 3). Un'informativa
// che nomina il titolare con un campo vuoto e' PEGGIO di nessuna informativa,
// quindi qui non c'e' nessun fallback: si risponde `available: false` e la
// pagina mostra un messaggio. Stesso trattamento per l'email di contatto, che
// l'art. 13 rende obbligatoria tanto quanto l'identita' del titolare.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ACTIVITY_SELECT =
    "id, tenant_id, name, phone, phone_public, " +
    "address, street_number, postal_code, city, province, " +
    "reservation_privacy_contact_email";

/**
 * Indirizzo su una riga, stessa forma di `getFullAddress()` in
 * `_shared/company-config.ts` — via, civico, CAP citta' (PR) — con i segmenti
 * vuoti omessi invece di lasciare virgole appese. Nessun paese: le sedi sono
 * tutte italiane e `activities` non ha la colonna (vedi TODO multi-region).
 */
function composeAddress(a: Record<string, unknown>): string | null {
    const street = String(a.address ?? "").trim();
    const streetNumber = String(a.street_number ?? "").trim();
    const postalCode = String(a.postal_code ?? "").trim();
    const city = String(a.city ?? "").trim();
    const province = String(a.province ?? "").trim();

    const head = [street, streetNumber].filter(s => s.length > 0).join(", ");
    const cityPart = province.length > 0 ? `${city} (${province})` : city;
    const tail = [postalCode, cityPart].filter(s => s.length > 0).join(" ");

    const full = [head, tail].filter(s => s.length > 0).join(", ");
    return full.length > 0 ? full : null;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { slug } = (await req.json()) as { slug?: string };

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Missing slug" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Risoluzione slug → activity: lookup diretto + fallback alias,
        // stessa logica di `resolve-public-catalog` / `resolve-public-story`.
        const { data: activityDirect, error: activityError } = await supabase
            .from("activities")
            .select(ACTIVITY_SELECT)
            .eq("slug", slug)
            .maybeSingle();

        if (activityError) throw activityError;

        let activity = activityDirect;

        if (!activity) {
            const { data: alias, error: aliasError } = await supabase
                .from("activity_slug_aliases")
                .select("activity_id")
                .eq("slug", slug)
                .maybeSingle();

            if (aliasError) throw aliasError;

            if (alias) {
                const { data: aliasActivity, error: aliasActivityError } = await supabase
                    .from("activities")
                    .select(ACTIVITY_SELECT)
                    .eq("id", alias.activity_id)
                    .maybeSingle();

                if (aliasActivityError) throw aliasActivityError;
                activity = aliasActivity;
            }
        }

        if (!activity) {
            return new Response(
                JSON.stringify({ error: "Sede non trovata" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // La sede non viene filtrata per `status` ne' per `enable_reservations`:
        // chi ha prenotato la settimana scorsa deve poter rileggere a quali
        // condizioni ha dato i suoi dati anche se il locale ha intanto sospeso
        // la pubblicazione o spento le prenotazioni.

        // 2. Titolare del trattamento.
        const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("legal_name, owner_user_id")
            .eq("id", activity.tenant_id)
            .maybeSingle();

        if (tenantError) throw tenantError;

        const legalName = (tenant?.legal_name ?? "").trim();

        // 3. Email di contatto: campo dedicato della sede, fallback all'owner
        // del tenant. Il fallback si risolve qui e non e' materializzato in
        // colonna, cosi' non si sgancia il giorno che l'owner cambia email.
        let contactEmail = (activity.reservation_privacy_contact_email ?? "").trim();

        if (contactEmail.length === 0 && tenant?.owner_user_id) {
            const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(
                tenant.owner_user_id as string
            );
            if (ownerError) {
                // Non fatale: si cade nel ramo `missing_contact_email` sotto,
                // che e' esattamente il comportamento voluto — meglio dire
                // "non disponibile" che pubblicare un'informativa senza recapito.
                console.error("[resolve-reservation-privacy] owner lookup failed:", ownerError);
            }
            contactEmail = (ownerData?.user?.email ?? "").trim();
        }

        // 4. Prerequisiti dell'art. 13. Ordine dei controlli = ordine con cui
        // il ristoratore li vede in dashboard: prima chi e', poi come lo
        // contatti.
        if (legalName.length === 0) {
            return new Response(
                JSON.stringify({
                    available: false,
                    reason: "missing_legal_name",
                    venue_name: activity.name
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (contactEmail.length === 0) {
            return new Response(
                JSON.stringify({
                    available: false,
                    reason: "missing_contact_email",
                    venue_name: activity.name
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 5. Telefono: solo se la sede ha scelto di renderlo pubblico. Senza
        // questo gate pubblicheremmo un recapito tenuto deliberatamente privato.
        const phone = activity.phone_public ? ((activity.phone ?? "").trim() || null) : null;

        return new Response(
            JSON.stringify({
                available: true,
                venue_name: activity.name,
                legal_name: legalName,
                address: composeAddress(activity),
                contact_email: contactEmail,
                phone
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (e) {
        console.error("[resolve-reservation-privacy] unexpected error:", e);
        return new Response(
            JSON.stringify({ error: "Errore interno" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
