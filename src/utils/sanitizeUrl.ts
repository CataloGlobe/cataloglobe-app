/**
 * Sanitizza un URL per uso sicuro in href.
 * Blocca protocolli pericolosi (javascript:, data:, vbscript:).
 * Se l'URL non ha protocollo, aggiunge https://.
 * Restituisce '#' per URL invalidi o vuoti.
 */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || !url.trim()) return '#';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}
