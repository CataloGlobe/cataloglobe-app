// @ts-nocheck
import { Resend } from "npm:resend@4";
import { COMPANY } from "../_shared/company-config.ts";
import { buildTenantInviteEmail } from "../_shared/accountEmails.ts";

const APP_URL = Deno.env.get("APP_URL");

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

interface InvitePayload {
    email: string;
    tenantName: string;
    inviterEmail: string;
    inviteToken: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    // Fail-fast: APP_URL deve essere configurato per ambiente (staging/prod).
    if (!APP_URL) {
        console.error("[send-tenant-invite] APP_URL env var is required");
        return json(500, { error: "server_misconfigured" });
    }

    // Verify the caller is the Supabase backend (internal shared secret)
    const internalSecret = req.headers.get("X-Internal-Secret");
    const expectedSecret = Deno.env.get("INTERNAL_EDGE_SECRET");

    if (!internalSecret || !expectedSecret || internalSecret !== expectedSecret) {
        return json(401, { error: "unauthorized" });
    }

    let payload: InvitePayload;
    try {
        payload = await req.json();
    } catch {
        return json(400, { error: "invalid_json" });
    }

    const { email, tenantName, inviterEmail, inviteToken } = payload;

    if (!email || !tenantName || !inviterEmail || !inviteToken) {
        return json(400, { error: "missing_fields" });
    }

    const inviteUrl = `${APP_URL}/invite/${encodeURIComponent(inviteToken)}`;
    // Nome del tenant ed email di chi invita li scrive l'utente: il builder li
    // escapa nell'HTML (niente link o markup iniettati nella mail).

    try {
        await resend.emails.send({
            from: COMPANY.email.sender,
            replyTo: COMPANY.contact.support,
            to: email,
            ...buildTenantInviteEmail({ tenantName, inviterEmail, inviteUrl })
        });
    } catch (err) {
        console.error("[send-tenant-invite] Resend error:", err);
        return json(500, { error: "email_failed" });
    }

    return json(200, { ok: true });
});
