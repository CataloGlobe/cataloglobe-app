# Audit dati legali — CataloGlobe

Data: 2026-05-17
Scope: ditta individuale (Alessandro, ATECO 62.10.00, P.IVA/CF da attribuire)
Stack: React 19 + Vite 7 + Supabase + Stripe
Status: **BLOCCO PRE-LAUNCH** — 7 placeholder espliciti (4 in Privacy + 3 in Termini) + 14 occorrenze hardcoded + assenze critiche

---

## Summary

| Metrica | Valore |
|---------|--------|
| **Placeholder espliciti trovati** | 7 (4 Privacy + 3 Termini) |
| **Stringhe hardcoded duplicate** | 14 occorrenze su 3 valori unici |
| **Dati mancanti (assenze)** | 6 aree critiche (incl. cookie banner GDPR) |
| **File toccati** | 14 file (sorgenti + funzioni) |
| **Criticità legale** | ALTA (Privacy + Termini incompleti, nessun schema.org, nessun sitemap.xml, nessun cookie banner GDPR) |

---

## 1. Pagine legali (`/legal/*`)

### Area: Privacy Policy
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/pages/Legal/PrivacyPolicyPage.tsx`

| Riga | Tipo | Contesto | Stato |
|------|------|----------|-------|
| 44 | **Placeholder esplicito** | `[NOME TITOLARE]` | ❌ **DA SOSTITUIRE** |
| 45 | **Placeholder esplicito** | `[INDIRIZZO SEDE]` | ❌ **DA SOSTITUIRE** |
| 46 | **Placeholder esplicito** | `[P.IVA]` | ❌ **DA SOSTITUIRE** |
| 47 | **Placeholder esplicito** | `[EMAIL PRIVACY]` | ❌ **DA SOSTITUIRE** |

**Contenuto della sezione 1 "Titolare del trattamento":**
```
Il Titolare del trattamento dei dati personali è:
  [NOME TITOLARE]
  Sede legale: [INDIRIZZO SEDE]
  Partita IVA: [P.IVA]
  Email privacy: [EMAIL PRIVACY]
```

**Stato:** Privacy generica ben strutturata (GDPR-compliant). Sezioni:
- 02: Tipologie dati raccolti ✅ (dettagliate: input utente, automatici, analytics anonimi, recensioni)
- 03: Finalità trattamento ✅
- 04: Base giuridica ✅
- 05: Conservazione ✅
- 06: Diritti interessato ✅
- 07: Cookie Policy ✅ (spiega localStorage, sessionStorage, Google Fonts, Supabase)
- 08: Condivisione dati ✅ (Supabase, Stripe, Resend citati)
- 09: Modifiche ✅

**Mancanze:** Nessun riferimento a PEC (obbligatoria per ditte individuali in Italia se hanno fatturato > 30k o hanno aperta la contabilità IVA).

### Area: Termini e Condizioni
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/pages/Legal/TermsPage.tsx`

Route `/legal/termini` montata in `src/App.tsx:237` → componente `TermsPage` (nome file `TermsPage.tsx`, non `TerminiPage.tsx`). Last updated `2026-04-12`.

**Placeholder espliciti:**

| Riga | Tipo | Contesto | Stato |
|------|------|----------|-------|
| 143 | **Placeholder esplicito** | `[NOME TITOLARE]` | ❌ Sezione 04 "Proprietà intellettuale" |
| 285 | **Placeholder esplicito** | `[FORO COMPETENTE]` | ❌ Sezione 09 "Legge applicabile e foro competente" |
| 318 | **Placeholder esplicito** | `[EMAIL PRIVACY]` | ❌ Sezione 10 "Disposizioni finali" |

**Sezioni presenti** (10 totali, struttura conforme a SaaS italiano standard):
- 01: Descrizione del servizio ✅
- 02: Accesso e condizioni d'uso (incl. età minima 18, OTP) ✅
- 03: Account e responsabilità (incl. responsabilità contenuti utente) ✅
- 04: Proprietà intellettuale ✅ (richiede `[NOME TITOLARE]`)
- 05: Limitazioni di responsabilità ✅
- 06: Disponibilità del servizio ✅
- 07: Abbonamento e pagamenti (Stripe citato, rinnovo automatico, rimborsi) ✅
- 08: Modifica dei termini (30 giorni preavviso) ✅
- 09: Legge applicabile e foro competente ✅ (richiede `[FORO COMPETENTE]`)
- 10: Disposizioni finali ✅ (richiede `[EMAIL PRIVACY]`)

**Mancanze rispetto a Terms&Conditions SaaS italiano standard:**
- ❌ **Sezione "Titolare del contratto"** assente. Il Termini non identifica esplicitamente il titolare (ragione sociale + P.IVA + sede) come fa la Privacy nella sezione 01. Andrebbe aggiunta sezione 00 o estesa sezione 01 con i dati anagrafici (`legal_name`, `vat_number`, `address`).
- ❌ **Diritto di recesso B2C (14 giorni)** non esplicitato per consumatori (D.Lgs. 206/2005 art. 52). Sezione 09 cita il Codice del Consumo ma non specifica il diritto di recesso entro 14 giorni dalla sottoscrizione.
- ❌ **Riferimento ODR EU** assente (link a [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr) — obbligatorio per servizi B2C online ai sensi del Reg. UE 524/2013).
- ⚠️ **PEC + email legale**: nessun riferimento. Per ditta individuale italiana iscritta al Registro Imprese, la PEC esiste obbligatoriamente e andrebbe esposta almeno per comunicazioni formali.
- ⚠️ **Data protection clause** breve: il rinvio alla Privacy Policy non è esplicito nel corpo del documento.

---

## 2. Footer landing page (`/`)

**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/pages/Landing/LandingPage.tsx`

| Riga | Tipo | Contesto | Note |
|------|------|----------|------|
| 187 | Hardcoded email | `mailto:alessandro.delia@cataloglobe.com` | ❌ Email privata esposta |
| 461,519,527 | Hardcoded URL | `https://cataloglobe.com/{DEMOS[active].slug}` | ❌ 4× occorrenze URL |
| 740 | Hardcoded email | `info@cataloglobe.com` | ❌ Email generica non assegnata |

**Footer content nel Landing:**
- Link `info@cataloglobe.com` senza assegnazione reale
- Link mailto con `alessandro.delia@cataloglobe.com` (nome persona esposto pubblicamente)
- **Mancanza:** Nessuna ragione sociale (es. "CataloGlobe di Alessandro Delia"), nessun indirizzo legale, nessun numero di telefono

**Criticità:** Email personale esposta → rischio spam e privacy personale compromessa.

---

## 3. Footer pagina pubblica (`/:slug`)

**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`

| Riga | Tipo | Contesto | Note |
|------|------|----------|------|
| 259 | Hardcoded URL | `href="https://cataloglobe.com"` | ❌ "Powered by" link |
| 288 | Hardcoded URL | `href="/legal/privacy"` | ✅ Relativo (OK) |
| 297 | Hardcoded URL | `href="/legal/termini"` | ✅ Relativo (OK) |

**Footer struttura:**
```
[Opening hours] [Fees] [Allergens] [Characteristics] [Social] 
  ↓
[Powered by CataloGlobe] ← link hardcoded https://cataloglobe.com
[Privacy Policy] · [Termini e Condizioni]
```

**Mancanza:** Nessuna info legale del **tenant** (nome azienda, indirizzo, contatti) — il footer è "generico" per tutte le pagine pubbliche. Per legge, il footer pubblico dovrebbe mostrare il nome del **titolare catalogo** (es. "Ristorante La Bella") + indirizzo.

**Nota:** Questo è OK se gestito correttamente lato attività (l'attività inserisce i propri dati), MA manca la validazione che ogni attività abbia indirizzo/nome pubblico.

---

## 3-bis. Pagina pubblica — stato attuale vs futuro

**Stato attuale:** la pagina pubblica `/:slug` offre solo **consultazione menu** (no ordinazione, no pagamenti, no e-commerce). In questa configurazione il footer pubblico **non è obbligato per legge** a esporre P.IVA + ragione sociale del ristorante cliente: il branding "Powered by CataloGlobe" + link a Privacy/Termini di CataloGlobe sono sufficienti.

**Quando attiverete l'ordinazione al tavolo come add-on a pagamento**, la pagina pubblica diventerà una piattaforma e-commerce e i requisiti cambieranno. Diventerà **obbligatorio** mostrare nel footer della pagina pubblica:
- Ragione sociale del ristorante cliente (titolare della transazione)
- P.IVA del ristorante cliente
- Indirizzo sede legale del ristorante cliente
- Email di contatto del ristorante cliente

Quei dati esistono già parzialmente sul modello `activities` (indirizzo, contatti) ma **mancano i campi fiscali**: `legal_name`, `vat_number` su `tenants` o `activities`.

**Conseguenza per la roadmap:** quando l'add-on ordini sarà in sviluppo, va riaperto un audit specifico su questa sezione **prima** che la feature vada in produzione. Va aggiunto come voce esplicita nella checklist pre-lancio della feature ordini.

---

## 4. Metadata e SEO

### index.html
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/index.html`

**Stato CRITICO:**

| Elemento | Stato | Note |
|----------|-------|------|
| `<title>` | ⚠️ Generico | "CataloGlobe" (no brand/descrizione) |
| `<meta name="description">` | ❌ Mancante | |
| `<meta name="author">` | ❌ Mancante | |
| `<meta property="og:*">` | ❌ Mancante | |
| `<script type="application/ld+json">` | ❌ Mancante | Schema.org JSON-LD per organizzazione |
| `<meta name="publisher">` | ❌ Mancante | |
| `<link rel="canonical">` | ❌ Mancante | |

**Contenuto attuale index.html:**
```html
<title>CataloGlobe</title>
<meta name="theme-color" content="#6B2DE6" />
<!-- Solo preconnect a Supabase e Google Fonts, no meta SEO/legal -->
```

### robots.txt
**Stato:** NON TROVATO. Mancanza SEO standard.

### sitemap.xml
**Stato:** NON TROVATO. Mancanza SEO standard (+ impatto su indicizzazione `/legal/*`).

### manifest.json
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/public/site.webmanifest` (verificare)

**Stato:** Probabilmente generico (no org name, no contact).

---

## 5. Email transazionali (Edge Functions)

### `send-otp`
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/functions/send-otp/index.ts`

| Aspetto | Valore | Stato |
|--------|--------|-------|
| Mittente | `CataloGlobe <noreply@cataloglobe.com>` | ❌ Hardcoded |
| Subject | `Il tuo codice di verifica` | ✅ OK |
| Footer legale | HTML: solo contenuto tecnico | ❌ Mancante footer |
| Unsubscribe link | ❌ Mancante | Necessario per email transazionali |
| Reply-to | ❌ Mancante | |

**Linea 279:**
```ts
from: "CataloGlobe <noreply@cataloglobe.com>",
```

### `join-waitlist`
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/functions/join-waitlist/index.ts`

| Aspetto | Valore | Stato |
|--------|--------|-------|
| Mittente | `CataloGlobe <noreply@cataloglobe.com>` | ❌ Hardcoded (occorrenza 2/3) |
| Subject | `Sei nella lista d'attesa di CataloGlobe!` | ✅ OK |
| Footer legale | ❌ Mancante | |

### `send-tenant-invite`
**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/functions/send-tenant-invite/index.ts`

| Aspetto | Valore | Stato |
|--------|--------|-------|
| APP_URL fallback | `https://cataloglobe.com` | ❌ Hardcoded (fallback) |
| Mittente | `CataloGlobe <noreply@cataloglobe.com>` | ❌ Hardcoded (occorrenza 3/3) |
| Subject | `Sei stato invitato a unirti a ${tenantName}...` | ✅ Dinamico |
| Footer legale | ❌ Mancante | |
| Unsubscribe | ❌ Mancante | |

**Linea 5:**
```ts
const APP_URL = Deno.env.get("APP_URL") ?? "https://cataloglobe.com";
```

**Linea 56:**
```ts
from: "CataloGlobe <noreply@cataloglobe.com>",
```

### `submit-review` (Resend)
**Stato:** Non verificato nel dettaglio, ma probabile stesso pattern.

**Sintesi email:**
- ✅ Resend configurato (RESEND_API_KEY env var)
- ❌ 3 occorrenze `noreply@cataloglobe.com` hardcoded
- ❌ APP_URL: 1 fallback hardcoded
- ❌ Nessun footer legale (senza ragione sociale, indirizzo, link informativa privacy)
- ❌ Nessun unsubscribe/opt-out (required per GDPR se continuative)

---

## 6. PDF generati

**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/functions/generate-menu-pdf/index.ts`

| Aspetto | Valore | Stato |
|--------|--------|-------|
| Brand text footer | `"Generato con CataloGlobe"` | ❌ Hardcoded (linea 1333) |
| Ragione sociale | ❌ Mancante nel footer PDF | |
| Indirizzo | ❌ Mancante nel footer PDF | |
| Copyright | ❌ Mancante | |

**Linea 1333:**
```ts
const brandText = "Generato con CataloGlobe";
```

**Mancanza critica:** PDF non contiene dati legali dell'azienda (titolare catalogo). Per legge, il PDF distribuito deve riportare chi lo ha creato (ragione sociale, non solo "CataloGlobe"). Attualmente il PDF mostra solo il catalogo senza colofone legale.

---

## 7. Stripe

**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/functions/stripe-checkout/index.ts`

| Aspetto | Valore | Stato |
|--------|--------|-------|
| Metadata tenant_id | ✅ Presente | |
| Metadata user_id | ✅ Presente | |
| Fiscal data (P.IVA) | ❌ Non inviata a Stripe | |
| Legal name (ragione sociale) | ❌ Non inviata a Stripe | |
| Address | ❌ Non inviata a Stripe | |
| VAT ID | ❌ Non inviato a Stripe | |

**Criticità:** Per una ditte individuali che emette fatture, Stripe dovrebbe avere:
- `description` = "Ragione Sociale (ATECO X.X)"
- `address` con dati reali
- Possibile: `tax_id` per calcoli VAT intra-UE

**Attualmente:** Stripe conosce solo tenant_id e user_id, non sa chi stia emettendo la fattura.

**Scope:** La configurazione dati fiscali Stripe va fatta nel **Dashboard Stripe**, non modificando codice. Le edge functions attuali (`stripe-checkout`, `stripe-webhook`, `stripe-portal`, `stripe-update-seats`) non sono interessate da questo cambio. Verificare in Dashboard:
- Settings → Business details → Public details (ragione sociale, indirizzo, email)
- Settings → Tax → European VAT registration (P.IVA italiana)

Per emettere fatture in Italia (obbligatorio dal primo cliente pagante), Stripe deve avere ragione sociale completa, P.IVA e indirizzo configurati. Senza questi dati le fatture sono fiscalmente irregolari.

---

## 8. Configurazione centralizzata

### Esiste `src/config/company.ts`?
**Stato:** ❌ **NO** — Mancanza assoluta.

### Esiste `src/constants/`?
**Stato:** ✅ **SÌ**
- `activityFees.ts` — tariffe fisse (non legali)
- `allergens.ts` — lista allergeni standard
- `catalogTheme.ts`
- `disposableEmailDomains.ts`
- `reservedSlugs.ts`
- `storageKeys.ts`
- `verticalTypes.ts`

**Nessun file per dati legali/aziendali.**

### Stringhe hardcoded duplicate trovate

| Stringa | Occorrenze | File |
|---------|-----------|------|
| `cataloglobe.com` | 10 | LandingPage.tsx (4), PublicFooter.tsx (1), send-tenant-invite (1 fallback), generate-menu-pdf (contesto), index.html (preconnect setup) |
| `noreply@cataloglobe.com` | 3 | send-otp.ts, join-waitlist.ts, send-tenant-invite.ts |
| `info@cataloglobe.com` | 1 | LandingPage.tsx |
| `CataloGlobe` | 15+ | Sparse (brand hardcoded) |

**Impatto:** Cambio ragione sociale = ripercorrere 14 file + deploy edge functions + rebuild.

---

## 9. Database

**File:** `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/supabase/migrations/`

**Stato:** ✅ **NO COLONNE LEGALI su `tenants`** — non trovate migrazioni che aggiungono:
- `legal_name` (ragione sociale)
- `vat_number` (P.IVA)
- `fiscal_code` (CF — solo per ditte individuali)
- `legal_address` (indirizzo sede legale)
- `pec` (posta certificata)

**Implicazione:** Nessun modo di memorizzare dati legali a livello tenant nel DB. Attualmente ogni tenant ha solo:
- `id`, `name`, `owner_user_id`, `logo_url`, `vertical_type`, `created_at`, `deleted_at`

**Questa è una mancanza strutturale.**

---

## 10. Cookie banner / Consent Management

La Privacy Policy (sezione 07) cita raccolta di analytics anonimi, localStorage, sessionStorage, Google Fonts e Supabase. Sotto GDPR + ePrivacy Directive + Linee Guida del Garante Privacy italiano (giugno 2021), **se viene impostato anche un solo cookie non-strettamente-tecnico prima del consenso, serve un cookie banner con consent management**.

**Ricerca filesystem:**

| Cosa cercato | Trovato |
|---|---|
| Componente cookie banner / consent UI | ⚠️ `src/components/ConsentBanner/ConsentBanner.tsx` esiste ma **non è un cookie banner GDPR** |
| Utility/servizio gestione consent cookie | ❌ Nessun `src/services/consent*` o `src/utils/consent*` per cookie. Esiste `@services/supabase/consent` ma serve `ConsentBanner` per re-accept ToS, non GDPR |
| `document.cookie` setter | ❌ Nessuna occorrenza in `src/` (solo `localStorage`/`sessionStorage`) |
| Cookie consent library (Cookiebot, Osano, Iubenda, Klaro, ecc.) | ❌ Nessuna integrazione |

**Dettaglio `ConsentBanner.tsx`:**
- Componente di re-accettazione **Privacy Policy + Termini di Servizio** per utenti loggati che devono accettare nuove condizioni. Chiama `recordConsent(userId)` (Supabase).
- **NON è un cookie banner GDPR**. Non gestisce categorie di cookie (necessari/analytics/marketing), non blocca esecuzione di script tracciatori prima del consenso, non ha cookie policy dedicata.
- Mostrato solo a utenti autenticati (richiede `userId`), mentre il cookie banner GDPR va mostrato anche ai visitatori anonimi.

**Cookie tecnici/storage effettivamente usati** (da Privacy Policy sezione 07):
- `localStorage` / `sessionStorage` (gestione sessione Supabase, preferenze tema, ecc.) → **strettamente tecnici**, esenti da consenso se usati solo per autenticazione/preferenze utente
- Google Fonts (caricati via `<link>` in `index.html` con `preconnect`) → **richiede consenso** se il caricamento avviene da CDN Google (trasferimento IP). Alternative: self-hosting font o `font-display: swap` con fallback locale.
- Supabase JS (anon key client) → cookie/storage tecnici per sessione

**Criticità ALTA — da aggiungere alla checklist pre-lancio:**
- ❌ Nessun cookie banner GDPR/ePrivacy implementato
- ❌ Nessuna cookie policy dedicata (la sezione 07 della Privacy è descrittiva ma non sostituisce una cookie policy con elenco cookie + finalità + durata + revoca consenso)
- ❌ Google Fonts caricati da CDN senza consenso preventivo (rischio sanzione, vedi sentenza LG München 2022)

**Azione raccomandata pre-launch:**
1. Decidere strategia: (a) self-host Google Fonts → elimina necessità consenso analytics, (b) implementare cookie banner GDPR-compliant con scelta granulare (necessari sempre / analytics opt-in / marketing opt-in).
2. Creare pagina `/legal/cookie-policy` separata da Privacy.
3. Distinguere chiaramente `ConsentBanner` (ToS re-accept) da `CookieBanner` (GDPR cookie consent). Rinominare in `TermsAcceptanceBanner` o equivalente per evitare ambiguità.

---

## Domande aperte

### 1. Codice fiscale titolare: esporre pubblicamente?
- **Ipotesi:** NO (come standard)
- **Caso:** Se si decide di fare un "colofone" legale nel sito pubblico, il CF personale NON va mai pubblicato
- **Azione:** Decidere se includere nel modello dati della ditta individuale

### 2. PEC: dove va?
- **PEC obbligatoria per ditte individuali in Italia.** Alessandro ha già una PEC attiva (richiesta in fase di iscrizione al Registro Imprese, DL 185/2008 art. 16 c. 6 + estensioni successive). Va censita nel file `src/config/company.ts` come campo `contact.pec`. Decisione di prodotto: pubblicarla solo nelle pagine legali (Privacy + Termini) oppure anche in footer landing. Domanda aperta per FiscoZen: quali email vanno esposte pubblicamente per compliance vs solo per rapporti istituzionali.

### 3. Quali dati legali esporta il backend al frontend?
- Attualmente: nulla (nessun endpoint per `/api/company-info`)
- **Mancanza:** GraphQL/REST per frontend di recuperare dati legali centralizzati

### 4. Indirizzo sede: convalidato o free-text?
- Landing page mostra `[INDIRIZZO SEDE]`
- Attualmente nessuno storico di convalida di indirizzi reali

### 5. Email per Privacy: responsabile dati vs. contatto generico?
- Privacy dice "Email privacy: [EMAIL PRIVACY]"
- Attualmente `noreply@` non è idonea per richieste GDPR
- **Azione:** Creare `privacy@cataloglobe.com` separata o fare alias su email reale

---

## Proposta di refactor (NON IMPLEMENTARE — solo analisi)

### File da creare: `src/config/company.ts`

```typescript
/**
 * Configurazione centralizzata dati legali aziendali.
 * 
 * ATTENZIONE: Questa è la source-of-truth per:
 * - Privacy Policy (sezione "Titolare")
 * - Footer pagina pubblica (colofone)
 * - Email transazionali (firma)
 * - Metadata SEO (schema.org)
 * - Stripe integration (description, address)
 * - PDF generation (brand footer)
 * 
 * Per cambiamenti: aggiornare SOLO questo file + deploy edge functions
 * (backend non può importare da src/, quindi i valori vanno anche in env var Supabase)
 */

export const COMPANY = {
  // --- Dati anagrafici ---
  legalName: "Alessandro Delia",  // TBD — Nome legale ditte individuale
  businessName: "CataloGlobe",    // Nome commerciale
  
  // --- Fiscalità ---
  vatNumber: "[P.IVA]",           // TBD — Formato: IT + 11 cifre
  fiscalCode: "[CF]",             // TBD — 16 caratteri (ditte individuali)
  ateco: "62.10.00",              // Sviluppo software web
  regime: "ordinario",            // "ordinario" | "semplificato" | "forfettario"
  
  // --- Sede legale ---
  legalAddress: {
    street: "[VIA]",              // TBD — via e numero civico
    postalCode: "[CAP]",          // TBD
    city: "[CITTÀ]",              // TBD
    province: "[PROVINCIA]",       // TBD
    country: "IT",
  },
  
  // --- Contatti ---
  contact: {
    privacy: "[privacy@cataloglobe.com]",  // TBD — GDPR requests
    support: "[support@cataloglobe.com]",  // TBD
    legal: "[legal@cataloglobe.com]",      // TBD — Terms & conditions
    pec: "[PEC]",                          // TBD — Posta certificata (opzionale, ma consigliato)
    phone: "[TEL]",                        // TBD
  },
  
  // --- Web presence ---
  web: {
    homepage: "https://cataloglobe.com",
    privacyUrl: "https://cataloglobe.com/legal/privacy",
    termsUrl: "https://cataloglobe.com/legal/termini",
    cookiePolicyUrl: "https://cataloglobe.com/legal/cookies",
  },
  
  // --- Social & branding ---
  social: {
    instagram: "cataloglobe",       // TBD
    facebook: "cataloglobe",        // TBD
    twitter: "cataloglobe",         // TBD
    linkedin: "cataloglobe",        // TBD
  },
  
  // --- Email transazionali ---
  email: {
    noreply: "noreply@cataloglobe.com",
    sender: "CataloGlobe <noreply@cataloglobe.com>",
    senderName: "CataloGlobe",
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Helper: schema.org Organization JSON-LD per index.html
// ─────────────────────────────────────────────────────────────

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": COMPANY.businessName,
    "legalName": COMPANY.legalName,
    "url": COMPANY.web.homepage,
    "logo": "https://cataloglobe.com/logo.png", // TBD — path reale
    "description": "Piattaforma SaaS per cataloghi digitali",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": COMPANY.legalAddress.street,
      "postalCode": COMPANY.legalAddress.postalCode,
      "addressLocality": COMPANY.legalAddress.city,
      "addressRegion": COMPANY.legalAddress.province,
      "addressCountry": COMPANY.legalAddress.country,
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Service",
      "email": COMPANY.contact.support,
      "telephone": COMPANY.contact.phone,
    },
    "sameAs": [
      `https://instagram.com/${COMPANY.social.instagram}`,
      `https://facebook.com/${COMPANY.social.facebook}`,
    ],
  };
}
```

### File da creare: `supabase/functions/_shared/company-config.ts`

**Pattern di sincronizzazione obbligatoria.** Il backend Deno non può importare da `src/`, quindi `src/config/company.ts` e `supabase/functions/_shared/company-config.ts` sono **duplicazione consapevole**. Pattern identico a `scheduleResolver.ts` e `schedulingNow.ts` documentato in `CLAUDE.md`. Entrambi i file devono iniziare con il commento:

```ts
// ⚠️ SYNC: sincronizzare con [path-altro-file]
```

Quando si modifica uno dei due, modificare anche l'altro nello stesso commit. Aggiungere una voce in `CLAUDE.md` sezione "Schema facts critici" per documentare questa duplicazione.

```typescript
// ⚠️ SYNC: sincronizzare con src/config/company.ts
/**
 * Replicazione CENTRALIZZATA di dati legali per Edge Functions.
 * 
 * IMPORTANTE: Sincronizzare SEMPRE con src/config/company.ts
 * (backend non può importare da src/, quindi duplicazione consapevole)
 */

export const COMPANY = {
  legalName: "Alessandro Delia",  // TBD
  businessName: "CataloGlobe",
  vatNumber: "[P.IVA]",           // TBD
  legalAddress: {
    street: "[VIA]",              // TBD
    city: "[CITTÀ]",              // TBD
    postalCode: "[CAP]",          // TBD
    province: "[PROVINCIA]",       // TBD
  },
  contact: {
    privacy: "[privacy@cataloglobe.com]",  // TBD
    support: "[support@cataloglobe.com]",  // TBD
    pec: "[PEC]",                          // TBD
  },
  web: {
    homepage: "https://cataloglobe.com",
    privacyUrl: "https://cataloglobe.com/legal/privacy",
  },
  email: {
    sender: "CataloGlobe <noreply@cataloglobe.com>",
  },
} as const;

export function emailFooter(): string {
  return `
---
${COMPANY.businessName}
${COMPANY.legalAddress.street}
${COMPANY.legalAddress.postalCode} ${COMPANY.legalAddress.city} (${COMPANY.legalAddress.province})
P.IVA: ${COMPANY.vatNumber}

Privacy: ${COMPANY.contact.privacy}
Informativa privacy: ${COMPANY.web.privacyUrl}
  `.trim();
}
```

### File da modificare (count: 14)

#### Frontend (7 file)

1. **`src/pages/Landing/LandingPage.tsx`**
   - Sostituire 4× `https://cataloglobe.com` → import da COMPANY
   - Sostituire `mailto:alessandro.delia@cataloglobe.com` → `mailto:${COMPANY.contact.support}`
   - Sostituire `mailto:info@cataloglobe.com` → `mailto:${COMPANY.contact.support}`

2. **`src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`**
   - Sostituire `href="https://cataloglobe.com"` → `href={COMPANY.web.homepage}`

3. **`src/pages/Legal/PrivacyPolicyPage.tsx`**
   - Sostituire `[NOME TITOLARE]` → `{COMPANY.legalName}`
   - Sostituire `[INDIRIZZO SEDE]` → `{COMPANY.legalAddress.street}, {COMPANY.legalAddress.postalCode} {COMPANY.legalAddress.city}`
   - Sostituire `[P.IVA]` → `{COMPANY.vatNumber}`
   - Sostituire `[EMAIL PRIVACY]` → `{COMPANY.contact.privacy}`

4. **`index.html`** (creazione schema.org)
   - Aggiungere `<meta name="description" content="..." />`
   - Aggiungere `<meta name="author" content="..." />`
   - Aggiungere `<meta property="og:title" content="..." />`
   - Aggiungere `<meta property="og:description" content="..." />`
   - Aggiungere `<script type="application/ld+json">` con output di `getOrganizationSchema()`

5. **`public/robots.txt`** (creazione)
   - Standard robots directives

6. **`public/sitemap.xml`** (creazione)
   - /legal/privacy, /legal/termini, /, public catalogs URL pattern

7. **`src/pages/Legal/TermsPage.tsx`** (FILE ESISTENTE — edit, non create)
   - Sostituire `[NOME TITOLARE]` (riga 143) → `{COMPANY.legalName}`
   - Sostituire `[FORO COMPETENTE]` (riga 285) → `{COMPANY.legalAddress.province}` o foro dedicato
   - Sostituire `[EMAIL PRIVACY]` (riga 318) → `{COMPANY.contact.privacy}` o `{COMPANY.contact.legal}`
   - Aggiungere sezione "00 Titolare del contratto" con ragione sociale, P.IVA, sede legale (da COMPANY)
   - Aggiungere paragrafo diritto di recesso B2C (14 giorni, D.Lgs. 206/2005 art. 52)
   - Aggiungere link piattaforma ODR EU `https://ec.europa.eu/consumers/odr`

#### Backend — Edge Functions (5 file)

8. **`supabase/functions/send-otp/index.ts`**
   - Importare `emailFooter()` da `_shared/company-config.ts`
   - Modificare `from:` per usare env var `COMPANY_SENDER_EMAIL`
   - Aggiungere footer legale all'HTML email

9. **`supabase/functions/join-waitlist/index.ts`**
   - Come send-otp

10. **`supabase/functions/send-tenant-invite/index.ts`**
    - Modificare `APP_URL` fallback per usare env var `APP_URL` senza fallback hardcoded
    - Importare `emailFooter()` da `_shared/company-config.ts`
    - Aggiungere footer legale

11. **`supabase/functions/submit-review/index.ts`**
    - Come send-otp (se usa Resend)

12. **`supabase/functions/generate-menu-pdf/index.ts`**
    - Sostituire `"Generato con CataloGlobe"` → `"Generato con ${COMPANY.businessName}"`
    - Aggiungere footer colofone con ragione sociale

#### Database (2 file)

13. **`supabase/migrations/YYYYMMDDHHMMSS_add_legal_fields_to_tenants.sql`**
    ```sql
    ALTER TABLE public.tenants ADD COLUMN legal_name TEXT;
    ALTER TABLE public.tenants ADD COLUMN vat_number TEXT;
    ALTER TABLE public.tenants ADD COLUMN fiscal_code TEXT;
    ALTER TABLE public.tenants ADD COLUMN ateco TEXT;
    ALTER TABLE public.tenants ADD COLUMN address TEXT;
    ALTER TABLE public.tenants ADD COLUMN street_number TEXT;
    ALTER TABLE public.tenants ADD COLUMN postal_code TEXT;
    ALTER TABLE public.tenants ADD COLUMN city TEXT;
    ALTER TABLE public.tenants ADD COLUMN province TEXT;
    ALTER TABLE public.tenants ADD COLUMN country TEXT DEFAULT 'IT';
    ALTER TABLE public.tenants ADD COLUMN pec TEXT;
    ```

    **Nota:** schema coerente con `activities` (vedi `CLAUDE.md` — pattern indirizzo: `address`, `street_number`, `postal_code`, `city`, `province`). Stessi nomi colonna su tutta la codebase. Il campo `country` con default `'IT'` è utile per quando vorrete espandervi fuori Italia.

14. **`src/types/tenant.ts`**
    - Aggiungere campi al tipo `V2Tenant`

### Ambiente Supabase (variabili obbligatorie)

Creare / verificare in `.env.local` (dev) e Supabase dashboard (prod):

```bash
# Email configurazione
COMPANY_SENDER_EMAIL="CataloGlobe <noreply@cataloglobe.com>"
COMPANY_PRIVACY_EMAIL="privacy@cataloglobe.com"
COMPANY_SUPPORT_EMAIL="support@cataloglobe.com"

# URL
APP_URL="https://cataloglobe.com"  # NO fallback hardcoded

# Dati legali (opzionali, per future analytics/reporting)
COMPANY_LEGAL_NAME="Alessandro Delia"
COMPANY_VAT_NUMBER="IT[11DIGITS]"
```

---

## Strategia di rollout proposto (fasi)

### Fase 1: Preparazione dati (2 giorni)
1. ✅ Raccogliere dati reali:
   - Nome legale completo (es. "Alessandro Delia" o "A.D. SRL")
   - P.IVA + CF
   - Indirizzo legale
   - Email privacy, support, legal
   - PEC (se applicabile)
   - Social media ufficiali

2. ✅ Creare Privacy Policy definitiva (basata su template, sostituire placeholder)

3. ✅ Creare Termini e Condizioni (+ consulenza legale consigliata)

### Fase 2: Codifica (3 giorni)

1. Creare `src/config/company.ts` con valori reali
2. Creare `supabase/functions/_shared/company-config.ts` (duplicazione consapevole)
3. Creare migration aggiungi colonne `tenants`
4. Aggiornare `src/types/tenant.ts`

5. Refactor frontend (7 file):
   - Landing page
   - PublicFooter
   - PrivacyPolicyPage + new TerminiPage
   - index.html metadata + schema.org
   - Creare robots.txt + sitemap.xml

6. Refactor backend (5 file edge functions):
   - send-otp, join-waitlist, send-tenant-invite, submit-review, generate-menu-pdf
   - Importare company-config, aggiungere footer email

7. Testare:
   - Inviare OTP → verificare footer email
   - Caricare PDF → verificare footer PDF
   - Visitare /legal/privacy e /legal/termini → verificare sostituzione placeholder
   - Visitare Landing → verificare link corretti
   - `curl index.html | grep schema.org` → verificare JSON-LD

### Fase 3: Verifica finale (1 giorno)

1. ✅ Grep pulito:
   ```bash
   grep -r '\[.*\]' src/ --include='*.tsx' --include='*.ts'
   # Deve restituire ZERO righe per placeholder rimanenti
   ```

2. ✅ Conteggio hardcoded:
   ```bash
   grep -r 'cataloglobe\.com\|noreply@' src/ supabase/functions/ --include='*.ts' --include='*.tsx'
   # Deve restituire SOLO occorrenze dentro COMPANY constant o env var
   ```

3. ✅ Test funzionale:
   - OTP send → footer presente
   - Invite send → footer presente + indirizzo legale
   - PDF gen → colofone presente
   - Landing → no email personali, email support corretta
   - Privacy → tutti placeholder sostituiti, PEC presente se configurata

### Fase 4: Deploy (1 giorno)

1. Commit + PR con "refactor: centralize legal company data"
2. Deploy migrations Supabase
3. Deploy frontend (Vite build)
4. Deploy edge functions (vercel deploy supabase/functions)
5. Verifica post-deploy

---

## Impatto commerciale

| Area | Rischio pre-launch | Azione |
|------|------------------|--------|
| **Privacy Policy incompleta** | CRITICO | Sostituire 4 placeholder prima di lancio pubblico |
| **Email personale `alessandro.delia@` esposta** | **MEDIO** | Motivazione branding/scalabilità, non legale. Per ditta individuale il titolare è persona fisica, quindi non è problema GDPR. Comunica però "azienda di una persona" invece di "azienda strutturata". Sostituire con `support@cataloglobe.com` o `info@cataloglobe.com`, non bloccante per il lancio. |
| **Termini incompleti** | CRITICO | File `TermsPage.tsx` esiste. Sostituire 3 placeholder (`[NOME TITOLARE]`, `[FORO COMPETENTE]`, `[EMAIL PRIVACY]`) + aggiungere sezione "Titolare contratto" con ragione sociale/P.IVA + diritto di recesso B2C 14gg + link ODR EU. |
| **No schema.org** | MEDIO | Aggiungere JSON-LD per SEO/compliance |
| **PDF senza colofone legale** | MEDIO | Aggiungere ragione sociale footer |
| **Email senza footer legale** | MEDIO | Aggiungere footer con indirizzo + P.IVA |
| **Stripe senza dati fiscali** | **CRITICO** | Configurare in Stripe Dashboard (Business settings) prima del primo addebito reale. Lo scope è dashboard-config, non codice. |
| **DB senza colonne legali** | BASSO | Non blocca MVP, utile per multi-tenant + fatturazione |

---

## Checklist pre-lancio (GO/NO-GO)

- [ ] Placeholder Privacy sostituiti (4/4)
- [ ] Placeholder Termini sostituiti (3/3) + sezione "Titolare contratto" + recesso B2C + ODR
- [ ] Email pubbliche corrette (no `alessandro.delia@`)
- [ ] index.html con meta tags + schema.org
- [ ] robots.txt + sitemap.xml creati
- [ ] Privacy footer email aggiornato (3 edge functions)
- [ ] PDF footer aggiornato
- [ ] Cookie banner GDPR / cookie policy implementati (oppure self-hosting Google Fonts per evitarli)
- [ ] Stripe Dashboard: Business details + Tax (P.IVA) configurati
- [ ] Grep clean: zero `[...]` nel sorgente
- [ ] QA test: OTP, Invite, PDF, Landing, Privacy, Termini
- [ ] Legal review: Privacy + Termini (consulenza)
- [ ] PEC censita in `src/config/company.ts` (decisione pubblicazione separata)

---

**Data audit:** 2026-05-17
**Auditor:** Sistema automatico (verificare manualmente i path)
**Deliverable:** Questo file (audit-legal-data.md)
**Status PRE-LANCIO:** 🚫 **BLOCCO** (7 placeholder espliciti + assenze critiche, incl. cookie banner GDPR)

---

## Changelog correzioni

### 2026-05-18 — Revisione audit

1. **Sezione "Termini e Condizioni"** riscritta: file esiste come `src/pages/Legal/TermsPage.tsx` (non `TerminiPage.tsx`). Audit completo con 3 placeholder rilevati (`[NOME TITOLARE]` riga 143, `[FORO COMPETENTE]` riga 285, `[EMAIL PRIVACY]` riga 318) + mancanze rispetto a Terms&Conditions SaaS italiano standard (sezione titolare contratto, recesso B2C 14gg, link ODR EU).
2. **PEC** riclassificata come **obbligatoria** per ditte individuali iscritte al Registro Imprese (DL 185/2008 art. 16 c. 6). Alessandro ha già una PEC attiva da censire in `COMPANY.contact.pec`.
3. **Stripe senza dati fiscali** riclassificato da MEDIO a **CRITICO**. Aggiunto scope: configurazione in Stripe Dashboard, non codice. Edge functions non interessate.
4. **Email personale `alessandro.delia@`** riclassificata da ALTO a **MEDIO** con motivazione branding/scalabilità (non legale: per ditta individuale il titolare è persona fisica).
5. **Migration `tenants` legal fields** allineata al pattern indirizzo di `activities` (`address`, `street_number`, `postal_code`, `city`, `province`, `country DEFAULT 'IT'`). Aggiunti campi `ateco` e `country`.
6. **Sezione "3-bis. Pagina pubblica — stato attuale vs futuro"** aggiunta: footer pubblico oggi solo branding "Powered by"; quando attiverete add-on ordini al tavolo, footer dovrà esporre ragione sociale/P.IVA/indirizzo/email del ristorante cliente (e-commerce). Audit dedicato da riaprire prima del rilascio feature ordini.
7. **Nota sincronizzazione `_shared/company-config.ts` ↔ `src/config/company.ts`** documentata come duplicazione consapevole (backend Deno non può importare da `src/`), pattern identico a `scheduleResolver.ts` / `schedulingNow.ts`. Header `// ⚠️ SYNC: ...` obbligatorio + nota in `CLAUDE.md`.
8. **Sezione "10. Cookie banner / Consent Management"** aggiunta. Ricerca filesystem ha rivelato: `ConsentBanner.tsx` esiste ma è per **re-accept ToS**, NON è un cookie banner GDPR. Nessuna cookie policy dedicata, nessuna libreria consent. Google Fonts caricati da CDN senza consenso preventivo. Criticità ALTA. Raccomandazione: self-host font OR implementare cookie banner GDPR + rinominare `ConsentBanner` → `TermsAcceptanceBanner`.

Aggiornati di conseguenza: Status banner header, Summary table (placeholder 4→7, aree critiche 5→6), riga "Termini" in tabella "Impatto commerciale", entry 7 in "File da modificare", checklist pre-lancio (aggiunta riga Termini, cookie banner, Stripe Dashboard).

