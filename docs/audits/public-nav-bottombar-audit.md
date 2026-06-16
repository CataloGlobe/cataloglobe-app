# Audit navigazione sito pubblico — verso bottom nav bar unica

**Tipo**: analisi read-only. Nessun file modificato.
**Data**: 2026-06-12
**Scopo**: valutare sostituzione della navigazione pubblica attuale (3 tab header + 2 FAB) con una barra flottante in basso icon-only, dietro feature flag, responsive-split (barra mobile / tab header desktop).

---

## (a) Mappa dei file coinvolti

| File | Ruolo |
|---|---|
| `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` | Owner dello stato `activeTab` (HubTab). Passa `activeTab` + `onTabChange` giù. |
| `src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.tsx` | **Rende i 3 tab header** (`HUB_TABS`, gate `showHubTabs`). Search + More button. |
| `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` | Rende i **2 FAB** (ordine + valuta/recensione). Storage selezione carrello. Apre `OrderingSheet`. |
| `src/components/PublicCollectionView/CollectionSectionNav/CollectionSectionNav.tsx` | ⚠️ **NON è il 3-tab switcher** — è la nav delle *categorie/sezioni* del catalogo (con dropdown figli). Da non confondere. |
| `src/components/PublicCollectionView/PublicSheet/PublicSheet.tsx` | Bottom-sheet riutilizzabile (product detail + ordine). Scrim + drag-to-dismiss. |
| `src/components/PublicCollectionView/OrderingSheet/OrderingSheet.tsx` | Contenuto sheet carrello/ordine (lazy). |
| `src/components/PublicCollectionView/hooks/useFabCollapse.ts` | Collapse FAB a icona su scroll/timeout. |
| `src/types/collectionStyle.ts` | `type HubTab = "menu" \| "events" \| "reviews"`. |

---

## (b) Risposta puntuale per punto

### 1) Stato sezione attiva (3 tab header)

I 3 pulsanti **Menu / Eventi & Promo / Dici la tua** sono renderizzati in
`PublicCollectionHeader.tsx:303-326` dal blocco `showHubTabs && (...)`, iterando l'array
modulo-level `HUB_TABS` (`PublicCollectionHeader.tsx:8-12`):

```tsx
const HUB_TABS: { id: HubTab; icon: ReactNode; labelKey: string }[] = [
    { id: "menu",    icon: <BookOpen size={14} />,           labelKey: "hub.menu" },
    { id: "events",  icon: <CalendarDays size={14} />,       labelKey: "hub.events" },
    { id: "reviews", icon: <MessageSquareHeart size={14} />, labelKey: "hub.reviews" },
];
```
```tsx
{showHubTabs && (
    ...
    {HUB_TABS.map(tab => (
        <button ... onClick={() => onTabChange?.(tab.id)}>
            {tab.icon} {t(tab.labelKey)}
        </button>
    ))}
)}
```

**Meccanismo**: NON react-router. È **stato locale** in `PublicCollectionPage.tsx:704`:
```tsx
const [activeTab, setActiveTab] = useState<HubTab>("menu");
const handleTabChange = useCallback((tab: HubTab) => { ... trackEvent(...,"tab_switch",...) }, [activeTab, state]);
```
Passato a valle a `PublicCollectionHeader` come `activeTab` + `onTabChange` (via `CollectionView`,
`PublicCollectionPage.tsx:949-950`).

**Valori sezione** (`HubTab` enum, non route):
| UI label | valore stato | labelKey i18n | icona attuale |
|---|---|---|---|
| Menu | `"menu"` | `hub.menu` | `BookOpen` (libro) |
| Eventi & Promo | `"events"` | `hub.events` | `CalendarDays` (calendario) |
| Dici la tua | `"reviews"` | `hub.reviews` | `MessageSquareHeart` (cuore) |

> 🎯 **Le icone target del progetto sono GIÀ quelle in uso** (libro/calendario/cuore). La borsa carrello è l'unica nuova.

### 2) I due FAB flottanti

Entrambi renderizzati in `CollectionView.tsx`, gate comune `mode === "public" && activeTab === "menu"`.

**FAB carrello/ordine** — `CollectionView.tsx:2185-2210`:
```tsx
{mode === "public" && activeTab === "menu" && !shouldHideOrderingEntry
   && (selectionCount > 0 || (orderingActive && hasOrdersInSession)) && (
   <button className={styles.orderingFab} onClick={() => { openOrdering(); ... }} aria-label="Il tuo ordine">
       <ClipboardList size={20} /> ...
       {selectionCount > 0 && <span className={styles.orderingFabBadge}>{selectionCount}</span>}
   </button>
)}
```
- Apertura: `openOrdering()` → monta `OrderingSheet` (lazy, `CollectionView.tsx:35`) dentro `PublicSheet`.
- ⚠️ `aria-label="Il tuo ordine"` è **hardcoded, non tradotto** (vedi punto 7).

**FAB reminder recensione ("valuta")** — `CollectionView.tsx:2212-2232`:
```tsx
{mode === "public" && activeTab === "menu" && (
    <button className={[styles.valutaFab, valutaVisible ? styles.valutaFabVisible : ""]...}
        onClick={() => { onTabChange?.("reviews"); window.scrollTo({top:0,behavior:"smooth"}); }}
        aria-label={t("fab.review_aria")}>
        <MessageSquareHeart size={20} /><span ...>{t("fab.review_label")}</span>
    </button>
)}
```
Nota: il FAB esiste sempre nel DOM (tab menu), ma è **visibile solo se `valutaVisible===true`** via classe `valutaFabVisible`.

**Condizione ESATTA di comparsa** (`CollectionView.tsx:1374-1440`, due effetti):

Eligibilità (1374-1407):
```tsx
const FOUR_HOURS = 4*60*60*1000; const TWENTYFOUR_HOURS = 24*60*60*1000;
const lastReview = localStorage.getItem(`fab_reviewed_${activityId}`);
if (lastReview && (now - parseInt(lastReview,10)) < TWENTYFOUR_HOURS) return;   // recensito <24h → mai
const previousVisit = localStorage.getItem(`fab_visit_${activityId}`);
const isReturnVisit = previousVisit && (now - prevTs) < FOUR_HOURS;
if (!isReturnVisit) { localStorage.setItem(`fab_visit_${activityId}`, now); return; }  // 1ª visita → solo registra
valutaEligibleRef.current = true;   // ritorno entro 4h + nessuna recensione 24h → idoneo
```
Trigger visivo (1409-1440), solo se idoneo:
```tsx
if (scrollPercent >= 0.7) { setValutaVisible(true); }   // dopo 70% scroll pagina
```
Nascosto dopo invio recensione (`CollectionView.tsx:2171-2180`): set `fab_reviewed_${activityId}` + `valutaVisible=false`.

→ **Per la nuova barra**: questo identico trigger diventa un *dot* sull'icona cuore. Riutilizzabile 1:1 — basta sostituire `setValutaVisible(true)` con un flag `reviewDot` letto dalla barra. Logica eligibilità invariata.

### 3) Stato carrello/ordine

**NON context/zustand/redux**. È **sessionStorage + useState locale** in `CollectionView.tsx`:
- State: `useState<SelectionItem[]>` (`:854`), key `catalogobe-selection-${activityId}` (`:852`).
- Persistenza: `CollectionView.tsx:870-875` (`sessionStorage.setItem` on change).
- **Badge count**: derivato, `CollectionView.tsx:877`:
  ```tsx
  const selectionCount = useMemo(() => selection.reduce((s, i) => s + i.qty, 0), [selection]);
  ```
- `CustomerSessionProvider` (`PublicCollectionPage.tsx:873`) gestisce `orderingActive`/`hasOrdersInSession`, ma **gli item del carrello stanno in sessionStorage locale di CollectionView**, non nel context.

> ⚠️ **Domanda aperta / blocker minore**: `selectionCount` vive dentro `CollectionView`. La nuova barra (se sorella di CollectionView, es. montata nel layout pubblico) non vede `selectionCount` senza lift-up dello stato o un context. Vedi raccomandazione.

### 4) Bottom-sheet riutilizzabile

`PublicSheet.tsx` — sì, **stesso componente per product detail E carrello** (mobile=bottom-sheet, desktop=dialog centrato). Props (`PublicSheet.tsx:19-39`):
```tsx
type Props = { isOpen; onClose; children; ariaLabel?; headerContent?; contentKey? };
```
- **Scrim**: sì — backdrop `rgba(0,0,0,0.52)`, opacity legata a `y` drag via `useTransform` (`:50`), click backdrop → close.
- **Drag-to-dismiss**: sì — mobile `drag="y"` + `onDragEnd` close se `offset.y>100 || velocity.y>400` (`:370`); desktop Escape (`:295-302`).
- iOS scroll-lock via `body.position:fixed` + `body.style.top` (`:82-147`), `contentKey` per swap contenuto mid-animation.
→ La bottom-sheet del carrello richiesta dal target **esiste già**, pronta.

### 5) Layering (z-index)

Vedi tabella (c). **Nessun sistema di token z-index** — valori ad-hoc, niente `_tokens`/`_variables.scss`.

### 6) Viewport / safe-area

- Unità: `dvh` usato (`100dvh` CollectionView.module.scss:17; `75/85dvh` PublicSheet; `72/80/88dvh` SearchOverlay). **`svh` NON usato.**
- `env(safe-area-inset-bottom)`: già applicato ai due FAB (`CollectionView.tsx:2190,2222`) e alle sheet (OrderingSheet, PublicSheet). `inset-top` su header (`:40`). `inset-left/right` sui FAB.
- **Footer fixed**: NO. `PublicFooter` scrolla con la pagina.
- Scroll listener su window: sì, ~9 punti — `useFabCollapse.ts:62`, `useScrollCollapse`, `CollectionView.tsx:1438/1515`, `PublicCollectionHeader.tsx:179` (legge `body.style.top` durante lock iOS), `CollectionSectionNav.tsx:61/119`, `FeaturedBlock:121`.
→ Pattern safe-area già maturo: la nuova barra può riusare `calc(... + env(safe-area-inset-bottom))` come i FAB esistenti.

### 7) i18n

- Libreria: **react-i18next** (`useTranslation("public")`), namespace `"public"`.
- Tab già tradotti: `t("hub.menu" | "hub.events" | "hub.reviews")` (`PublicCollectionHeader.tsx:324`).
- FAB recensione già tradotto: `t("fab.review_aria")`, `t("fab.review_label")` (`CollectionView.tsx:2228,2230`).
- ⚠️ **Gap**: FAB carrello ha `aria-label="Il tuo ordine"` **hardcoded** (`CollectionView.tsx:2202`). Per la barra icon-only serve una chiave, es. `t("fab.cart_aria")`, da aggiungere ai file `public.*`.
- I `labelKey` esistenti (`hub.*`) bastano come aria-label icon-only per i 3 tab non-carrello.

### 8) Sistema responsive

- Breakpoint mobile: **640px**, hard-coded (`useIsMobile(breakpoint = 640)` in PublicSheet; matchMedia 640).
- **Nessun file SCSS breakpoint centralizzato** (no `_breakpoints.scss`/`_mixins.scss` in `src/styles/`). Valori inline per componente.
- Card layout: **container queries** (`@container collection`), MAI `@media` (enforced in CLAUDE.md). L'header invece usa la propria logica JS (scroll/width).
→ Lo split responsive (barra ≤640px / tab header >640px) è fattibile, ma il breakpoint va deciso esplicitamente perché non c'è una sorgente unica (rischio drift).

---

## (c) Tabella z-index (overlay pubblici)

| Overlay | z-index | File |
|---|---|---|
| LanguageSelector dropdown | **950** | LanguageSelector.module.scss:46 |
| PublicSheet (mobile root + desktop overlay) | **900** | PublicSheet.module.scss:6,32 |
| SearchOverlay | 200 | SearchOverlay.module.scss:14,53 |
| FAB destro (ordine) | 60 | CollectionView.module.scss:1030 |
| FAB sinistro (valuta) | 55 | CollectionView.module.scss:747 |
| Section nav chips (categorie) | 20 | CollectionView.module.scss:66 |
| Section nav (categorie) | 10 | CollectionSectionNav.module.scss:9 |
| Featured card overlay | 2 | FeaturedCard.module.scss:204,209 |

**Niente scala/token.** La nuova barra deve stare **sopra i FAB (55-60) ma sotto le sheet (900)**, così la bottom-sheet carrello la copre quando aperta. Range consigliato: ~500. Domanda aperta: relazione barra ↔ toast/`submitFeedback` (`CollectionView.module.scss:1254`, ~200) — la barra non deve coprire il toast di conferma.

---

## (d) Raccomandazione finale

**L'approccio feature-flag + responsive-split è realizzabile in modo pulito.** L'architettura è già quasi pronta:

✅ Stato `activeTab`/`HubTab` centralizzato e passato per props — un solo punto da intercettare.
✅ Icone target **già presenti** (BookOpen/CalendarDays/MessageSquareHeart); il gate `showHubTabs` esiste già su `PublicCollectionHeader`.
✅ Bottom-sheet carrello (`PublicSheet` + `OrderingSheet`) già pronta con scrim + drag.
✅ Trigger reminder recensione isolabile in un flag (`valutaEligibleRef`/scroll 70%) → diventa dot sull'icona cuore senza toccare la logica.
✅ Pattern safe-area + dvh + i18n già maturi.

### Blocker / attenzioni (nessuno fatale)

1. **`selectionCount` è interno a `CollectionView`** (sessionStorage locale). Una barra montata fuori da `CollectionView` non vede il badge senza lift dello stato o un piccolo context. → **Soluzione minima**: montare la barra *dentro* `CollectionView` (dove FAB e `selectionCount`/`activeTab`/`onTabChange` sono già in scope) e sostituire i 2 FAB. Niente nuovo provider.
2. **`aria-label` carrello hardcoded** → aggiungere chiave i18n `fab.cart_aria` (namespace `public`).
3. **Nessun token z-index né breakpoint centralizzato** → fissare due costanti locali esplicite (z ~500; breakpoint 640) per evitare drift; non serve refactor globale.
4. **Domanda aperta**: il `submitFeedback`/toast (z~200) e la posizione barra — definire stacking per non coprirlo.
5. **Domanda aperta**: su desktop il target dice "tab header" → con responsive-split la barra è solo ≤640px e su >640px restano i tab `HUB_TABS` attuali. Confermare che desktop NON debba mostrare la barra (altrimenti il `showHubTabs` gate va invertito per viewport).

### Cucitura minima per il flag (senza toccare il resto)

1. Flag in `CollectionView` (es. prop `useBottomBar` da style/feature config), default `false` → comportamento attuale invariato.
2. Quando `true` **e** mobile (≤640): nascondere i 2 FAB (`orderingFab`/`valutaFab`) e passare `showHubTabs={false}` a `PublicCollectionHeader`; rendere una nuova `<PublicBottomBar>` dentro `CollectionView` che riusa `activeTab`, `onTabChange`, `selectionCount`, `openOrdering`, e il flag eligibilità reminder (dot).
3. Quando `true` e desktop (>640): lasciare i tab header attuali (no barra), FAB carrello opzionale o invariato — da confermare (punto 5).
4. Nessuna modifica a `PublicSheet`/`OrderingSheet`/storage/i18n esistenti, salvo aggiunta chiave `fab.cart_aria`.

Superficie del flag: **1 componente nuovo + edit chirurgici in `CollectionView.tsx` e `PublicCollectionHeader` (già predisposto con `showHubTabs`)**. Nessun provider nuovo, nessuna migration, nessun cambio di routing.
