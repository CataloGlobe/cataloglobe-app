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
 * Le parole NOSTRE del footer, nelle cinque lingue delle email al cliente.
 *
 * Il footer è corto per scelta (deciso da Lorenzo il 2026-10-10): nome, tre
 * link e, solo dove serve, il perché della mail. Ragione sociale, indirizzo e
 * partita IVA non sono obbligatori in ogni email di servizio: basta che siano
 * facilmente raggiungibili (d.lgs. 70/2003, art. 7), e lo sono sulle pagine
 * Privacy e Termini del sito. Restano per intero solo nelle mail commerciali
 * (`legal: true`, oggi la lista d'attesa).
 */
const FOOTER_COPY: Record<EmailLang, { support: string; privacy: string; terms: string }> = {
  it: { support: "Assistenza", privacy: "Privacy", terms: "Termini" },
  en: { support: "Support", privacy: "Privacy", terms: "Terms" },
  fr: { support: "Assistance", privacy: "Confidentialité", terms: "Conditions" },
  de: { support: "Hilfe", privacy: "Datenschutz", terms: "AGB" },
  es: { support: "Ayuda", privacy: "Privacidad", terms: "Términos" }
};

export interface EmailFooterOptions {
  /**
   * Il perché della mail, già nella lingua giusta. Solo per chi non ha un
   * account (il cliente finale di una prenotazione): il ristoratore sa perché
   * riceve le mail del suo gestionale.
   */
  reason?: string;
  /** Lingua delle etichette dei link. Omessa → italiano. */
  lang?: string | null;
  /** Dati legali completi: solo nelle mail commerciali. */
  legal?: boolean;
}

function legalLine(): string {
  const c = COMPANY;
  const a = c.legalAddress;
  return `${c.legalName} · ${a.street} ${a.streetNumber}, ${a.postalCode} ${a.city} (${a.province}) · P.IVA ${c.vatNumber}`;
}

/** Footer in testo semplice, per la parte `text` delle email. */
export function getEmailFooterText(opts: EmailFooterOptions = {}): string {
  const c = COMPANY;
  const lines = [
    "—",
    `${c.businessName} · ${c.contact.support} · ${c.web.privacyUrl}`
  ];
  if (opts.reason) lines.push(opts.reason);
  if (opts.legal) lines.push(legalLine());
  return lines.join("\n");
}

/**
 * Footer HTML, fuori dalla scheda della mail. Gli stili sono inline perché i
 * client di posta tolgono `<style>`.
 */
export function getEmailFooterHtml(opts: EmailFooterOptions = {}): string {
  const c = COMPANY;
  const f = FOOTER_COPY[resolveEmailLang(opts.lang)];
  const link = (href: string, label: string) =>
    `<a href="${href}" style="color:#6b7280;text-decoration:underline">${label}</a>`;
  const extra: string[] = [];
  if (opts.reason) extra.push(`<p style="margin:8px 0 0">${opts.reason}</p>`);
  if (opts.legal) extra.push(`<p style="margin:8px 0 0">${legalLine()}</p>`);
  return `<p style="margin:0"><strong style="color:#374151">${c.businessName}</strong> · ${link(`mailto:${c.contact.support}`, f.support)} · ${link(c.web.privacyUrl, f.privacy)} · ${link(c.web.termsUrl, f.terms)}</p>${extra.join("")}`;
}
