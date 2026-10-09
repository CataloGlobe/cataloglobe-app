import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@services/supabase/client";
import { AuthContext } from "./AuthContextBase";
import { isDefinitiveNoSession, resolveBootstrapUser, runWithRetry, withTimeout } from "./authRetry";
import type { User } from "@supabase/supabase-js";

// Budget e timeout. Single source of truth — i 4s singolo-shot pre-fix
// facevano scattare lo schermo bloccante al primo blip Wi-Fi.
const TOTAL_BUDGET_MS = 14_000;
const GET_USER_TIMEOUT_MS = 4_000;
const SELECT_TIMEOUT_MS = 5_000;
const OTP_BACKOFF_MS = [0, 800] as const; // 2 tentativi: immediato + retry
const JITTER_MS = 150;

type OtpCheckReason = "bootstrap" | "refresh" | "force";

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    // Utente corrente letto dal listener di auth (che non vede lo state).
    const userRef = useRef<User | null>(null);
    userRef.current = user;
    const [loading, setLoading] = useState(true);

    const [otpVerified, setOtpVerified] = useState(false);
    const [otpLoading, setOtpLoading] = useState(true); // bootstrap
    const [otpRefreshing, setOtpRefreshing] = useState(false); // refresh background
    // True quando la query di check OTP ha fallito DOPO aver esaurito i retry
    // (o quando il budget si è esaurito prima di poter completare la select).
    // Distingue "non sappiamo" da "non verificato" → ProtectedRoute non
    // rediriga a /verify-otp (che farebbe partire un send-otp non richiesto).
    const [otpCheckFailed, setOtpCheckFailed] = useState(false);

    // evita race condition tra chiamate multiple
    const otpReqIdRef = useRef(0);

    async function checkOtpForUser(reason: OtpCheckReason = "bootstrap") {
        const reqId = ++otpReqIdRef.current;

        if (reason === "bootstrap") setOtpLoading(true);
        else setOtpRefreshing(true);

        const t0 = Date.now();
        const retryOpts = {
            schedule: OTP_BACKOFF_MS,
            totalBudgetMs: TOTAL_BUDGET_MS,
            startedAt: t0,
            jitterMs: JITTER_MS
        };

        try {
            // ── getUser con retry ────────────────────────────────────────
            // throw esplicito su error: senza, AuthRetryableFetchError /
            // network error verrebbe scambiato per "nessuna sessione" e
            // farebbe scattare un redirect/send-otp spurio.
            const userRes = await runWithRetry<string | null>(
                async () => {
                    const { data, error } = await supabase.auth.getUser();
                    if (error) throw error;
                    return data.user?.id ?? null;
                },
                { ...retryOpts, perAttemptTimeoutMs: GET_USER_TIMEOUT_MS }
            );
            if (reqId !== otpReqIdRef.current) return;

            if (!userRes.ok) {
                console.error(
                    "[otp] getUser failed (budgetExhausted=%s, attempts=%d):",
                    userRes.budgetExhausted,
                    userRes.attempts,
                    userRes.error
                );
                setOtpCheckFailed(true);
                return;
            }

            const userId = userRes.value;
            if (!userId) {
                // Auth getUser è riuscita e ha restituito nessun utente →
                // sessione davvero assente (non è un blip). Solo qui è safe
                // sbattere a un /verify-otp / /login.
                if (reason === "bootstrap") setOtpVerified(false);
                return;
            }

            // ── SELECT su otp_user_verifications con retry ───────────────
            // Lookup keyed on user_id with TTL filter (migration
            // 20260508005454). Replaces the old session_id-based lookup which
            // desynced on every Supabase JWT rotation.
            const nowIso = new Date().toISOString();
            const selectRes = await runWithRetry<{ user_id: string } | null>(
                async () => {
                    const res = await supabase
                        .from("otp_user_verifications")
                        .select("user_id")
                        .eq("user_id", userId)
                        .gt("expires_at", nowIso)
                        .maybeSingle();
                    if (res.error) throw res.error;
                    return (res.data as { user_id: string } | null) ?? null;
                },
                { ...retryOpts, perAttemptTimeoutMs: SELECT_TIMEOUT_MS }
            );
            if (reqId !== otpReqIdRef.current) return;

            if (!selectRes.ok) {
                // Include il caso "budget esaurito durante getUser → select
                // mai partita" (selectRes.attempts === 0, budgetExhausted=true):
                // trattato come check fallito, NON come "utente non verificato".
                console.error(
                    "[otp] check failed (budgetExhausted=%s, attempts=%d):",
                    selectRes.budgetExhausted,
                    selectRes.attempts,
                    selectRes.error
                );
                setOtpCheckFailed(true);
                return;
            }

            const data = selectRes.value;
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
                // Stesso retry e budget del check OTP: un getUser lento non
                // è un logout. Se il server non risponde (e non ha detto
                // «nessuna sessione») resta l'utente della sessione locale
                // valida; il check OTP poi dice «non sappiamo», non /login.
                const res = await resolveBootstrapUser<User>(
                    async () => {
                        const { data, error } = await supabase.auth.getUser();
                        if (error) throw error;
                        return data.user ?? null;
                    },
                    async () => {
                        const { data } = await withTimeout(supabase.auth.getSession(), GET_USER_TIMEOUT_MS);
                        const session = data.session;
                        return session && (session.expires_at ?? 0) * 1000 > Date.now() ? session.user : null;
                    },
                    {
                        schedule: OTP_BACKOFF_MS,
                        perAttemptTimeoutMs: GET_USER_TIMEOUT_MS,
                        totalBudgetMs: TOTAL_BUDGET_MS,
                        startedAt: Date.now(),
                        jitterMs: JITTER_MS
                    }
                );
                if (cancelled) return;
                // «Nessuna sessione» (pagina di login) è un esito, non un errore.
                if (res.error && !isDefinitiveNoSession(res.error)) console.error("[auth] init getUser failed (user from %s):", res.source, res.error);

                // Se nel frattempo il listener ha già ripreso l'utente (token
                // rinnovato mentre init aspettava), un esito vuoto non lo toglie.
                if (!res.user && userRef.current) return;
                setUser(res.user);

                // IMPORTANTISSIMO:
                // non bloccare l'app aspettando OTP check
                if (res.user) void checkOtpForUser("bootstrap");
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
                // Invalida eventuale retry in-flight.
                otpReqIdRef.current++;
                setUser(null);
                setOtpVerified(false);
                setOtpLoading(false);
                setOtpRefreshing(false);
                setOtpCheckFailed(false);
                return;
            }

            if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
                // Avvio con token scaduto e rete lenta: init può finire senza
                // utente (e la pagina va al login) mentre auth-js rinnova il
                // token poco dopo. Se qui l'utente manca, si riprende.
                if (session?.user && !userRef.current) {
                    setUser(session.user);
                    void checkOtpForUser("bootstrap");
                }
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

        otpReqIdRef.current++;
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
