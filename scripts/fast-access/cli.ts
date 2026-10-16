#!/usr/bin/env node
/**
 * fast-access — SOLO STAGING. Crea in un colpo utente, azienda (tenant), sede e
 * abbonamento di prova, per provare il pannello senza passare dal wizard e da
 * Stripe a mano.
 *
 * Cosa fa, con `--execute`:
 *   1. utente: lo crea già confermato (Auth admin) con la verifica OTP di 30
 *      giorni, come la conferma della registrazione; se l'email esiste lo riusa
 *      e non tocca la sua verifica;
 *   2. azienda: insert su `tenants` come `createTenant` del wizard, owner
 *      l'utente (l'owner non ha riga in tenant_memberships: è `owner_user_id`);
 *   3. abbonamento di prova SENZA Stripe: `subscription_status = 'trialing'`,
 *      `trial_until` fra N giorni, `stripe_subscription_id` NULL. È lo stato
 *      che il cron `expire-tenant-trials` porta a `past_due` alla scadenza;
 *      solo service_role può scriverlo (trg_protect_tenant_subscription_columns);
 *   4. sede: insert su `activities` come `createActivity`, online.
 * Nessuna chiamata a Stripe e nessuna scrittura nel CRM. Nota: il job
 * `crm-sync-accounts` di staging vede l'azienda nuova come qualsiasi tenant.
 *
 * Default = dry-run: stampa cosa farebbe, senza rete e anche senza
 * credenziali. `--execute` scrive davvero, e solo se tutto dice staging:
 *   - SUPABASE_URL deve essere https://<STAGING_PROJECT_REF>.supabase.co;
 *   - la chiave, se è un JWT, deve essere service_role di quel ref;
 *   - PRODUCTION_PROJECT_REF (facoltativo) non deve comparire;
 *   - supabase/.temp/project-ref, se c'è, deve essere STAGING_PROJECT_REF.
 * I ref NON sono nel codice: arrivano dall'ambiente.
 *
 * Esecuzione (dalla radice del repo):
 *   STAGING_PROJECT_REF="<ref di staging>" \
 *   PRODUCTION_PROJECT_REF="<ref di produzione>" \
 *   SUPABASE_URL="https://<ref di staging>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   FAST_ACCESS_PASSWORD="..." \            # facoltativa: senza, ne genera una
 *   npm run fast-access -- --email nome+prova1@esempio.it [--execute]
 *
 * Opzioni:
 *   --email <indirizzo>      obbligatoria
 *   --name <nome azienda>    default «Prova <codice>»
 *   --activity-name <nome>   default = nome azienda
 *   --slug <slug>            default prova-<nome>-<codice> (3-60, a-z 0-9 -)
 *   --plan base|pro          default pro
 *   --seats <1-20>           posti pagati, default 1
 *   --trial-days <1-90>      durata della prova, default 30
 *   --subtype restaurant|bar|pizzeria|cafe   default restaurant
 *   --execute                scrive (senza: dry-run)
 *
 * Ripetibile: con lo stesso --slug e la stessa email riprende l'azienda e la
 * sede già create (chiave di idempotenza `fast-access:<slug>`).
 * Per togliere tutto: eliminare l'azienda dal Workspace come owner.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkStaging, describePlan, parseArgs, plannedRows, type PlannedRows } from "./model";

const suffix = randomBytes(2).toString("hex");
const parsed = parseArgs(process.argv.slice(2), suffix);
if (!parsed.ok) {
    console.error(`fast-access: ${parsed.error}`);
    process.exit(2);
}
const options = parsed.options;
const rows = plannedRows(options, new Date());

const LINK_FILE = "supabase/.temp/project-ref";
const guard = checkStaging({
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stagingRef: process.env.STAGING_PROJECT_REF,
    productionRef: process.env.PRODUCTION_PROJECT_REF,
    linkedRef: existsSync(LINK_FILE) ? readFileSync(LINK_FILE, "utf8") : undefined
});

console.log(options.execute ? "fast-access (esecuzione)" : "fast-access (dry-run: nessuna scrittura)");
for (const line of describePlan(options, rows)) console.log(`  ${line}`);

if (!guard.ok) {
    console.log(`guardia staging: NO (${guard.reasons.join("; ")})`);
    if (options.execute) {
        console.error("fast-access: fermo, scrivo solo su staging.");
        process.exit(1);
    }
    process.exit(0);
}
console.log(`guardia staging: ok (${guard.ref})`);
if (!options.execute) {
    console.log("dry-run: per scrivere aggiungi --execute.");
    process.exit(0);
}

type PgError = { code?: string; message: string };

function fail(step: string, error: PgError): never {
    console.error(`fast-access: ${step} non riuscito (${error.code ?? "?"}): ${error.message}`);
    process.exit(1);
}

async function findUserIdByEmail(client: SupabaseClient, email: string): Promise<string | null> {
    const perPage = 1000;
    for (let page = 1; ; page++) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) fail("ricerca dell'utente", error);
        const match = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
        if (match) return match.id;
        if (data.users.length < perPage) return null;
    }
}

async function ensureUser(
    client: SupabaseClient,
    email: string,
    password: string
): Promise<{ id: string; created: boolean }> {
    const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (!error) return { id: data.user.id, created: true };
    if (error.code !== "email_exists" && !/already (been )?registered/i.test(error.message)) {
        fail("creazione dell'utente", error);
    }
    const existing = await findUserIdByEmail(client, email);
    if (!existing) fail("creazione dell'utente", { message: "email già usata ma utente non trovato" });
    return { id: existing, created: false };
}

async function ensureTenant(client: SupabaseClient, ownerId: string, tenant: PlannedRows["tenant"]): Promise<string> {
    const { data, error } = await client
        .from("tenants")
        .insert({ ...tenant, owner_user_id: ownerId })
        .select("id")
        .single<{ id: string }>();
    if (!error) return data.id;
    if (error.code !== "23505") fail("creazione dell'azienda", error);

    const { data: existing, error: lookupError } = await client
        .from("tenants")
        .select("id")
        .eq("creation_idempotency_key", tenant.creation_idempotency_key)
        .eq("owner_user_id", ownerId)
        .single<{ id: string }>();
    if (lookupError) fail("ripresa dell'azienda", lookupError);
    return existing.id;
}

async function ensureActivity(
    client: SupabaseClient,
    tenantId: string,
    activity: PlannedRows["activity"]
): Promise<string> {
    const { data, error } = await client
        .from("activities")
        .insert({ id: randomUUID(), tenant_id: tenantId, ...activity })
        .select("id")
        .single<{ id: string }>();
    if (!error) return data.id;
    if (error.code !== "23505") fail("creazione della sede", error);

    const { data: existing, error: lookupError } = await client
        .from("activities")
        .select("id, tenant_id")
        .eq("slug", activity.slug)
        .single<{ id: string; tenant_id: string }>();
    if (lookupError) fail("ripresa della sede", lookupError);
    if (existing.tenant_id !== tenantId) {
        fail("creazione della sede", { code: "23505", message: `slug ${activity.slug} già usato da un'altra azienda` });
    }
    return existing.id;
}

const client = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const generatedPassword = process.env.FAST_ACCESS_PASSWORD ? null : randomBytes(12).toString("base64url");
const user = await ensureUser(client, options.email, process.env.FAST_ACCESS_PASSWORD ?? (generatedPassword as string));

if (user.created) {
    const now = Date.now();
    const { error } = await client.from("otp_user_verifications").upsert({
        user_id: user.id,
        verified_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    if (error) fail("verifica OTP", error);
}

const tenantId = await ensureTenant(client, user.id, rows.tenant);
const activityId = await ensureActivity(client, tenantId, rows.activity);

console.log("fatto:");
console.log(`  utente   ${options.email} ${user.created ? "(nuovo)" : "(esistente)"}`);
if (user.created && generatedPassword) console.log(`  password ${generatedPassword}`);
console.log(`  azienda  ${tenantId}`);
console.log(`  sede     ${activityId} (/${rows.activity.slug})`);
console.log(`  prova    fino al ${rows.tenant.trial_until.slice(0, 10)}`);
