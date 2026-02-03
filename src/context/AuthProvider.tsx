import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@services/supabase/client";
import { AuthContext } from "./AuthContextBase";
import type { User } from "@supabase/supabase-js";

function getSessionIdFromJwt(token: string): string | null {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.session_id ?? payload.sessionid ?? null;
    } catch {
        return null;
    }
}

async function withTimeout<T>(p: Promise<T>, ms = 4000): Promise<T> {
    return await Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(true);

    // evita race condition tra chiamate multiple
    const otpReqIdRef = useRef(0);

    async function checkOtpForSession() {
        const reqId = ++otpReqIdRef.current;
        setOtpLoading(true);

        try {
            const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 4000);
            const session = sessionData.session;

            if (!session?.access_token) {
                if (reqId === otpReqIdRef.current) setOtpVerified(false);
                return;
            }

            const sessionId = getSessionIdFromJwt(session.access_token);
            if (!sessionId) {
                if (reqId === otpReqIdRef.current) setOtpVerified(false);
                return;
            }

            const { data, error } = await withTimeout(
                (async () =>
                    await supabase
                        .from("otp_session_verifications")
                        .select("session_id")
                        .eq("session_id", sessionId)
                        .maybeSingle())(),
                4000
            );

            if (reqId !== otpReqIdRef.current) return; // risposta vecchia → ignora

            if (error) {
                console.error("[otp] check failed:", error);
                setOtpVerified(false);
                return;
            }

            setOtpVerified(!!data);
        } catch (e) {
            // timeout o crash: NON bloccare l'app
            console.error("[otp] check crashed:", e);
            if (reqId === otpReqIdRef.current) setOtpVerified(false);
        } finally {
            if (reqId === otpReqIdRef.current) setOtpLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const { data } = await withTimeout(supabase.auth.getUser(), 4000);
                if (cancelled) return;

                setUser(data.user ?? null);

                // IMPORTANTISSIMO:
                // non bloccare l'app aspettando OTP check
                if (data.user) void checkOtpForSession();
                else {
                    setOtpVerified(false);
                    setOtpLoading(false);
                }
            } catch (e) {
                console.error("[auth] init failed:", e);
                if (!cancelled) {
                    setUser(null);
                    setOtpVerified(false);
                    setOtpLoading(false);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        init();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;

            if (session) {
                // aggiorna user in background
                void (async () => {
                    const { data } = await supabase.auth.getUser();
                    if (cancelled) return;
                    setUser(data.user ?? null);
                    void checkOtpForSession();
                })();
            } else {
                setUser(null);
                setOtpVerified(false);
                setOtpLoading(false);
            }
        });

        return () => {
            cancelled = true;
            listener.subscription.unsubscribe();
        };
    }, []);

    async function handleSignOut() {
        await supabase.auth.signOut();
        setUser(null);
        setOtpVerified(false);
        setOtpLoading(false);
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                otpVerified,
                otpLoading,
                signOut: handleSignOut,
                refreshOtp: checkOtpForSession
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
