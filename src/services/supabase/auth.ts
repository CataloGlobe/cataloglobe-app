import { supabase, setRememberMe } from "@/services/supabase/client";
import { CURRENT_CONSENT_VERSIONS } from "@/config/consentVersions";

type SignInOptions = {
    rememberMe?: boolean;
};

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
export async function signIn(email: string, password: string, options?: SignInOptions) {
    if (typeof options?.rememberMe === "boolean") {
        setRememberMe(options.rememberMe);
    }

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

// Logout
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (typeof window !== "undefined") {
        sessionStorage.removeItem("passwordRecoveryFlow");
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
