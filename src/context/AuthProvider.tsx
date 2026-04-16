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

type OtpCheckReason = "bootstrap" | "refresh" | "force";

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(true); // bootstrap
    const [otpRefreshing, setOtpRefreshing] = useState(false); // refresh background

    // evita race condition tra chiamate multiple
    const otpReqIdRef = useRef(0);

    async function checkOtpForSession(reason: OtpCheckReason = "bootstrap") {
        const reqId = ++otpReqIdRef.current;

        if (reason === "bootstrap") {
            setOtpLoading(true);
        } else {
            setOtpRefreshing(true);
        }

        try {
            const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 4000);
            const session = sessionData.session;

            if (!session?.access_token) {
                if (reqId === otpReqIdRef.current && reason === "bootstrap") {
                    setOtpVerified(false);
                }
                return;
            }

            const sessionId = getSessionIdFromJwt(session.access_token);
            if (!sessionId) {
                if (reqId === otpReqIdRef.current && reason === "bootstrap") {
                    setOtpVerified(false);
                }
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
                if (reason === "bootstrap") {
                    setOtpVerified(false);
                }
                return;
            }

            if (reason === "bootstrap" || reason === "force") {
                setOtpVerified(!!data);
            } else if (data) {
                setOtpVerified(true);
            }
        } catch (e) {
            console.error("[otp] check crashed:", e);
            if (reqId === otpReqIdRef.current && reason === "bootstrap") {
                setOtpVerified(false);
            }
        } finally {
            if (reason === "bootstrap") setOtpLoading(false);
            else setOtpRefreshing(false);
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
                if (data.user) void checkOtpForSession("bootstrap");
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

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (cancelled) return;

            if (event === "SIGNED_OUT") {
                setUser(null);
                setOtpVerified(false);
                setOtpLoading(false);
                setOtpRefreshing(false);
                return;
            }

            if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
                return;
            }

            if (session?.user) {
                setUser(prev => (prev?.id === session.user.id ? prev : session.user));
                void checkOtpForSession("refresh");
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
        setOtpRefreshing(false);
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                otpVerified,
                otpLoading,
                otpRefreshing,
                signOut: handleSignOut,
                refreshOtp: () => checkOtpForSession("refresh"),
                forceOtpCheck: () => checkOtpForSession("force")
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
