// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend@4";

const APP_URL = Deno.env.get("APP_URL") ?? "https://cataloglobe.com";

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

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

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

    const inviteUrl = `${APP_URL}/invite/${inviteToken}`;

    try {
        await resend.emails.send({
            from: "CataloGlobe <noreply@cataloglobe.com>",
            to: email,
            subject: `Sei stato invitato a unirti a ${tenantName} su Cataloglobe`,
            html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
            <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
                <h1 style="margin:0 0 16px;font-size:22px;color:#111827">
                    Sei stato invitato su Cataloglobe
                </h1>
                <p style="margin:0 0 8px;font-size:15px;color:#374151">
                    <strong>${inviterEmail}</strong> ti ha invitato a collaborare su
                    <strong>${tenantName}</strong>.
                </p>
                <p style="margin:0 0 32px;font-size:15px;color:#374151">
                    Clicca sul pulsante qui sotto per accettare l’invito.
                </p>
                <div style="text-align:center;margin:0 0 32px">
                    <a
                        href="${inviteUrl}"
                        style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;background:#111827;color:#ffffff;border-radius:8px;text-decoration:none"
                    >
                        Accetta l’invito
                    </a>
                </div>
                <p style="margin:0;font-size:13px;color:#6b7280">
                    Se non hai ancora un account, ti verrà chiesto di crearne uno.
                </p>
                <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
                <p style="margin:0;font-size:12px;color:#9ca3af">
                    Oppure copia questo link: ${inviteUrl}
                </p>
            </div>
        </div>
    `
        });
    } catch (err) {
        console.error("[send-tenant-invite] Resend error:", err);
        return json(500, { error: "email_failed" });
    }

    return json(200, { ok: true });
});
