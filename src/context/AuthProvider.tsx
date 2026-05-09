import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@services/supabase/client";
import { AuthContext } from "./AuthContextBase";
import type { User } from "@supabase/supabase-js";

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
    // True quando la query di check OTP ha fallito per errore (rete/postgrest).
    // Distingue "non sappiamo" da "non verificato" → ProtectedRoute non
    // rediriga a /verify-otp (che genererebbe un send-otp non richiesto).
    const [otpCheckFailed, setOtpCheckFailed] = useState(false);

    // evita race condition tra chiamate multiple
    const otpReqIdRef = useRef(0);

    async function checkOtpForUser(reason: OtpCheckReason = "bootstrap") {
        const reqId = ++otpReqIdRef.current;

        if (reason === "bootstrap") {
            setOtpLoading(true);
        } else {
            setOtpRefreshing(true);
        }

        try {
            const { data: userData } = await withTimeout(supabase.auth.getUser(), 4000);
            const userId = userData.user?.id;

            if (!userId) {
                if (reqId === otpReqIdRef.current && reason === "bootstrap") {
                    setOtpVerified(false);
                }
                return;
            }

            // Lookup keyed on user_id with TTL filter (migration 20260508005454).
            // Replaces the old session_id-based lookup which desynced on every
            // Supabase JWT rotation.
            const nowIso = new Date().toISOString();
            const { data, error } = await withTimeout(
                (async () =>
                    await supabase
                        .from("otp_user_verifications")
                        .select("user_id")
                        .eq("user_id", userId)
                        .gt("expires_at", nowIso)
                        .maybeSingle())(),
                4000
            );

            if (reqId !== otpReqIdRef.current) return; // risposta vecchia → ignora

            if (error) {
                console.error("[otp] check failed:", error);
                // Errore di rete/postgrest: NON sappiamo se l'utente è
                // verificato. Non flippare otpVerified — preserva lo stato.
                // ProtectedRoute mostrerà OtpCheckErrorScreen invece di
                // rediriggere a /verify-otp (che farebbe partire send-otp).
                setOtpCheckFailed(true);
                return;
            }

            // Success: clear eventuale flag di errore precedente.
            setOtpCheckFailed(false);

            if (reason === "bootstrap" || reason === "force") {
                setOtpVerified(!!data);
            } else if (data) {
                setOtpVerified(true);
            }
        } catch (e) {
            console.error("[otp] check crashed:", e);
            if (reqId === otpReqIdRef.current) {
                setOtpCheckFailed(true);
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
                if (data.user) void checkOtpForUser("bootstrap");
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
                setOtpCheckFailed(false);
                return;
            }

            if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
                return;
            }

            if (session?.user) {
                setUser(prev => (prev?.id === session.user.id ? prev : session.user));
                void checkOtpForUser("refresh");
            }
        });

        return () => {
            cancelled = true;
            listener.subscription.unsubscribe();
        };
    }, []);

    async function handleSignOut() {
        // Invalidate OTP verification BEFORE signOut: after signOut the JWT is
        // gone and auth.uid() inside the SECURITY DEFINER RPC would be null.
        // Best-effort: sign-out must complete even if the RPC call fails.
        try {
            await supabase.rpc("delete_my_otp_verification");
        } catch (err) {
            console.warn("[AUTH] delete_my_otp_verification failed", err);
        }

        await supabase.auth.signOut();
        setUser(null);
        setOtpVerified(false);
        setOtpLoading(false);
        setOtpRefreshing(false);
        setOtpCheckFailed(false);
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                otpVerified,
                otpLoading,
                otpRefreshing,
                otpCheckFailed,
                signOut: handleSignOut,
                refreshOtp: () => checkOtpForUser("refresh"),
                forceOtpCheck: () => checkOtpForUser("force")
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
