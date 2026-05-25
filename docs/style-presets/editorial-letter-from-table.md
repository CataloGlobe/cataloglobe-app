# Preset stile "Lettera dal tavolo"

> Audit eseguito 2026-05-25. Pattern estratti da Fase 5 epic "Ordinazioni dal tavolo" (commit candidates dopo `ec88fda`). Stato: NON ancora preset formale del design system — vive come stile applicato ad-hoc a 3 touchpoint customer.

---

## Intent

Voce visiva editoriale di tipo "scontrino-stampato-a-macchina". Evoca scrittura privata, deferenza, attenzione al singolo cliente. Target: trattorie boutique, vinerie con carte d'autore, ristoranti di stagione, locali con identità tipografica forte. Differenza vs default: il default è product-ish e funzionale (pill colorati, bottoni rounded, neutrali); editorial trasmette artigianalità e silenzio progettuale — meno "app", più "biglietto lasciato sul tavolo".

Momento chiave: il singolo gesto "ordine inviato" smette di essere notifica e diventa una micro-cerimonia (italic serif "Grazie." sopra il riepilogo perforato).

---

## Font stack

- **Serif (accent display)**:
  ```
  "Cormorant Garamond", "Playfair Display", "Iowan Old Style",
  "Apple Garamond", Georgia, "Times New Roman", serif
  ```
- **Monospace (numerals / quantità)**:
  ```
  "JetBrains Mono", "SF Mono", "Menlo", ui-monospace, monospace
  ```
- **Body inherited**: `var(--pub-font-family, sans-serif)` ereditato da `PublicThemeScope`. NESSUN override sul body — gli accent serif/mono sono SOLO su elementi specifici (titoli, totali, prezzi, quantità).

**Note fallback OS**:
- macOS / iOS hanno tutto lo stack serif + SF Mono out-of-the-box.
- Windows fallback su Georgia (serif) + system mono. Tipograficamente accettabile, perde il character cesellato di Cormorant.
- Android: nessuna delle "preferred" disponibili → Times New Roman + monospace generico. Funzionale ma piatto.
- **NON sono importate** Google Fonts custom per questo preset. Coerenza con `loadPublicFonts.ts` (loader tenant-driven). Se preset venisse formalizzato, valutare opt-in load di Cormorant + JetBrains Mono.

---

## Palette

### Gradient overlay container
Wash carta-avorio tenue, top-anchored:
```scss
radial-gradient(
  120% 90% at 50% 0%,
  color-mix(in srgb, var(--pub-primary) 5%, transparent) 0%,
  transparent 55%
)
```
(In MyOrdersSheet ridotto a `120% 70%` e `4%` per attenuare; il pattern resta identico.)

### Status dot colors (semantic, NON brand-driven)
| Status | Hex | Note |
|---|---|---|
| `submitted` | `#b45309` | Ambra carbone (corteccia). Indica attesa attiva. |
| `acknowledged` | `#047857` | Verde bottiglia. Conferma. |
| `delivered` | `color-mix(in srgb, var(--pub-text) 45%, transparent)` | Muted, no semantica accesa. |
| `cancelled` | `color-mix(in srgb, var(--pub-text) 30%, transparent)` | Più muted ancora + `opacity: 0.55` sulla card. |

### Destructive accent (cancel / error)
- Foreground / cancel link: `#b91c1c`
- Variazioni: `color-mix(in srgb, #b91c1c 75%, transparent)` (cancel link rest state), `color-mix(in srgb, #b91c1c 22%, transparent)` (border confirm row), `color-mix(in srgb, #b91c1c 4-6%, transparent)` (background wash)
- Hover darken: `color-mix(in srgb, #b91c1c 88%, black)`

### Hairline borders (graduati)
Pattern dominante: hairlines variabili in opacity per gerarchia visiva.
```scss
color-mix(in srgb, var(--pub-text) 14%, transparent)  // border-bottom header
color-mix(in srgb, var(--pub-text) 18%, transparent)  // border-top/bottom card ticket
color-mix(in srgb, var(--pub-text) 22%, transparent)  // border total-row + dot perforazione
color-mix(in srgb, var(--pub-text) 25-28%, transparent)  // dot perforazione / leader-dots
```
Da 14% (separatori invisibili) a 28% (decorative). Mai border full-opacity solid.

---

## Pattern decorativi

### 1. Leader-dots fra label e prezzo
Punti tratteggiati che collegano nome prodotto e prezzo, alla maniera dei menu tipografati.
```scss
.itemRow .itemName + .itemPrice::before {
  content: "";
  flex: 1 1 auto;
  margin: 0 6px;
  border-bottom: 1px dotted color-mix(in srgb, var(--pub-text) 28%, transparent);
  transform: translateY(-3px);
  align-self: center;
  min-width: 16px;
}
```
Richiede `.itemRow` in `display: flex; align-items: baseline` (NON grid).

### 2. Perforazione orizzontale tratteggiata fra sezioni
Effetto "linea forata di scontrino". Applicato a top + bottom del blocco riepilogo e al separator di totale.
```scss
&::before, &::after {
  content: "";
  position: absolute;
  left: 0; right: 0; height: 1px;
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--pub-text) 25%, transparent) 1px,
    transparent 1px
  );
  background-size: 6px 1px;
  background-repeat: repeat-x;
}
&::before { top: 4px; }
&::after  { bottom: 4px; }
```

### 3. Square corners (border-radius 2px) per CTA primary
Niente pill, niente 12px rounded. `border-radius: 2px` = appena percepibile, mantiene "anti-aliasing-friendly" senza addolcire l'oggetto.

### 4. Frecciette `::after` su CTA primary
```scss
&::after {
  content: "→";
  margin-left: 10px;
  font-size: 1rem;
  transition: transform 0.2s ease;
}
&:hover::after { transform: translateX(3px); }
```
Indicatore direzionale che reagisce all'hover. Glifo unicode (no SVG).

### 5. Underline-on-hover per CTA secondary
Link-like, senza border-radius, senza background. Solo `border-bottom: 1px solid transparent` che diventa visibile in hover.
```scss
.btnSecondary {
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  &:hover { border-bottom-color: color-mix(in srgb, var(--pub-text) 40%, transparent); }
}
```

### 6. Border top+bottom only su card (ticket-style)
`border-top` + `border-bottom` hairline 18%, `border-left/right` ASSENTI. `border-radius: 0`. Stack verticale con gap 24px → cards leggono come strappi successivi di uno scontrino.

### 7. Dot+uppercase status invece di pill colorato
**Markup**:
```jsx
<span className={styles.statusLine}>
  <span className={`${styles.statusDot} ${styles[st.className]}`} aria-hidden="true" />
  <span className={styles.statusLabel}>{st.label}</span>
</span>
```
**Stile**:
- `.statusDot`: 7×7px circle, background = colore semantico
- `.statusLabel`: `0.66rem` weight 600 `text-transform: uppercase` `letter-spacing: 0.22em` colore muted 75%

NIENTE `background-color` sul pill. NIENTE `border-radius: 999px`. Tipografia + colored dot bastano.

### 8. Title split italic serif + uppercase tracked
Componibile su titolo di sezione:
```jsx
<h2 className={styles.title}>
  <span className={styles.titleItalic}>I miei</span>
  <span className={styles.titleTrack}>Ordini</span>
</h2>
```
- `.titleItalic`: serif italic 1.55rem weight 400 letter-spacing -0.01em
- `.titleTrack`: sans 0.74rem weight 600 uppercase letter-spacing 0.28em muted 70%

Effetto: il titolo è una piccola opera tipografica, non un'etichetta. Pattern echo di `.title::before "Grazie."` in OrderConfirmationSheet (display moment serif italic sopra kicker uppercase tracked).

---

## Typography scale specifico

| Ruolo | Size | Weight | Family | Style / Spacing |
|---|---|---|---|---|
| **Display accent** (es. "Grazie.") | `2.6rem` | 400 | $serif-stack | italic, `letter-spacing: -0.02em`, line-height 1 |
| **Title sheet kicker** (es. "ORDINE INVIATO!") | `0.7rem` | 500 | inherited sans | uppercase, `letter-spacing: 0.22em`, muted 75% |
| **Title sheet italic** (es. "I miei") | `1.55rem` | 400 | $serif-stack | italic, `letter-spacing: -0.01em` |
| **Title sheet tracked** (es. "ORDINI") | `0.74rem` | 600 | inherited sans | uppercase, `letter-spacing: 0.28em`, muted 70% |
| **Section labels uppercase** (es. "RIEPILOGO") | `0.65rem` | 600 | inherited sans | uppercase, `letter-spacing: 0.28em`, muted 55% |
| **Body items** | `0.92-0.95rem` | 400 | inherited sans | line-height 1.4 |
| **Item qty** | `0.78-0.82rem` | 500 | $mono-stack | muted 60% |
| **Item price** | `0.84-0.88rem` | 500 | $mono-stack | `font-feature-settings: "tnum" 1, "lnum" 1` |
| **Total label** | `0.98-1.05rem` | 500 | $serif-stack | italic |
| **Total value (OC)** | `1.4rem` | 600 | $mono-stack | tnum lnum, `letter-spacing: -0.01em` |
| **Total value (per-card MyOrders)** | `1.05rem` | 600 | $mono-stack | tnum lnum, `letter-spacing: -0.01em` |
| **CTA primary label** | `0.78rem` | 600 | inherited sans | uppercase, `letter-spacing: 0.22em` |
| **CTA secondary label** | `0.78rem` | 500 | inherited sans | uppercase, `letter-spacing: 0.18em` |
| **Status dot label** | `0.66rem` | 600 | inherited sans | uppercase, `letter-spacing: 0.22em`, muted 75% |
| **Timestamp small** (orderTime) | `0.7rem` | 400 | $serif-stack | italic, muted 55% |
| **Empty state title** | `1.2rem` | 400 | $serif-stack | italic, prefisso `"—  "` |

**Numerali**: ovunque siano in serie comparabile (prezzi, totali) → `font-feature-settings: "tnum" 1, "lnum" 1` per garantire allineamento decimali colonna-grid.

---

## Componenti dove è applicato attualmente

1. **OrderConfirmationSheet** (`src/components/PublicCollectionView/OrderConfirmationSheet/`)
   Sheet post-submit success. Display moment "Grazie." + summary perforato + CTA "I miei ordini" / "Chiudi". File `.module.scss` 337 righe. Riferimento canonico.

2. **MyOrdersSheet** (`src/components/PublicCollectionView/MyOrdersSheet/`)
   Sheet lista ordini sessione + cancel flow. File `.module.scss` riscritto editorial. File `.tsx` toccato: title split + status pill → dot+label markup.

3. **`.myOrdersFab`** in CollectionView (`src/components/PublicCollectionView/CollectionView/CollectionView.module.scss`)
   FAB flottante che apre MyOrdersSheet. Stile coerente: square corners, hairline border, uppercase tracked label, paper-style shadow doppio (1px hairline + soft 18px).

**Componenti rimasti NON-editorial** (token-driven default):
- `SelectionSheet` — pill arancione attuali, padding generoso, ratio classico cart-bottom-sheet. Coerente con pattern admin (`.systemDrawer` family). Editorial-ification opzionale ma rischiosa: il cart è un percorso funzionale fast, decoration può rallentare lettura.
- `ItemDetail` — sheet dettaglio prodotto. Non toccato.
- `PublicSheet` — meta-sheet wrapper, design-neutro by intent.

---

## Tokens nuovi necessari per preset-ification

Per rendere il preset opt-in dal design system, servono i token sotto (proposti, NON ancora esistenti):

### Selettore preset
| Token | Tipo | Valori | Scope |
|---|---|---|---|
| `--pub-style-preset` | enum | `"default"` \| `"editorial-letter"` | applicato da `PublicThemeScope` su `<body>` o root `.frame` |

In alternativa, opt-in via classe `data-style-preset="editorial-letter"` sull'elemento root del PublicThemeScope, con selettori CSS conditional `[data-style-preset="editorial-letter"] .foo { ... }`. Più hackeabile, meno preciso. Preferibile l'approccio token-driven con CSS vars condizionali alla classe root.

### Font tokens
| Token | Tipo | Default | Editorial-letter |
|---|---|---|---|
| `--pub-font-serif-stack` | font-family list | `inherit` | `"Cormorant Garamond", ...` |
| `--pub-font-mono-stack` | font-family list | `inherit` | `"JetBrains Mono", ...` |

### Decoration toggles
| Token | Tipo | Default | Editorial-letter |
|---|---|---|---|
| `--pub-decoration-leader` | enum | `none` | `dotted` |
| `--pub-decoration-perforation` | enum | `off` | `radial-dots` |
| `--pub-cta-shape` | enum | `pill` | `square` (border-radius 2px) |
| `--pub-status-treatment` | enum | `pill` | `dot-label` |
| `--pub-card-borders` | enum | `all` | `vertical-only` (top+bottom) |
| `--pub-title-treatment` | enum | `solid` | `serif-italic-plus-tracked` |

### Status semantic colors (cross-preset, sempre disponibili)
Questi tokens andrebbero **sempre** introdotti, indipendentemente dal preset, perché lo "stato ordine" è informazione funzionale customer-side che il default attualmente NON espone come token.

| Token | Default |
|---|---|
| `--pub-status-warning` | `#b45309` |
| `--pub-status-success` | `#047857` |
| `--pub-status-muted` | `color-mix(in srgb, var(--pub-text) 45%, transparent)` |
| `--pub-status-cancelled` | `color-mix(in srgb, var(--pub-text) 30%, transparent)` |
| `--pub-destructive` | `#b91c1c` |

### Hairline scale tokens (cross-preset)
Per evitare di hard-codare le percentuali 14/18/22/25/28 in ogni file:
| Token | Default |
|---|---|
| `--pub-hairline-soft` | `color-mix(in srgb, var(--pub-text) 14%, transparent)` |
| `--pub-hairline-medium` | `color-mix(in srgb, var(--pub-text) 18%, transparent)` |
| `--pub-hairline-strong` | `color-mix(in srgb, var(--pub-text) 22%, transparent)` |
| `--pub-decoration-dot-color` | `color-mix(in srgb, var(--pub-text) 25%, transparent)` |

---

## Mapping current hard-coded → tokens proposti

| Cosa è hardcoded oggi | File | Token proposto |
|---|---|---|
| `$serif-stack: "Cormorant Garamond", ...` SCSS var | OC, MyOrders | `--pub-font-serif-stack` |
| `$mono-stack: "JetBrains Mono", ...` SCSS var | OC, MyOrders | `--pub-font-mono-stack` |
| `border-radius: 2px` su `.btnPrimary` / `.confirmYes` | OC, MyOrders | `--pub-cta-shape: square` → translates to `border-radius: 2px` |
| `border-radius: 0` su `.iconWrap` + card ticket | OC, MyOrders | Implicit via `--pub-card-borders: vertical-only` |
| `border-top + border-bottom` (no laterali) `.orderCard` | MyOrders | Implicit via `--pub-card-borders: vertical-only` |
| Status colors `#b45309`, `#047857`, etc | MyOrders | `--pub-status-warning`, `--pub-status-success`, etc |
| Destructive `#b91c1c` | MyOrders | `--pub-destructive` |
| Hairlines `color-mix(--pub-text X%, transparent)` ripetuti | tutti | `--pub-hairline-soft/medium/strong` |
| Perforazione `radial-gradient(...) 6px 1px` ripetuta | OC, MyOrders | mixin SCSS oppure conditional via `--pub-decoration-perforation` |
| Leader-dots `.itemPrice::before` borders dotted | OC, MyOrders | conditional via `--pub-decoration-leader` |
| Frecciette `::after content: "→"` su btnPrimary | OC | mixin SCSS gated da preset |
| Title split JSX (`titleItalic` + `titleTrack`) | MyOrders | richiede **JSX cooperation** — il preset SCSS da solo non basta |

---

## Effort per preset-ification (stima qualitativa)

### Migration hardcoded → tokens
**Medio**: ~6-8 ore. Refactor SCSS dei 3 file Fase 5 per usare CSS vars al posto di colori e radius hardcoded. SCSS vars `$serif-stack` / `$mono-stack` diventano CSS vars `--pub-font-serif-stack` / `--pub-font-mono-stack`. Aggiunta di `@mixin perforation` + `@mixin leader-dots` in `_theme.scss` (o file dedicato `_editorial-mixins.scss`). Editor di test su tutti gli stati (success, error, loading, empty, status variants).

### Editor stili admin
**Alto**: ~16-20 ore. Aggiungere sezione "Preset" in `StylePropertiesPanel.tsx` (lato admin) con dropdown `default | editorial-letter`. La preview live in `StylePreview.tsx` deve mostrare gli ordini customer (oggi mostra solo catalogo prodotti) — significa estendere `MOCK_FEATURED + MOCK_SECTION_GROUPS` per includere finto OrderConfirmation/MyOrders preview. Oppure: preview-only preset switch con render mockato in pannello laterale.

### Database
**Basso**: ~2-3 ore. Aggiungere colonna `style_preset text NOT NULL DEFAULT 'default' CHECK (style_preset IN ('default', 'editorial-letter'))` su `styles` table. Migration semplice, backward compat (tutti gli stili esistenti restano `default`). Riflesso in TypeScript types via `generate_typescript_types`.

### Resolver / PublicThemeScope
**Basso-medio**: ~4 ore. `PublicThemeScope.tsx` legge `style.config.preset` o nuova colonna `style.style_preset` e applica `data-style-preset` attribute al root. SCSS conditional selectors `[data-style-preset="editorial-letter"]` injection delle CSS vars override. `parseTokens` esteso per emettere il preset.

### Backward compatibility
**Garantita per default**. Gli stili esistenti sono tutti `default` post-migration. Nessun cambio visivo. Tenant esistenti devono opt-in esplicitamente dal pannello admin. Editorial-letter è additive.

**Rischio**: tenant con `--pub-font-family` di tipo grottesco/condensato (es. "Bebas Neue") combinato con editorial preset → mismatch visivo (italic serif accent + sans condensato = stridente). Mitigazione: warning in pannello admin "Questo preset funziona meglio con font sans humanist o grotesque classico" + preview live.

### Totale stima
**~30-35 ore di lavoro** per integrazione full preset-system con UI admin, DB, resolver, backward compat. Più test (manuale + visual regression playwright su scenari ordering).

**Alternativa low-cost (~6-8 ore)**: NIENTE preset selector formale. Lasciare editorial come stile-fisso di customer-ordering flow (i 3 touchpoint), default per tutti i tenant. Pro: zero infra. Contro: tenant brutalist non possono "spegnerlo" e si trovano con un look che non coincide col loro brand pubblico (vedi Rischio sopra).

---

## Decisioni di design ad-hoc (durante l'estrazione)

1. **`titleItalic + titleTrack` come pattern componibile**. La title-split JSX richiede cooperazione del template → NON è puro CSS preset. Documentato come opzione opt-in via component variant (es. prop `<h2 split={true}>`). Alternativa CSS-only via `::before content: "I miei"` + `::after content: "Ordini"` è hackier e perde semantica.
2. **Status colors hard-coded come hex universali, NON brand-driven**. Decisione: lo stato di un ordine è informazione funzionale stabile (paragonabile a semaforo). Non personalizzabile per tenant. Mappare a `--pub-status-*` proposti rende il preset più riusabile cross-domain.
3. **Perforazione + leader-dots come pattern decorativi opt-in, NON sempre attivi**. Tenant minimalisti potrebbero volere editorial-letter MA senza perforazione (= solo serif accent + square corners). Separare `--pub-decoration-perforation` e `--pub-decoration-leader` come toggles indipendenti dà granularità.
4. **NON includo nel preset modifiche al SelectionSheet**. Funzionalmente il cart è hot-path: ogni millisecondo di lettura conta. Editorial decoration (perforazione, italic) può rallentare visivamente. Decisione: editorial limitato a "momenti di pausa" (confirmation post-submit, lista archivio ordini), NON al hot-path operativo.

---

## Anomalie / cose sorprendenti durante l'estrazione

1. **Border-radius 2px su CTA primary funziona meglio di `border-radius: 0` puro**. `0px` legge come "raw HTML default", `2px` legge come "scelta intenzionale". Soglia di intenzionalità tipografica. Da documentare come regola: square corners ≠ zero-radius.
2. **`color-mix()` opacity-graduate per hairlines è il pattern di tutta la palette**. Niente solid borders, niente `rgba(0,0,0,0.X)` hardcoded. SOLO `color-mix(in srgb, var(--pub-text) N%, transparent)` su scala 14→28%. Implicazione: il preset funziona AUTOMATICAMENTE in dark theme tenant (il `--pub-text` chiaro genera hairlines chiare appropriate). Robusto.
3. **`.itemPrice::before` con `flex: 1 1 auto` è l'unico modo CSS-only per leader-dots con flex parent**. Pattern non ovvio: tipicamente i menu cartacei usano tab-leader fill (`text-decoration: leader(dotted)` CSS4, NON ancora implementato in nessun browser nel 2026). La soluzione flex+pseudo-element è hack ma robusta su tutti i browser, e respira con larghezza variabile del prezzo. Cost: serve `display: flex; align-items: baseline` sul parent (NO grid). Vincolo invasivo da documentare nel mixin.
