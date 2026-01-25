// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.1.0";

async function hashOtp(code: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async req => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers });
    }

    try {
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

        const { userId, email } = await req.json();

        if (!userId || !email) {
            return new Response(JSON.stringify({ error: "Missing parameters" }), {
                status: 400,
                headers
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1️⃣ Cancella eventuali OTP precedenti per questo utente
        await supabase.from("otps").delete().eq("user_id", userId);

        // 2️⃣ Genera OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 3️⃣ Calcola hash dell'OTP
        const codeHash = await hashOtp(code);

        // 4️⃣ Salva SOLO l'hash nel DB (campo code)
        const { error: insertError } = await supabase
            .from("otps")
            .insert({ user_id: userId, code: codeHash });

        if (insertError) {
            console.error("DB Error:", insertError);
            return new Response(JSON.stringify({ error: "DB Error" }), {
                status: 500,
                headers
            });
        }

        // 5️⃣ Invia email OTP
        await resend.emails.send({
            from: "Cataloglobe <updates@cataloglobe.com>",
            to: email,
            subject: "Il tuo codice di accesso Cataloglobe",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f9fafb; padding:40px;">
                <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
                  
                  <h1 style="margin:0 0 16px; font-size:22px; color:#111827;">
                    Codice di accesso
                  </h1>
          
                  <p style="margin:0 0 24px; font-size:15px; color:#374151;">
                    Usa questo codice per completare l’accesso a <strong>Cataloglobe</strong>.
                  </p>
          
                  <div style="text-align:center; margin:32px 0;">
                    <div style="display:inline-block; padding:16px 24px; font-size:28px; letter-spacing:4px; font-weight:700; background:#111827; color:#ffffff; border-radius:10px;">
                      ${code}
                    </div>
                  </div>
          
                  <p style="margin:24px 0 0; font-size:14px; color:#6b7280;">
                    Il codice è valido per pochi minuti.
                    <br />
                    Se non hai richiesto tu l’accesso, puoi ignorare questa email.
                  </p>
          
                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />
          
                  <p style="margin:0; font-size:12px; color:#9ca3af;">
                    © ${new Date().getFullYear()} Cataloglobe
                  </p>
          
                </div>
              </div>
            `
        });

        return new Response(JSON.stringify({ success: true }), { headers });
    } catch (err) {
        console.error("send-otp error:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers
        });
    }
});
