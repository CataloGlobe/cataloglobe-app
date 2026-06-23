import { DISPOSABLE_EMAIL_DOMAINS } from '@/constants/disposableEmailDomains';

/**
 * Verifica il formato di un'email lato client.
 * Richiede un dominio con TLD esplicito (>= 2 caratteri): blocca `lo@gmail`,
 * accetta `lo@gmail.com`. Non sostituisce la validazione server di Supabase.
 */
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Controlla se un'email usa un dominio temporaneo/disposable.
 * Restituisce true se l'email è bloccata.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
