import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@services/supabase/client";
import { AuthContext } from "./AuthContextBase";
import type { User } from "@supabase/supabase-js";

function getSessionIdFromJwt(token: string): string | null {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.sid ?? null;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const { data } = await supabase.auth.getUser();
            setUser(data.user ?? null);

            if (data.user) {
                await checkOtpForSession(); // ✅
            } else {
                setOtpVerified(false);
                setOtpLoading(false);
            }

            setLoading(false);
        };

        initAuth();

        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                const { data } = await supabase.auth.getUser();
                setUser(data.user ?? null);
                await checkOtpForSession(); // ✅
            } else {
                setUser(null);
                setOtpVerified(false);
                setOtpLoading(false);
            }
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    async function checkOtpForSession() {
        setOtpLoading(true);

        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;

        if (!session) {
            setOtpVerified(false);
            setOtpLoading(false);
            return;
        }

        const sessionId = getSessionIdFromJwt(session.access_token);

        if (!sessionId) {
            setOtpVerified(false);
            setOtpLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from("otp_session_verifications")
            .select("session_id")
            .eq("session_id", sessionId)
            .maybeSingle();

        setOtpVerified(!error && !!data);
        setOtpLoading(false);
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
        setUser(null);
        setOtpVerified(false);
        setOtpLoading(false);
    }

    return (
        <AuthContext.Provider
            value={{ user, loading, otpVerified, otpLoading, signOut: handleSignOut }}
        >
            {children}
        </AuthContext.Provider>
    );
}
