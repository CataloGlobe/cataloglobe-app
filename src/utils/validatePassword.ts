/**
 * Criteri password lato client. Allineati alla policy Supabase
 * "Lowercase, uppercase letters and digits" (nessun simbolo richiesto).
 */
export interface PasswordChecks {
  minLength: boolean; // >= 8 caratteri
  lowercase: boolean; // almeno una [a-z]
  uppercase: boolean; // almeno una [A-Z]
  digit: boolean; // almeno un [0-9]
}

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}

/** True se la password soddisfa tutti i criteri. */
export function isStrongPassword(password: string): boolean {
  const checks = getPasswordChecks(password);
  return checks.minLength && checks.lowercase && checks.uppercase && checks.digit;
}

/**
 * Riconosce i messaggi di rifiuto password lato server (Supabase Auth),
 * per instradarli a un errore inline sensato invece di un fallback generico.
 */
export function isWeakPasswordError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("weak_password") ||
    m.includes("password should") ||
    m.includes("password is too") ||
    m.includes("password must")
  );
}

/**
 * Messaggio per una password rifiutata da Supabase Auth, dal motivo vero.
 * Con «password trapelate» acceso il server rifiuta anche password che
 * passano i controlli del client (es. `Test_1234`): `weak_password` con
 * `reasons: ["pwned"]`, e il messaggio inglese non dice «password should».
 * `null` se l'errore non è una password rifiutata.
 */
export function weakPasswordMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { name?: unknown; code?: unknown; message?: unknown; reasons?: unknown };
  const isWeak =
    e.name === "AuthWeakPasswordError" ||
    e.code === "weak_password" ||
    (typeof e.message === "string" && (isWeakPasswordError(e.message) || /known to be weak/i.test(e.message)));
  if (!isWeak) return null;
  const reasons = Array.isArray(e.reasons) ? e.reasons : [];
  if (reasons.includes("pwned") || (typeof e.message === "string" && /known to be weak|pwned/i.test(e.message))) {
    return "Questa password è comparsa in fughe di dati di altri siti: scegline un'altra.";
  }
  if (reasons.includes("length")) return "La password deve avere almeno 8 caratteri.";
  if (reasons.includes("characters")) return "La password deve contenere minuscole, maiuscole e numeri.";
  return "La password non soddisfa i requisiti di sicurezza.";
}
