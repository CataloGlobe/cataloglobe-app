import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
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
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(true);

    // evita race condition tra chiamate multiple
    const otpReqIdRef = useRef(0);
    // distingue un vero login da eventi auth "di mantenimento" (es. ritorno focus tab)
    const hasSessionRef = useRef(false);

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
                        .eq("user_id", session.user.id)
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
                const { data: sessionData } = await withTimeout(
                    supabase.auth.getSession(),
                    4000
                );
                const session = sessionData.session;

                if (!session) {
                    if (cancelled) return;
                    setUser(null);
                    hasSessionRef.current = false;
                    setOtpVerified(false);
                    setOtpLoading(false);
                    return;
                }

                const { data, error } = await withTimeout(supabase.auth.getUser(), 4000);
                if (cancelled) return;

                if (error || !data.user) {
                    await supabase.auth.signOut();
                    if (cancelled) return;
                    hasSessionRef.current = false;
                    setUser(null);
                    setOtpVerified(false);
                    setOtpLoading(false);
                    navigate("/login", { replace: true, state: { reason: "session-invalid" } });
                    return;
                }

                setUser(data.user);
                hasSessionRef.current = true;

                // IMPORTANTISSIMO:
                // non bloccare l'app aspettando OTP check
                void checkOtpForSession();
            } catch (e) {
                console.error("[auth] init failed:", e);
                if (!cancelled) {
                    setUser(null);
                    hasSessionRef.current = false;
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
                const hadSession = hasSessionRef.current;
                hasSessionRef.current = true;
                const nextUser = session.user ?? null;

                // Evita update inutili su TOKEN_REFRESHED/focus tab quando l'utente non cambia.
                setUser(prev => (prev?.id === nextUser?.id ? prev : nextUser));

                // Recheck OTP solo quando passiamo da "nessuna sessione" a "sessione attiva".
                // In questo modo un refocus tab non resetta la UI (modali/drawer inclusi).
                if (!hadSession) {
                    void checkOtpForSession();
                }
            } else {
                hasSessionRef.current = false;
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
        if (typeof window !== "undefined") {
            sessionStorage.removeItem("passwordRecoveryFlow");
        }
        hasSessionRef.current = false;
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
