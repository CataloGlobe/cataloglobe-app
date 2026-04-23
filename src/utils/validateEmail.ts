import { DISPOSABLE_EMAIL_DOMAINS } from '@/constants/disposableEmailDomains';

/**
 * Controlla se un'email usa un dominio temporaneo/disposable.
 * Restituisce true se l'email è bloccata.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
