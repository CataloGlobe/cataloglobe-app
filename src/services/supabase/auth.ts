import { supabase, setRememberMe } from "./client";

type SignInOptions = {
    rememberMe?: boolean;
};

// Sign-up (registrazione)
export async function signUp(email: string, password: string, name?: string) {
    const redirectUrl = `${window.location.origin}/login`;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { name },
            emailRedirectTo: redirectUrl
        }
    });

    if (error) throw error;
    return data;
}

// Login
export async function signIn(email: string, password: string, options?: SignInOptions) {
    // ✅ setta la preferenza PRIMA di fare login (così il client usa lo storage giusto)
    if (typeof options?.rememberMe === "boolean") {
        setRememberMe(options.rememberMe);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

// Logout
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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

// authStatus.ts
const OTP_VALIDATED_USER_ID_KEY = "otpValidatedUserId";

export function isOtpValidated(userId?: string | null): boolean {
    if (!userId) return false;
    return localStorage.getItem(OTP_VALIDATED_USER_ID_KEY) === userId;
}

export function setOtpValidatedForUser(userId: string) {
    localStorage.setItem(OTP_VALIDATED_USER_ID_KEY, userId);
}

export function clearOtpValidated() {
    localStorage.removeItem(OTP_VALIDATED_USER_ID_KEY);
}
