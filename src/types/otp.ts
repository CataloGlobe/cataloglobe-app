// src/types/otp.ts
export type OtpErrorCode =
    | "invalid_or_expired"
    | "cooldown"
    | "locked"
    | "rate_limited"
    | "unauthorized"
    | "unknown";

export type OtpStatus = "idle" | "sending" | "verifying";

export type VerifyOtpResponse = {
    attempts_left?: number;
    max_attempts?: number;
};
