// ⚠️ SYNC: sincronizzare con `src/config/company.ts`
// Il backend Deno non può importare da `src/`, quindi duplicazione consapevole.
// Quando modifichi uno, modifica anche l'altro nello stesso commit.
// Stesso pattern di `scheduleResolver.ts` / `schedulingNow.ts`.

import { resolveEmailLang, type EmailLang } from "./emailLang.ts";

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
 * Le due frasi del footer che sono NOSTRE, nelle cinque lingue delle email al
 * cliente. Tutto il resto del footer è dato legale — ragione sociale, indirizzo,
 * partita IVA, indirizzi email — e non si traduce in nessuna lingua: sono
 * identificatori, non testo.
 *
 * `defaultReason` serve solo alle email agli utenti registrati, che oggi sono
 * tutte italiane: sta qui per completezza della tabella, non perché qualcuno la
 * chiami in un'altra lingua.
 */
const FOOTER_COPY: Record<EmailLang, {
  privacyRequests: string;
  tradeName: (businessName: string, legalName: string) => string;
  defaultReason: (businessName: string) => string;
}> = {
  it: {
    privacyRequests: "Per richieste relative ai tuoi dati personali:",
    tradeName: (b, l) => `${b} è il nome commerciale di ${l}, ditta individuale.`,
    defaultReason: b => `Hai ricevuto questa email perché sei registrato su ${b}.`
  },
  en: {
    privacyRequests: "For requests about your personal data:",
    tradeName: (b, l) => `${b} is the trading name of ${l}, sole trader.`,
    defaultReason: b => `You're receiving this email because you have an account on ${b}.`
  },
  fr: {
    privacyRequests: "Pour toute demande concernant vos données personnelles :",
    tradeName: (b, l) => `${b} est le nom commercial de ${l}, entreprise individuelle.`,
    defaultReason: b => `Vous recevez cet e-mail car vous êtes inscrit sur ${b}.`
  },
  de: {
    privacyRequests: "Für Anfragen zu Ihren personenbezogenen Daten:",
    tradeName: (b, l) => `${b} ist der Handelsname von ${l}, Einzelunternehmen.`,
    defaultReason: b => `Sie erhalten diese E-Mail, weil Sie bei ${b} registriert sind.`
  },
  es: {
    privacyRequests: "Para solicitudes sobre tus datos personales:",
    tradeName: (b, l) => `${b} es el nombre comercial de ${l}, empresario individual.`,
    defaultReason: b => `Recibes este correo porque estás registrado en ${b}.`
  }
};

/**
 * Footer email standard con dati legali per email transazionali.
 * Da usare nelle 4 edge functions email (send-otp, join-waitlist, send-tenant-invite, submit-review).
 *
 * `reason` opzionale sostituisce la riga "Hai ricevuto questa email perché sei registrato su ...".
 * Da usare per email a destinatari NON registrati (es. clienti che hanno richiesto una
 * prenotazione presso una sede tramite la piattaforma). Senza `reason` il comportamento è
 * invariato (utenti registrati).
 *
 * `lang` opzionale traduce le due frasi nostre del footer. Serve alle email di
 * prenotazione, che parlano la lingua del cliente: un blocco legale italiano in
 * fondo a un'email tedesca è esattamente l'incoerenza che quelle email
 * eliminano. Omesso o non supportato → italiano, quindi tutti i chiamanti
 * storici producono output identico al carattere.
 */
export function getEmailFooterText(reason?: string, lang?: string | null): string {
  const c = COMPANY;
  const f = FOOTER_COPY[resolveEmailLang(lang)];
  const addr = `${c.legalAddress.street}, ${c.legalAddress.streetNumber}, ${c.legalAddress.postalCode} ${c.legalAddress.city} (${c.legalAddress.province})`;
  const reasonLine = reason ?? f.defaultReason(c.businessName);
  return `
---
${c.businessName}
${addr}
P.IVA: ${c.vatNumber}
Email: ${c.contact.support}
Privacy: ${c.web.privacyUrl}

${reasonLine}
${f.privacyRequests} ${c.contact.privacy}

${f.tradeName(c.businessName, c.legalName)}
`.trim();
}

/**
 * Versione HTML del footer per email transazionali HTML.
 * `reason` e `lang` opzionali: vedi doc su getEmailFooterText.
 */
export function getEmailFooterHtml(reason?: string, lang?: string | null): string {
  const c = COMPANY;
  const f = FOOTER_COPY[resolveEmailLang(lang)];
  const addr = `${c.legalAddress.street}, ${c.legalAddress.streetNumber}, ${c.legalAddress.postalCode} ${c.legalAddress.city} (${c.legalAddress.province})`;
  const reasonLine = reason ?? f.defaultReason(c.businessName);
  return `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; line-height: 1.5;">
  <div style="margin-bottom: 8px;"><strong>${c.businessName}</strong></div>
  <div>${addr}</div>
  <div>P.IVA: ${c.vatNumber}</div>
  <div style="margin-top: 8px;">
    <a href="mailto:${c.contact.support}" style="color: #6b7280;">${c.contact.support}</a> ·
    <a href="${c.web.privacyUrl}" style="color: #6b7280;">Privacy Policy</a>
  </div>
  <div style="margin-top: 12px; font-size: 11px;">
    ${reasonLine}<br>
    ${f.privacyRequests} <a href="mailto:${c.contact.privacy}" style="color: #6b7280;">${c.contact.privacy}</a>
  </div>
  <div style="margin-top: 12px; font-size: 10px; color: #9ca3af;">
    ${f.tradeName(c.businessName, c.legalName)}
  </div>
</div>
`.trim();
}
