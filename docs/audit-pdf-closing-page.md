# Audit — Pagina di chiusura PDF menu · Dati disponibili per la sede

> Solo lettura. Nessuna modifica al codice, nessuna migration.
> Report su cosa esiste davvero per una sede e in che forma, in vista della nuova pagina di chiusura (saluto brand + blocco informazioni + legenda allergeni/caratteristiche spostata qui dalla coda prodotti).

---

## 1. Mappa dei campi

| Campo | Esiste? | Sorgente (tabella.colonna) | Forma / tipo | Già nel data-layer PDF? | Esempio reale (San Pietro) |
|---|---|---|---|---|---|
| **Indirizzo** | Sì | `activities`: `address`, `street_number`, `postal_code`, `city`, `province` | 5 × text | Parziale: `meta.address` compone via + civico + CAP + città. La `province` **non** viene usata | "Corso Buenos Aires 6, 20121 Milano" (manca "MI") |
| **Telefono** | Sì | `activities.phone` + flag `phone_public` | text + bool | No (ma `V2Activity` è già caricato in memoria) | "02 7862 2210", public = true |
| **Email** | Sì | `activities.email_public` + flag `email_public_visible` | text + bool | No | null |
| **Sito web** | Sì | `activities.website` + flag `website_public`; anche `tenants.website` | text + bool | No | null (sede) |
| **Orari apertura** | Sì | tabella separata `activity_hours` + flag `activities.hours_public` | righe per `day_of_week` (0–6), `slot_index` (fasce multiple/giorno), `opens_at`/`closes_at` (time), `is_closed`, `closes_next_day` | No — **richiede query nuova** | Lun–Dom 07:30–22:30 / 23:00 |
| **Fees (coperto/servizio)** | Sì | `activities.fees` + flag `fees_public` | JSONB array `{key, value}`, value = **string** | No (ma `V2Activity` è già caricato) | San Pietro `[]`; altre sedi: coperto 2.5, servizio 10%, spesa_minima 5, prenotazione_minima, eta_minima |
| **Social** | Sì | `activities`: `instagram`, `facebook`, `whatsapp` + flag `*_public` | text (handle/URL) | No | instagram "sanpietromilano", public = true |
| **Google review** | Sì | `activities.google_review_url` | text URL | No | presente |
| **Servizi** | Sì | `activities.services` + flag `services_public` | text[] | No | Tavoli all'aperto, Prenotazioni |
| **Pagamenti** | Sì | `activities.payment_methods` + flag `payment_methods_public` | text[] | No | Carta, Contanti, Apple/Google Pay |
| **Descrizione sede** | Sì | `activities.description` | text | No | null (spesso vuota) |
| **Dati legali** | Sì | `tenants`: `legal_name`, `vat_number`, `legal_entity_type` | text | Tenant già fetchato nel loader | livello **azienda**, non sede |

---

## 2. Stato del data-layer PDF

**File:** `src/services/pdf/loadMenuPdfData.ts`

- `getActivityById()` ritorna un `V2Activity` che **già contiene** phone, email, website, instagram, facebook, whatsapp, fees, services, payment_methods e province. Sono quindi già in memoria: mancano solo dalla mappatura verso `MenuPdfMeta` (`menuPdfTypes.ts:85`).
- L'indirizzo è composto inline da `composeAddress()` (righe 26–30). **Non** esiste un formatter riutilizzabile `formatAddress`, e la provincia viene scartata.
- Il **tenant è già fetchato** dal loader → aggiungere i dati legali costa quasi zero.

---

## 3. Formatter esistenti

| Ambito | Cosa c'è | Riutilizzabile? |
|---|---|---|
| **Orari** | `formatDaySlots()` in `ActivityHoursSection.tsx:18` | Solo in parte: ritorna **ReactNode** (UI), non stringa. Serve estrarre una variante pura per react-pdf/Deno |
| **Fees** | `FEE_DEFINITIONS` in `src/constants/activityFees.ts` (label + unità: coperto → "€/persona", servizio → "%", …) | Sì: costante pura, importabile |
| **Social** | Rendering in `PublicFooter.tsx` | Come pattern icone/handle |
| **Telefono / indirizzo** | Nessuno | — |

---

## 4. Legenda allergeni / caratteristiche (da spostare)

- Attualmente resa in `MenuPdfDocument.tsx:608–684` (componente `LegendSection`).
- Alimentata da `MenuPdfData.allergenLegend` (`MenuPdfAllergen[]` = code / label / euNumber) più le caratteristiche, calcolate in `mapCatalogToMenuPdfData.ts` (`buildAllergenLegend`, `collectUsedCharacteristics`). Fonte dei 14 allergeni UE: `allergenEuNumbers.ts`.
- **Lo spostamento nella pagina di chiusura è solo un riposizionamento del render**: i dati esistono già nell'oggetto risolto. Costo basso.

---

## 5. Tenant vs sede

- **Per-sede** (`activities`): contatti, social, fees, orari, servizi, pagamenti, descrizione.
- **Per-azienda** (`tenants`): dati legali (ragione sociale, P.IVA), website aziendale.

---

## 6. Raccomandazione — cosa mettere in v1

**Da includere subito** (dato presente, formattazione semplice, campi già in memoria → costo basso):

- **Indirizzo completo**, aggiungendo la provincia (fix di `composeAddress`).
- **Contatti**: telefono, email, sito, WhatsApp — solo dove il flag `*_public` è true.
- **Social**: Instagram / Facebook + link Google review — solo dove pubblici.
- **Fees**: coperto / servizio / spesa minima… via `FEE_DEFINITIONS` — dove `fees_public` è true.
- **Legenda allergeni/caratteristiche** spostata qui (riuso totale dei dati).
- **Dati legali azienda** (ragione sociale / P.IVA) — se valorizzati.

**Da rimandare o valutare** (unico blocco con lavoro reale, costo medio):

- **Orari di apertura** — richiede una query nuova su `activity_hours` (da aggiungere al `Promise.all` del loader), l'estrazione di un formatter puro string da `formatDaySlots`, e la gestione di fasce multiple, `closes_next_day` e `is_closed`.

> **Nota trasversale:** ogni campo pubblico ha un flag `*_public`. La pagina di chiusura deve rispettarli — mostrare un blocco solo se il relativo flag è true, coerente con la pagina pubblica.

---

## 7. Costo di estensione del data-layer

| Blocco | Costo | Perché |
|---|---|---|
| Contatti / social / fees / province / legali | **Basso** | Campi già in RAM: basta aggiungerli a `MenuPdfMeta` + mapping in `loadMenuPdfData`, nessuna query nuova |
| Legenda (spostamento) | **Basso** | Solo riposizionamento del render, dati già calcolati |
| Orari | **Medio** | +1 fetch (`activity_hours`) + formatter puro nuovo |

---

_Solo audit — nessuna modifica effettuata, nessun commit._
