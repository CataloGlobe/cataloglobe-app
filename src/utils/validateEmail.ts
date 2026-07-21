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
 * Estrae il dominio da un'email, normalizzato (lowercase + trim).
 * Ritorna stringa vuota se l'email non ha un dominio.
 */
export function extractEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase().trim() ?? '';
}

/**
 * Controlla se il dominio di un'email è nel set fornito, sul dominio ESATTO
 * o su un suo dominio genitore (sottodominio bloccato se il genitore è in
 * blacklist — es. `x.mailinator.com` bloccato se `mailinator.com` è listato).
 * Pura, riusabile sia col set client-side (nicety UX, lista corta) sia con
 * un set più ampio lato server (gate autoritativo, vedi migration
 * 20260720224101_block_disposable_email_signup.sql + tabella
 * public.disposable_domains — stesso criterio di match, normalizzazione
 * duplicata lì in SQL: lower(trim(split_part(email, '@', 2)))).
 */
export function isDisposableEmailDomain(
  email: string,
  domainSet: ReadonlySet<string>
): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (domainSet.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * Controlla se un'email usa un dominio temporaneo/disposable (lista
 * client-side corta, solo per feedback UX immediato pre-submit). Il gate
 * autoritativo è server-side — vedi commento su `isDisposableEmailDomain`.
 */
export function isDisposableEmail(email: string): boolean {
  return isDisposableEmailDomain(email, DISPOSABLE_EMAIL_DOMAINS);
}
