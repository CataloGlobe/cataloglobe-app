import type { FormFields } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
        return null;
    }
    if (name === "notes") {
        if (v.length > 500) return "Massimo 500 caratteri.";
        return null;
    }
    return null;
}
