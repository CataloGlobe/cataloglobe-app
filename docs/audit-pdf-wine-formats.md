# Audit — Prezzi formati vini nel PDF menu

> Solo lettura. Nessuna modifica, nessun commit.
> Due difetti estetici sui prodotti multi-formato (es. vini Calice/Bottiglia) nel PDF:
> (1) ordine dei formati incoerente tra prodotti; (2) ridondanza "da € X" + elenco formati.
> Attenzione: la logica prezzi è condivisa FE↔Edge (`priceSummary`, `// ⚠️ SYNC`) e alimenta anche la pagina pubblica.

---

## A. Ordine dei formati — da dove viene, perché incoerente

**Nessuna colonna d'ordine esiste.** `product_option_values` ha solo `id, name, price_modifier, created_at, absolute_price, name_hash` — **nessun `sort_order`** (verificato su staging). `product_variants` non esiste: i formati sono `product_option_values` di un gruppo `PRIMARY_PRICE`.

Catena, **nessun `ORDER BY`** in nessun punto:

| Livello | File:riga | Nota |
|---|---|---|
| Query | `resolveActivityCatalogs.ts:834-838` (+ gemello Edge `supabase/functions/_shared/`) | subselect `product_option_values(id,name,absolute_price,price_modifier)` **senza `.order(...)`** |
| Resolver | `resolveActivityCatalogs.ts:592-597` | mappa i valori così come arrivano, nessun riordino |
| Mapper PDF | `src/services/pdf/mapCatalogToMenuPdfData.ts:62-74` (`mapFormats`) | `filter` sui prezzati, **ordine preservato** |
| Documento | `src/services/pdf/MenuPdfDocument.tsx` (`product.formats.map`) | render nell'ordine ricevuto |

**Perché incoerente**: senza `ORDER BY`, PostgREST restituisce di fatto **ordine per `id` (uuid random)** → varia per prodotto.

**Prova reale (San Pietro)** — stessi due formati, ordine per `id` flippato:

| Vino | ordine per `id` (de-facto) | ordine per `created_at` |
|---|---|---|
| **Amarone della Valpolicella** | Calice (`a3bc…`) → Bottiglia (`df7c…`) | Bottiglia → Calice |
| **Barolo** | Bottiglia (`833a…`) → Calice (`c910…`) | Bottiglia → Calice |

→ per `id` i due vini si presentano invertiti (il sintomo). Per `created_at` sarebbero coerenti (Bottiglia inserita prima ovunque), ma `created_at` **non è selezionato** dal resolver.

---

## B. "da € X" vs elenco formati — condizioni, e resa doppia

- `resolvePriceSummary` (`src/utils/priceSummary.ts:28-42`, coppia `⚠️ SYNC` identica in `supabase/functions/_shared/priceSummary.ts`): da N prezzi → `kind` `none`(0) / `single`(1) / `multi`(≥2) + min/max/count.
- `formatPriceSummary` (`src/utils/formatPriceSummary.ts:29-46`): `none`→`null`, `single`→`"€ X"`, `multi`→**`"da € X"`** (il min).
- `mapFormats` (`mapCatalogToMenuPdfData.ts:61-74`): ritorna elenco **solo se** gruppo `PRIMARY_PRICE`+`ABSOLUTE` con **≥2 valori prezzati**.

**Resa doppia = SÌ, non mutuamente esclusivi.** In `mapProduct` (`mapCatalogToMenuPdfData.ts:156-173`) `priceLabel` e `formats` sono calcolati **indipendentemente**:

```ts
priceLabel: formatPriceSummary(summaryFromResolved(product)),  // "da € X"
formats:    mapFormats(product.optionGroups),                  // elenco
```

Per un vino multi-formato: `summaryFromResolved`→`from_price`→`kind:multi`→`"da € X"` **E** `mapFormats`→elenco ≥2. Il JSX (`MenuPdfDocument.tsx:508-548`) rende **entrambi**: prezzo header `"da € X"` + lista formati sotto → ridondanza. Nessun ramo li esclude a vicenda.

---

## C. Pagina pubblica — stesso resolver, stesso ordine

La pagina pubblica consuma lo **stesso** `resolveActivityCatalogs` (via Edge). `src/components/PublicCollectionView/ItemDetail/ItemDetail.tsx:320-384` rende `primaryPriceGroup.values.map(...)` **nell'ordine del resolver** (nessun riordino), sia pill interattivi sia lista read-only. Prezzo "da € X" via i18n `product.price_from`.

→ **L'incoerenza d'ordine è a monte (resolver/query condivisi), NON solo PDF**: il pubblico ha lo stesso difetto d'ordine.
→ La **ridondanza "da X" + elenco** invece è **solo del PDF** (il pubblico mostra i formati come sezione dedicata, non doppiati col prezzo header).

---

## D. Perimetro del fix + raccomandazione

Due problemi distinti, perimetri diversi.

### 1. Ridondanza "da X" + elenco → fix SOLO PDF (basso rischio)
In `mapProduct`/documento: quando `formats[]` è non vuoto, **sopprimere** `priceLabel` (mostrare solo l'elenco). Tocca solo mapper/documento PDF, **zero impatto** su `priceSummary` `⚠️ SYNC` e sul pubblico.

### 2. Ordine formati incoerente → due opzioni

| Perimetro | Cosa | Rischio | Copre pubblico? |
|---|---|---|---|
| **Solo PDF** (`mapFormats`) | `sort` deterministico per **`absolute_price` asc** (Calice < Bottiglia → sempre Calice prima) | **Basso** — solo mapper PDF | No |
| **A monte** (resolver query `⚠️ SYNC`) | `.order("created_at")` (o nuova col `sort_order`) sul subselect option_values, in **entrambe** le copie | **Medio** — tocca shared, richiede Playwright + sync | Sì |

### Raccomandazione: fix SOLO PDF per entrambi
- **Motivo**: task cosmetico sul PDF; il fix PDF-only non tocca `priceSummary`/resolver condivisi (`⚠️ SYNC`) né la pagina pubblica → nessun rischio sul calcolo prezzi pubblico.
- **Ordine**: in `mapFormats` ordinare i valori prezzati per **`absolute_price` crescente** (dato già disponibile nel resolver, deterministico, semanticamente sensato: economico → costoso, es. Calice prima di Bottiglia). Coerente su tutti i vini.
- **Ridondanza**: sopprimere `priceLabel` quando `formats.length > 0`.

### Se in futuro si vuole sistemare anche il pubblico (fix a monte)
Aggiungere `.order("created_at")` (o colonna `sort_order` + UI backoffice di riordino) al subselect in **entrambe** le copie di `resolveActivityCatalogs.ts`, con **Playwright** obbligatorio sulla pagina pubblica (regola MCP per `PublicCollectionView/`) e sync delle due copie. Più invasivo, fuori dallo scope del difetto PDF corrente.

---

## Riepilogo

| Voce | Esito | File:riga |
|---|---|---|
| Ordine formati | Ordine DB (di fatto per `id`), nessun sort/ORDER BY | `resolveActivityCatalogs.ts:834-838` |
| Decisione "da € X" | `kind==="multi"` da `resolvePriceSummary` | `formatPriceSummary.ts:29-46` |
| Trigger `formats[]` | `PRIMARY_PRICE` + ≥2 valori prezzati | `mapCatalogToMenuPdfData.ts:61-74` |
| Resa doppia | SÌ — `priceLabel` + `formats[]` coesistono | `mapCatalogToMenuPdfData.ts:156-173` |
| Render PDF | Entrambi: header "da X" + elenco sotto | `MenuPdfDocument.tsx:508-548` |
| Pubblico | Stesso resolver → stesso ordine → stessa incoerenza | `ItemDetail.tsx:320-384` |
| Perimetro consigliato | **Solo PDF** (ordine per `absolute_price` asc + soppressione `priceLabel` se elenco) | `mapCatalogToMenuPdfData.ts` |

_Solo audit — nessuna modifica effettuata, nessun commit._
