# Stadio 2 SSR — Header hydration deterministica · FASE 1 (audit + design)

**Data**: 2026-06-12 · Read-only, nessuna modifica. Da discutere prima della FASE 2.

---

## 1. Audit completo — stili inline nel render a-riposo (scrollY=0)

`PublicCollectionHeader.tsx` emette **7 proprietà inline** sull'`<header>` (righe 232-241) + 1 sul gap div (riga 333). A riposo (`progress=0`, i `lerp(a,b,0)` ritornano `a`):

| Proprietà | Valore a riposo | Dipendenza | Mismatch SSR? |
|---|---|---|---|
| `marginLeft/Right` = `currentMargin` | mobile: **10px** · desktop: **`max((clientWidth − frameMax)/2 + 16, 16)`** (riga 186-188) | **viewport, continua** (clientWidth) | **SÌ** — è il `10 vs 16px` catturato dalla spike |
| `marginTop` = `coverOverlap` | con cover: **−(headerHeight + 12)** = −120 mobile / −128 desktop · senza cover: 0 (riga 198-200) | **isMobile, binaria** | **SÌ** — il `−120 vs −128px` della spike |
| `borderRadius` = `currentRadius` | `headerRadius ?? (isMobile ? 16 : 20)` (riga 189) | prop token **oppure** isMobile | **NO nel call site reale** (vedi sotto), ma fallback a rischio |
| `top` = `currentTopOffset` | 8px (`TOP_OFFSET` costante) | nessuna | no |
| `position: sticky` / `zIndex: 30` / `overflow: hidden` | costanti | nessuna | no |
| gap div `height` = `currentGap` | 8px (lerp(8,0,0)) | nessuna | no |

**Dipendenze indirette** (alimentano le metriche sopra, non emesse direttamente):
- `viewportWidth` — useState init `document.documentElement.clientWidth` client / `1024` server (riga 124-126)
- `isMobile` — useState init `window.innerWidth < 768` client / `false` server (riga 127-129)
- `headerHeight` = `isMobile ? 108 : 116` (riga 190) — usato SOLO da `coverOverlap`
- `readContentMaxWidth()` (riga 22-28) — legge `--pub-frame-max-desktop` via `getComputedStyle` **in render** (chiamata da `initialMargin`); guarded per il server (fallback 1280) ma è il valore client che diverge dal fallback se il token cambia

**Conclusione audit**: le metriche viewport-dependent del markup a riposo sono **esattamente 2** — `margin-inline` (continua) e `margin-top` (binaria) — più il **fallback** di `borderRadius` (dead-path oggi).

### borderRadius: deterministica di fatto
Unico call site: `CollectionView.tsx:1860` → `headerRadius={style.appearanceRadius}` = `borderRadiusToPx(token)` → **sempre** `0 | 10 | 20`. Il fallback `isMobile ? 16 : 20` non è mai esercitato. In FASE 2: renderlo esplicitamente deterministico (default fisso, o prop required) così il rischio sparisce dal type system.

---

## 2. A-riposo vs scroll-driven

| Dove serve | Metriche |
|---|---|
| **Markup iniziale (a riposo)** | `margin-inline` iniziale, `margin-top` (cover overlap), `border-radius` iniziale, `top` 8px, gap 8px |
| **Solo animazione (post-hydration)** | i 4 lerp (`currentMargin`, `currentRadius`, `currentTopOffset`, `currentGap`) con `progress > 0` — guidati da `scrollY`, che cambia SOLO dentro lo scroll effect (righe 157-181) |

`margin-top`/`coverOverlap` **non è animata affatto** (costante rispetto a progress) → può uscire del tutto dagli inline style, per sempre.

---

## 3. Mappatura CSS proposta (markup server viewport-independent)

### 3a. `margin-top` (cover overlap) → CSS puro, esce dal JS
```scss
.root {
  --header-h: 108px;                      // mobile
  @media (min-width: 768px) { --header-h: 116px; }

  &[data-cover="true"] { margin-top: calc(-1 * (var(--header-h) + 12px)); }
}
```
`data-cover={showCoverImage}` è una prop server-known → deterministico. JS non la tocca mai più.

### 3b. `margin-inline` a riposo → calc con `%`
```scss
.root {
  margin-inline: 10px;                    // mobile
  @media (min-width: 768px) {
    margin-inline: max(calc((100% - var(--pub-frame-max-desktop, 1280px)) / 2 + 16px), 16px);
  }
}
```
Punti chiave:
- **`%` nel margin risolve sul containing block**, non su `100vw` → niente off-by-scrollbar (~15px che con `100vw` sfaserebbe il margin di ~7.5px vs il JS che usa `clientWidth`).
- Containing block verificato: `<header>` è figlio diretto di `main.page` (`width: 100%`, **zero padding orizzontale**, verificato in `CollectionView.module.scss`) → `100%` ≡ `documentElement.clientWidth`. Formula CSS ≡ formula JS, identica al pixel → il lerp parte esattamente da dove CSS lascia.
- Stessa fonte `--pub-frame-max-desktop` già letta da `readContentMaxWidth` → un'unica source of truth.

### 3c. `border-radius`, `top`, gap `height` a riposo → SCSS/prop
- `top: 8px`, gap `height: 8px`, `position/z-index/overflow` → SCSS statico (costanti).
- `border-radius` a riposo: resta inline ma **da prop token** (`headerRadius`, server-known) — già deterministica; fissare il fallback.

### Caveat preview (non blocker)
Le `@media` rispondono alla viewport reale, non al device frame della preview (`viewportWidthEl`). Il file SCSS gestisce **già** questo caso con gli override `:global(.preview-mobile) &` / `:global(.preview-desktop) &` (usati per cover height e inner max-width) → stesso pattern per `--header-h` e `margin-inline`:
```scss
:global(.preview-mobile) & { --header-h: 108px; margin-inline: 10px; }
:global(.preview-desktop) & { --header-h: 116px; margin-inline: max(...); }
```
La preview non è SSR-ata: l'unico requisito è che resti visivamente identica.

### Metriche NON esprimibili in CSS
**Nessuna.** Tutte le metriche dello stato a riposo hanno equivalente CSS esatto. Nessun blocker.

---

## 4. Aggancio del lerp (resta intatto, post-hydration)

Pattern proposto — **inline styles solo quando l'animazione è ingaggiata**:

```tsx
const engaged = scrollY > 0;   // false su server e primo render client

<header
  className={styles.root}
  data-cover={showCoverImage || undefined}
  style={engaged ? {
    top: currentTopOffset,
    marginLeft: currentMargin,
    marginRight: currentMargin,
    borderRadius: currentRadius,
  } : { borderRadius: initialRadius }}   // radius da token: deterministico
/>
<div aria-hidden style={{ height: engaged ? currentGap : 8 }} />
```

Perché funziona:
1. **Server e primo render client identici**: `scrollY` init `0` in entrambi → `engaged=false` → nessun inline viewport-dependent → CSS governa → **zero mismatch**.
2. **Primo scroll event = per definizione post-hydration**: `setScrollY` → re-render → inline styles sovrascrivono le regole CSS (specificità inline > foglio) → lerp attivo. `initialMargin` JS = formula CSS al pixel (3b) → **nessun salto visivo** al takeover.
3. **Ritorno a riposo**: `scrollY=0` → inline rimossi → CSS riprende. Simmetrico.
4. `viewportWidth`/`isMobile` JS: settati dal resize effect (riga 131-155, `handleResize()` chiamato subito al mount) → pronti prima che qualsiasi scroll event possa arrivare.
5. Il meccanismo lerp (formule, costanti prototipo, `TRANSITION_END`) **non si tocca**: cambia solo *quando* i valori vengono emessi come inline style.

Alternativa scartata (per ora): CSS scroll-driven animations (`animation-timeline: scroll()`) eliminerebbe il JS del tutto, ma il supporto Safari/iOS non è ancora affidabile per l'audience della pagina pubblica. Rivalutare più avanti.

---

## 5. Confinamento di readScroll / body.style.top / headerRadius — verificato

| Cosa | Dove | Verdetto |
|---|---|---|
| `readScroll` + `body.style.top` + `body.style.position` (workaround iOS body-lock) | SOLO dentro `useEffect` righe 157-181 | ✅ post-hydration, nessun impatto sul render iniziale |
| ResizeObserver `--pub-header-height` su `<main>` | `useEffect` righe 100-120 | ✅ effect-time |
| `headerRadius` | prop letta in render, ma valore da token (`style.appearanceRadius`, sempre `0\|10\|20`) | ✅ deterministica server↔client |
| `readContentMaxWidth` (`getComputedStyle` in render) | riga 188, dentro `initialMargin` | ⚠️ oggi è render-time; col design sopra viene chiamata solo quando `engaged=true` (post-hydration) → esce dal path di hydration |
| `viewportWidth`/`isMobile` useState init | righe 124-129, guarded | ✅ col design non toccano più il markup a riposo |

---

## 6. Stima FASE 2

**~0.5–1 giorno**:
- Edit `PublicCollectionHeader.tsx` (gate `engaged`, `data-cover`, fallback radius deterministico) + `PublicCollectionHeader.module.scss` (3a/3b/3c + override preview) — il grosso.
- Verifica: harness bare (`node spike-ssr/run.mjs`) → markup a riposo identico; hydration test multi-viewport (390/768/1200) con `spike-ssr/server.mjs` + Playwright → **zero mismatch attese, incluso il 390px** che oggi fallisce; Playwright SPA su scroll (lerp hero→compact fluido, takeover senza salto, preview-mobile/desktop nello Style Editor invariati — obbligo playwright MCP per `PublicCollectionView/`).
- Rischio principale: pixel-parity CSS↔JS al takeover (mitigato: stessa formula, stessa var, containing block verificato). Rollback facile (2 file).
