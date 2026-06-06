import { todayIsoDate } from "@/utils/dateLocal";
import type { FormFields } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
// Lenient phone format: allow +, digits, spaces, dashes, parentheses, dots.
// Do NOT enforce a national format — international numbers must pass.
const PHONE_ALLOWED_CHARS_RE = /^[+\d\s\-().]+$/;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 20;

// Re-export so existing consumers (`./ReservationForm.tsx`) keep their
// current import path without churn.
export { todayIsoDate };

// Snap "HH:MM" to the nearest quarter-hour (0/15/30/45). Used at change/blur
// of the native time input because `step={900}` is not enforced on iOS —
// the wheel-spinner still lets the user land on :41 etc. Empty or partial
// values are returned unchanged so we don't fight the user mid-typing.
// Rollover: 19:53 → 20:00; 23:53 → 00:00 (next-day wrap is intentional).
export function snapTimeToQuarter(time: string): string {
    if (time.length < 5) return time;
    if (!TIME_HHMM_RE.test(time)) return time;
    const hhNum = Number(time.slice(0, 2));
    const mmNum = Number(time.slice(3, 5));
    if (!Number.isFinite(hhNum) || !Number.isFinite(mmNum)) return time;
    if (hhNum > 23 || mmNum > 59) return time;
    const rounded = Math.round(mmNum / 15) * 15;
    let h = hhNum;
    let m: number;
    if (rounded === 60) {
        m = 0;
        h = (hhNum + 1) % 24;
    } else {
        m = rounded;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const TIME_HHMM_RE = /^\d{2}:\d{2}/;

export function validateField(name: keyof FormFields, value: string): string | null {
    const v = value.trim();
    if (name === "reservation_date") {
        if (!v || !DATE_RE.test(v)) return "Inserisci una data valida.";
        if (v < todayIsoDate()) return "La data non può essere nel passato.";
        return null;
    }
    if (name === "reservation_time") {
        if (!v || !TIME_RE.test(v)) return "Inserisci un orario valido.";
        return null;
    }
    if (name === "party_size") {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
            return "Numero di persone tra 1 e 50.";
        }
        return null;
    }
    if (name === "customer_name") {
        if (!v) return "Il nome è obbligatorio.";
        if (v.length > 200) return "Il nome è troppo lungo.";
        return null;
    }
    if (name === "customer_email") {
        if (!v) return "L'email è obbligatoria.";
        if (!EMAIL_RE.test(v) || v.length > 320) return "Inserisci un'email valida.";
        return null;
    }
    if (name === "customer_phone") {
        if (!v) return "Il telefono è obbligatorio.";
        if (v.length > 50) return "Il telefono è troppo lungo.";
        if (!PHONE_ALLOWED_CHARS_RE.test(v)) {
            return "Inserisci un numero di telefono valido.";
        }
        const digits = v.replace(/\D/g, "");
        if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
            return "Inserisci un numero di telefono valido.";
        }
        return null;
    }
    if (name === "notes") {
        if (v.length > 500) return "Massimo 500 caratteri.";
        return null;
    }
    return null;
}
