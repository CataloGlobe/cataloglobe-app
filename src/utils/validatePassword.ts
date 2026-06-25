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
