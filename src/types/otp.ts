// src/types/otp.ts
export type OtpErrorCode =
    | "invalid_or_expired"
    | "cooldown"
    | "locked"
    | "rate_limited"
    | "unauthorized"
    | "unknown";

export type OtpStatus = "idle" | "sending" | "verifying";
