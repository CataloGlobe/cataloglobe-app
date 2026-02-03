import { useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useNavigate } from "react-router-dom";

export default function VerifyOtp() {
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function getJwt() {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    }

    async function sendOtp() {
        const jwt = await getJwt();
        if (!jwt) return navigate("/login", { replace: true });

        setLoading(true);

        const { error } = await supabase.functions.invoke("send-otp", {
            headers: {
                Authorization: `Bearer ${jwt}`
            }
        });

        setLoading(false);
        if (error) alert(error.message);
    }

    async function verifyOtp() {
        const jwt = await getJwt();
        if (!jwt) return navigate("/login", { replace: true });

        setLoading(true);

        const { error } = await supabase.functions.invoke("verify-otp", {
            body: { code },
            headers: {
                Authorization: `Bearer ${jwt}`
            }
        });

        setLoading(false);

        if (error) {
            alert(error.message);
            return;
        }

        navigate("/dashboard", { replace: true });
    }

    return (
        <div>
            <button onClick={sendOtp} disabled={loading}>
                Invia codice
            </button>

            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Codice OTP" />

            <button onClick={verifyOtp} disabled={loading}>
                Verifica
            </button>
        </div>
    );
}
