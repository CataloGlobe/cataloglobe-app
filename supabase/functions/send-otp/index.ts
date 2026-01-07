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
            from: "CataloGlobe <onboarding@resend.dev>",
            to: email,
            subject: "Il tuo codice di verifica",
            html: `
                <div style="font-size:18px;font-family:sans-serif;">
                    <p>Ciao!</p>
                    <p>Il tuo codice OTP è:</p>
                    <h2 style="letter-spacing:4px;font-size:24px;">${code}</h2>
                    <p>Valido per 5 minuti.</p>
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
