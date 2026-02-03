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
