// ⚠️ SYNC: sincronizzare con `src/config/company.ts`
// Il backend Deno non può importare da `src/`, quindi duplicazione consapevole.
// Quando modifichi uno, modifica anche l'altro nello stesso commit.
// Stesso pattern di `scheduleResolver.ts` / `schedulingNow.ts`.

export const COMPANY = {
  legalName: "CataloGlobe di D'Elia Alessandro",
  ownerName: "Alessandro D'Elia",
  businessName: "CataloGlobe",

  vatNumber: "14689790963",
  vatNumberEu: "IT14689790963",
  ateco: "62.10.00",

  legalAddress: {
    street: "Via Verdi",
    streetNumber: "30",
    postalCode: "20092",
    city: "Cinisello Balsamo",
    province: "MI",
    country: "IT",
  },

  contact: {
    privacy: "privacy@cataloglobe.com",
    support: "support@cataloglobe.com",
    legal: "legal@cataloglobe.com",
    info: "info@cataloglobe.com",
    pec: "alessandro.delia@pec.fiscozen.it",
  },

  web: {
    homepage: "https://cataloglobe.com",
    privacyUrl: "https://cataloglobe.com/legal/privacy",
    termsUrl: "https://cataloglobe.com/legal/termini",
  },

  email: {
    noreply: "noreply@cataloglobe.com",
    sender: "CataloGlobe <noreply@cataloglobe.com>",
    senderName: "CataloGlobe",
  },
} as const;

/**
 * Footer email standard con dati legali per email transazionali.
 * Da usare nelle 4 edge functions email (send-otp, join-waitlist, send-tenant-invite, submit-review).
 */
export function getEmailFooterText(): string {
  const c = COMPANY;
  const addr = `${c.legalAddress.street}, ${c.legalAddress.streetNumber}, ${c.legalAddress.postalCode} ${c.legalAddress.city} (${c.legalAddress.province})`;
  return `
---
${c.legalName}
${addr}
P.IVA: ${c.vatNumber}
Email: ${c.contact.support}
Privacy: ${c.web.privacyUrl}

Hai ricevuto questa email perché sei registrato su ${c.businessName}.
Per richieste relative ai tuoi dati personali: ${c.contact.privacy}
`.trim();
}

/**
 * Versione HTML del footer per email transazionali HTML.
 */
export function getEmailFooterHtml(): string {
  const c = COMPANY;
  const addr = `${c.legalAddress.street}, ${c.legalAddress.streetNumber}, ${c.legalAddress.postalCode} ${c.legalAddress.city} (${c.legalAddress.province})`;
  return `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; line-height: 1.5;">
  <div style="margin-bottom: 8px;"><strong>${c.legalName}</strong></div>
  <div>${addr}</div>
  <div>P.IVA: ${c.vatNumber}</div>
  <div style="margin-top: 8px;">
    <a href="mailto:${c.contact.support}" style="color: #6b7280;">${c.contact.support}</a> ·
    <a href="${c.web.privacyUrl}" style="color: #6b7280;">Privacy Policy</a>
  </div>
  <div style="margin-top: 12px; font-size: 11px;">
    Hai ricevuto questa email perché sei registrato su ${c.businessName}.<br>
    Per richieste relative ai tuoi dati personali: <a href="mailto:${c.contact.privacy}" style="color: #6b7280;">${c.contact.privacy}</a>
  </div>
</div>
`.trim();
}
