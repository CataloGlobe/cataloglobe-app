// Shared OTP primitives — code generation + hashing + shared tuning constants.
// Used by: send-otp, verify-otp, status-otp (JWT-authenticated 2FA flow, keyed
// by auth_user_id) and recover-account (service-role flow, keyed by user_id
// resolved server-side from email — no caller JWT). Both write/read the same
// otp_challenges table with the same hash scheme, so a code sent by one path
// verifies correctly against the other's logic.

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 min
export const COOLDOWN_MS = 60 * 1000; // 60 sec tra invii
export const WINDOW_MS = 15 * 60 * 1000; // finestra rate limit invii
export const MAX_SENDS_PER_WINDOW = 5;
export const LOCK_MINUTES = 15;

export function generateOtp(): string {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function hashOtp(code: string, pepper: string): Promise<string> {
    return sha256(code + pepper);
}
