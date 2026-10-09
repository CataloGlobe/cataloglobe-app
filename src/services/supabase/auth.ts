import { supabase } from "@/services/supabase/client";
import { CURRENT_CONSENT_VERSIONS } from "@/config/consentVersions";
import { clearSignupLeftovers } from "@/utils/pendingRedirect";

type SignUpProfile = {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
};

// Sign-up (registrazione)
export async function signUp(email: string, password: string, profile?: SignUpProfile) {
    const redirectUrl = `${window.location.origin}/email-confirmed`;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                ...(profile?.first_name ? { first_name: profile.first_name } : {}),
                ...(profile?.last_name ? { last_name: profile.last_name } : {}),
                ...(profile?.phone ? { phone: profile.phone } : {}),
                consent_privacy_version: CURRENT_CONSENT_VERSIONS.privacy,
                consent_terms_version: CURRENT_CONSENT_VERSIONS.terms,
            },
            emailRedirectTo: redirectUrl
        }
    });

    return { data, error };
}

// Login
/**
 * C'è una verifica OTP ancora valida per questo utente? (stessa lettura di
 * AuthProvider: otp_user_verifications, scadenza nel futuro). Su errore
 * risponde false: si passa da /verify-otp, che decide lui.
 */
export async function hasValidOtpVerification(userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("otp_user_verifications")
        .select("user_id")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
    return !error && !!data;
}

export async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    if (typeof window !== "undefined") {
        sessionStorage.removeItem("passwordRecoveryFlow");
    }
    return data;
}

// Logout. Di default solo questo dispositivo e la verifica OTP (30 giorni per
// utente) resta: deciso da Lorenzo il 2026-10-09. «Esci da tutti i
// dispositivi» chiude ogni sessione e cancella anche la verifica, così chi
// aveva la password non entra senza codice.
export async function signOut(options?: { everywhere?: boolean }) {
    if (options?.everywhere) {
        // Prima del signOut: dopo, il JWT non c'è più e auth.uid() nella RPC
        // SECURITY DEFINER sarebbe null. Best-effort: l'uscita va fatta comunque.
        try {
            await supabase.rpc("delete_my_otp_verification");
        } catch (err) {
            console.warn("[AUTH] delete_my_otp_verification failed", err);
        }
    }

    const { error } = await supabase.auth.signOut({ scope: options?.everywhere ? "global" : "local" });
    if (error) throw error;
    if (typeof window !== "undefined") {
        sessionStorage.removeItem("passwordRecoveryFlow");
        clearSignupLeftovers();
    }
}

// Recupera sessione corrente
export async function getCurrentUser() {
    const {
        data: { user }
    } = await supabase.auth.getUser();
    return user;
}

// Reset password (invia email)
export async function resetPassword(email: string) {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
    });
    if (error) throw error;
    return data;
}

// Conferma della registrazione con il codice della mail (lo stesso messaggio
// porta anche il link). Va a buon fine → sessione aperta, e il trigger su
// auth.users conta la conferma come verifica OTP per 30 giorni.
export async function verifySignupCode(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (error) throw error;
    return data;
}

// Reinvia email di conferma signup
export async function resendConfirmationEmail(email: string) {
    const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
            emailRedirectTo: `${window.location.origin}/email-confirmed`
        }
    });
    if (error) throw error;
}
