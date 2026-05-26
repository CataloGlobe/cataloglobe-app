# OrderingSheet — design vision "Tavolo aperto"

> Documento di design per il merge SelectionSheet + MyOrdersSheet in singolo OrderingSheet con tab switcher. Consumabile da prompt impl successivo. **Token-driven** (`--pub-*` only). Niente serif/mono override, niente nuove librerie.

---

## 1. Intent e metafora

**Tavolo aperto**: il cliente ha sul tavolo un piccolo quaderno del cameriere. Due pagine affiancate.
- **Pagina sinistra "Selezione"** — quello che sto scegliendo ADESSO. Mutabile, malleabile, in costruzione.
- **Pagina destra "Ordini"** — quello che ho GIÀ chiesto. Stato di realtà. Tracciabile, modificabile solo annullando.

L'utente flippa fra le due pagine. Il design deve far percepire questa polarità presente/passato senza tipografia decorativa — solo via:
- direzione del movimento (left→right page flip semantico)
- densità informativa (cart sparso, orders compatto-archivio)
- gerarchia interazioni (cart = molti tap, orders = pochi tap critici)

**Differenziatore memorabile**: il tab switcher NON è un pill swap. È una linea sottile che scivola sotto il label attivo (newspaper-tab feel), e il contenuto scivola horizontal come una pagina che si gira. Una persona deve ricordarsi "ah, quel menu dove ordini fa quella cosa che cambia pagina".

---

## 2. Constraint tecnici

- React 19 + Framer Motion v12 (già nel progetto, usato da PublicSheet)
- Token CSS `--pub-primary`, `--pub-on-primary`, `--pub-surface`, `--pub-text`, `--pub-text-muted` o fallback `color-mix(...var(--pub-surface))`, `--pub-surface-border`, `--pub-radius`, `--pub-btn-radius`
- `font-family: var(--pub-font-family, sans-serif)` ovunque. NESSUN serif/mono override.
- Status colors hardcoded universali (NON brand): `#b45309` / `#047857` / `#4b5563` / `#6b7280`
- Mobile-first, body-lock iOS-safe ereditato da PublicSheet
- Tab switch + page flip devono essere swipable su mobile (Framer Motion drag) come polish opzionale fase 2 — fase 1 solo tap

---

## 3. Layout

### Hierarchical structure

```
PublicSheet
└ headerContent (sticky top, flex-shrink:0)
   ├ .titleRow
   │  ├ .title (dinamico per tab attivo)
   │  └ .refreshBtn (visibile SOLO tab="orders")
   └ .tabSwitcher
      ├ .tabButton "Selezione" + counter
      ├ .tabButton "Ordini" + counter
      └ .tabIndicator (motion underline, lerps fra i due button)
└ children
   ├ .pageStack (overflow hidden, relative)
   │  └ motion.div .pageSlider (translateX based su activeTab)
   │     ├ .page .pageCart   (width 100%, items + empty state)
   │     └ .page .pageOrders (width 100%, orders list + empty/loading/error)
   └ .footer (sticky bottom, visible solo tab="cart" && !isEmpty)
      ├ .totalRow
      └ .submitCta
```

### Spacing
- Headers / footers `padding 16px 20px 12px`
- ScrollArea `padding 14px 20px` + `padding-bottom max(20px, env(safe-area-inset-bottom))`
- Gap fra cards orders: `12px`
- Gap fra items cart: `0` (separator hairline)

---

## 4. Tab switcher (singolo pattern memorabile)

NIENTE pill background swap (cookie-cutter). Pattern editoriale-newspaper:

```scss
.tabSwitcher {
  display: grid;
  grid-template-columns: 1fr 1fr;
  position: relative;
  padding: 0 4px;
  margin-top: 4px;
}

.tabButton {
  background: transparent;
  border: none;
  padding: 12px 8px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--pub-text-muted, color-mix(in srgb, var(--pub-text) 55%, var(--pub-surface)));
  cursor: pointer;
  transition: color 0.18s ease;
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  -webkit-tap-highlight-color: transparent;
}

.tabButtonActive {
  color: var(--pub-text);
  font-weight: 600;
}

.tabCounter {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--pub-text-muted);
  font-weight: 500;
}

.tabButtonActive .tabCounter {
  color: var(--pub-primary);
  font-weight: 600;
}

/* Indicator motion: full-width track + animated slide via Framer */
.tabIndicatorTrack {
  position: absolute;
  bottom: -1px;
  left: 0; right: 0;
  height: 2px;
  background: color-mix(in srgb, var(--pub-text) 8%, var(--pub-surface));
}

.tabIndicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  width: 50%;
  background: var(--pub-primary);
  border-radius: 2px;
  /* x animato via Framer motion based su activeTab */
}
```

**Framer Motion**:
```tsx
<motion.div
  className={styles.tabIndicator}
  animate={{ x: activeTab === "cart" ? "0%" : "100%" }}
  transition={{ type: "spring", stiffness: 380, damping: 32 }}
/>
```

**Effetto**: linea primary 2px che scivola sotto il label attivo come penna che sottolinea. Newspaper tab. NON pill colorato.

---

## 5. Page flip transition

`.pageStack` ha `overflow: hidden`. `.pageSlider` è motion.div con `display: flex; width: 200%`. Ogni `.page` width 100%. translateX animato:

```tsx
<motion.div
  className={styles.pageSlider}
  animate={{ x: activeTab === "cart" ? "0%" : "-50%" }}
  transition={{ type: "spring", stiffness: 340, damping: 36 }}
  style={{ display: "flex", width: "200%" }}
>
  <div className={styles.page} style={{ width: "50%" }}>
    {/* cart content */}
  </div>
  <div className={styles.page} style={{ width: "50%" }}>
    {/* orders content */}
  </div>
</motion.div>
```

Spring stiffness 340 = leggero overshoot, sensazione tattile di una pagina che si assesta. damping 36 = no rimbalzo eccessivo, refined.

**Non scrollable orizzontale**: ogni `.page` ha proprio scroll verticale interno (`overflow-y: auto`), il page-flip è solo horizontal translate del container parent.

**Tab="cart" inactive page (orders)**: `pointer-events: none` durante flip per evitare tap accidentali su contenuto fuori vista. Aria-hidden auto.

---

## 6. Staggered reveal

Quando l'utente flippa a tab="orders" la PRIMA volta nella sessione (o dopo refresh), gli orderCard appaiono staggered:

```tsx
{orders.map((order, i) => (
  <motion.div
    key={order.id}
    className={styles.orderCard}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.04, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
  >
    {/* card content */}
  </motion.div>
))}
```

Stagger 40ms cumulativo, max 5-6 visibili = ~200-240ms totali, dentro la curva di percezione "tutto insieme ma con grazia". Cubic-bezier easeOut(0.16, 1, 0.3, 1) — refined ease.

Stesso pattern per items cart al primo open (delay più breve, 25ms each).

---

## 7. FAB context-aware

3 stati (gating in render condizione, inline CollectionView):

```tsx
{cartCount > 0 && (
  <motion.button
    className={styles.orderingFab}
    onClick={openOrdering}
    layout                       /* magic: morph fluido fra varianti */
    transition={{ type: "spring", stiffness: 380, damping: 30 }}
    aria-label={`Apri selezione, ${cartCount} prodotti`}
  >
    <ListChecks size={18} />
    <span>La mia selezione</span>
    <motion.span
      className={styles.fabBadge}
      key={cartCount}                     /* re-mount on count change → pop animation */
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
    >
      {cartCount}
    </motion.span>
  </motion.button>
)}

{cartCount === 0 && hasOrdersInSession && (
  <motion.button
    className={styles.orderingFab}
    onClick={openOrdering}
    layout
    aria-label="Apri i miei ordini"
  >
    <ClipboardList size={18} />
    <span>I miei ordini</span>
  </motion.button>
)}
```

`layout` prop Framer Motion = morph automatico fra le due varianti (icona + label cambiano fluidamente, NO swap istantaneo). Badge `key={cartCount}` = re-mount → pop scale animation ogni volta che count cambia (subtle delight su "+1" al cart).

```scss
.orderingFab {
  position: fixed;
  right: calc(20px + env(safe-area-inset-right, 0px));
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--pub-radius, 14px);
  border: none;
  background: var(--pub-bg-text);
  color: var(--pub-bg);
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 20px color-mix(in srgb, var(--pub-bg-text) 28%, transparent);
  -webkit-tap-highlight-color: transparent;
}

.fabBadge {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--pub-bg) 20%, transparent);
  color: var(--pub-bg);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

Replica struttura `.selectionFab` attuale + badge embedded. Single FAB, NO stack verticale di 2 FAB (semplificazione vs Fase 5 prompt 4).

---

## 8. Empty states con voce

**Cart vuoto**:
- Icona: nessuna (no emoji), solo testo
- Titolo: "Nessun piatto scelto."
- Subtitle: "Sfoglia il menu per iniziare il tuo ordine."

**Orders vuoti**:
- Icona: nessuna
- Titolo: "Non hai ancora inviato ordini."
- Subtitle: "I tuoi ordini compariranno qui dopo l'invio."

**Loading orders (primo load)**:
- Spinner Loader2 16px (più piccolo di attuale 32px, più sobrio)
- "Caricamento..."

Tipografia copy: 1.1rem titolo weight 600, 0.88rem subtitle muted. Allineato a sinistra (NON centrato come Fase 5 attuale — più leggibile su mobile).

---

## 9. Cart row micro-interaction

Sull'add (riga 759 CollectionView `addToSelection`), la row corrispondente in cart fa un sottile pulse di background:

```scss
.itemRow {
  /* base styles */
  transition: background 0.4s ease-out;
}

.itemRow[data-just-added="true"] {
  background: color-mix(in srgb, var(--pub-primary) 8%, transparent);
}
```

Logic JS: useEffect listener su selection length increase → set `data-just-added` su nuova row → setTimeout 600ms remove. Pulse "vivo" senza essere spam.

Qty buttons (-/+): mantieni shape existing ma aggiungi micro-tap feedback `transform: scale(0.92)` su `:active`. NO motion library qui — CSS only.

---

## 10. Submit CTA con progress

Bottone "Invia ordine" durante submit:

```tsx
<button className={styles.submitCta} disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <motion.span
        className={styles.submitSpinner}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
      />
      <span>Invio in corso...</span>
    </>
  ) : (
    <>Invia ordine <span className={styles.submitTotal}>{formatPrice(total)}</span></>
  )}
</button>
```

```scss
.submitSpinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--pub-on-primary) 40%, transparent);
  border-top-color: var(--pub-on-primary);
  border-radius: 50%;
}

.submitTotal {
  margin-left: auto;
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
```

Spinner ring (NON spinner emoji), totale a destra come "ricevuta che si paga". Padding interno asimmetrico per fare spazio al totale destra.

---

## 11. Order card refined

Token-driven, NIENTE perforazione (lesson learned editorial revert). Però:
- Border full 4 lati `1px solid var(--pub-surface-border)` (Fase 5 prompt 4 stato attuale)
- Border-radius `var(--pub-radius, 12px)`
- Padding `14px`
- Hover (desktop): subtle shadow `box-shadow: 0 2px 12px color-mix(--pub-text 8%, transparent)` + border-color stronger
- Cancel button: outline destructive `#dc2626` come oggi
- Confirm-cancel inline pattern preservato

Nessun ridisegno radicale order card. Cosa che cambia: il REVEAL della card su mount (stagger), e il pulse del badge status quando l'ordine passa da submitted → acknowledged se vediamo il futuro polling. (Per ora niente realtime, fase 6).

---

## 12. Header transition

Title cambia in base ad activeTab:
- cart: "La mia selezione"
- orders: "I miei ordini"

Animazione: `motion.h2` con `key={activeTab}` + `initial={{ opacity: 0, y: -4 }}` + `animate={{ opacity: 1, y: 0 }}` + `transition={{ duration: 0.18 }}`. Subtle vertical slide, fa percepire che il contesto è cambiato.

Refresh button (RefreshCw): visibile solo `activeTab === "orders"`. Fade in/out via `AnimatePresence`.

---

## 13. Cosa NON fare (lesson learned)

- NIENTE serif italic display
- NIENTE leader-dots
- NIENTE perforazione radial-gradient
- NIENTE square corners 2px hardcoded
- NIENTE uppercase tracked label > 0.18em
- NIENTE status dot+uppercase (mantieni pill rotondo coerente design system)
- NIENTE font monospace override su prezzi (sufficiente `font-variant-numeric: tabular-nums`)

Tutto via spazio + motion + micro-interazioni. Token-driven ortodosso.

---

## 14. Implementazione: file plan

**Nuovi**:
- `src/components/PublicCollectionView/OrderingSheet/OrderingSheet.tsx`
- `src/components/PublicCollectionView/OrderingSheet/OrderingSheet.module.scss`

**Modify**:
- `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` — state refactor, single FAB inline, OrderingSheet render
- `src/components/PublicCollectionView/CollectionView/CollectionView.module.scss` — `.orderingFab` (replace `.selectionFab` + `.myOrdersFab`) + `.fabBadge`
- `src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.tsx` — remove 4 props + badge JSX
- `src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.module.scss` — remove `.tableInfo` + `.tableInfoDot`

**Delete**:
- `src/components/PublicCollectionView/SelectionSheet/` intera dir
- `src/components/PublicCollectionView/MyOrdersSheet/` intera dir
- `src/components/PublicCollectionView/CustomerNameSheet/` intera dir

**Preserve (NON toccare)**:
- Service layer (customerSessions.ts include updateCustomerName + decodeCustomerSessionIdFromJwt, intatti)
- Context CustomerSession (intatto)
- customerSessionStorage (intatto, mantiene customerName + tableZone per uso futuro)
- DB schema customer_sessions.customer_name
- TableEntryPage (salva sempre customerName: null + tableZone)
- OrderConfirmationSheet (resta separato, sheet success post-submit, NO merge)

---

## 15. Performance note

- `OrderingSheet` lazy via `lazy(() => import(...))` con Suspense fallback `null`
- Framer Motion già nel bundle (usato da PublicSheet)
- Lista orders virtualization NON necessaria — customer-session-scoped, max 10-15 ordini realistici per tavolo
- ScrollArea singolo per page, NO inner scroll annidato (rispetta CLAUDE.md scroll pattern iOS-safe)

---

## 16. Sintesi memorabilità

Single moment a person remembers: **la linea sottile primary che scivola sotto il label attivo del tab, sincronizzata col page slide horizontal**. Niente background pill colorato cookie-cutter. Una decisione di motion che funziona TUTTA insieme: tab indicator + page translate + content stagger. Tre componenti, una direzione, un gesto preciso. Refined-restrained, NON maximalist.

Auto mode default: lerp soft + stagger 40ms + spring stiffness 340-380. Numeri specifici, già calibrati. Implementare con questi numeri esatti, NO bikeshedding.
