/**
 * Configurazione centralizzata dati legali aziendali.
 *
 * Source of truth per:
 * - Privacy Policy (sezione "Titolare del trattamento")
 * - Termini e Condizioni (titolare contratto)
 * - Footer landing page (contatti, link)
 * - Footer pagina pubblica (Powered by)
 * - Metadata SEO (schema.org Organization JSON-LD)
 * - Stripe Dashboard (configurato lì, NON da qui)
 *
 * ⚠️ SYNC: questo file è duplicato in `supabase/functions/_shared/company-config.ts`
 * perché il backend Deno non può importare da `src/`. Quando modifichi uno, modifica
 * anche l'altro nello stesso commit. Stesso pattern di `scheduleResolver.ts`.
 */

export const COMPANY = {
  // --- Dati anagrafici ---
  legalName: "CataloGlobe di D'Elia Alessandro",
  ownerName: "Alessandro D'Elia",
  businessName: "CataloGlobe",

  // --- Fiscalità ---
  vatNumber: "14689790963",         // 11 cifre, senza prefisso IT
  vatNumberEu: "IT14689790963",     // con prefisso UE per fatturazione intra-EU
  fiscalCode: "DLELSN00A28I690P",   // ⚠️ NON esporre in UI pubblica
  reaCode: "MI-2801544",
  ateco: "62.10.00",
  taxRegime: "forfettario",

  // --- Sede legale ---
  legalAddress: {
    street: "Via Verdi",
    streetNumber: "30",
    postalCode: "20092",
    city: "Cinisello Balsamo",
    province: "MI",
    country: "IT",
  },

  // --- Contatti email ---
  contact: {
    privacy: "privacy@cataloglobe.com",
    support: "support@cataloglobe.com",
    legal: "legal@cataloglobe.com",
    info: "info@cataloglobe.com",
    pec: "alessandro.delia@pec.fiscozen.it",
    phone: "",  // non pubblico per ora
  },

  // --- Web presence ---
  web: {
    homepage: "https://cataloglobe.com",
    privacyUrl: "https://cataloglobe.com/legal/privacy",
    termsUrl: "https://cataloglobe.com/legal/termini",
  },

  // --- Social media (vuoti per ora) ---
  social: {
    instagram: "",
    facebook: "",
    linkedin: "",
    twitter: "",
  },

  // --- Email transazionali (Resend) ---
  email: {
    noreply: "noreply@cataloglobe.com",
    sender: "CataloGlobe <noreply@cataloglobe.com>",
    senderName: "CataloGlobe",
  },

  // --- Termini e condizioni ---
  legal: {
    // Foro competente provvisorio: Tribunale di Monza
    // (Cinisello Balsamo è sotto la giurisdizione del Tribunale di Monza dal 2013,
    // a seguito della revisione delle circoscrizioni giudiziarie).
    // ⚠️ Da validare con avvocato come parte della revisione legale completa
    // di Privacy + Termini (P0 in Notion: "Revisione legale completa Privacy + Termini").
    forum: "Monza",
  },
} as const;

/**
 * Helper: indirizzo completo formattato su una riga.
 * Esempio: "Via Verdi, 30, 20092 Cinisello Balsamo (MI), Italia"
 */
export function getFullAddress(): string {
  const { street, streetNumber, postalCode, city, province, country } = COMPANY.legalAddress;
  const countryName = country === "IT" ? "Italia" : country;
  return `${street}, ${streetNumber}, ${postalCode} ${city} (${province}), ${countryName}`;
}

/**
 * Helper: schema.org Organization JSON-LD per index.html.
 * Da iniettare come <script type="application/ld+json"> dal prompt 3.2.
 */
export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: COMPANY.businessName,
    legalName: COMPANY.legalName,
    url: COMPANY.web.homepage,
    description: "Piattaforma SaaS per cataloghi digitali multi-tenant",
    address: {
      "@type": "PostalAddress",
      streetAddress: `${COMPANY.legalAddress.street}, ${COMPANY.legalAddress.streetNumber}`,
      postalCode: COMPANY.legalAddress.postalCode,
      addressLocality: COMPANY.legalAddress.city,
      addressRegion: COMPANY.legalAddress.province,
      addressCountry: COMPANY.legalAddress.country,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      email: COMPANY.contact.support,
      availableLanguage: ["Italian"],
    },
  };
}
