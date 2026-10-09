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

/**
 * Href per link esterni scritti dal locale (CTA dei contenuti in evidenza,
 * sito, Facebook, recensioni Google, storia): solo http/https, così un
 * `javascript:` salvato scavalcando il form non arriva mai alla pagina
 * pubblica. Senza schema aggiunge https://. `undefined` = link spento.
 */
export function safeHttpHref(url: string | null | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
