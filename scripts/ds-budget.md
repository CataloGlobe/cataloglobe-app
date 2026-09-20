# ds-budget — i contatori del refactor del design system (M17)

`npm run ds:budget` misura e salva la baseline in `scripts/ds-budget.json`;
`npm run ds:budget:check` (CI, job `ds-budget`) esce 1 se un contatore
**sale**. I numeri possono solo scendere; il lavoro è finito a zero.

## Perimetro dei contatori 1–5 (back office, senza `ui/`)

`src/pages/{Admin,Auth,Business,Dashboard,Invite,Onboarding,Operativita,Setup,Workspace}`,
`src/layouts`, `src/components` esclusi `public`, `PublicCollectionView`,
`catalog-renderer`, `ui`. La galleria `src/dev/` è fuori.

| # | chiave | cosa conta | dove |
|---|---|---|---|
| 1 | `hex` | hex letterali (`#abc`, `#aabbcc`, `#aabbccdd`) fuori dal fallback di `var(--x, #hex)`, commenti esclusi | `.module.scss` |
| 2 | `transition` | dichiarazioni `transition`/`transition-property` con `all`, `width`, `height`, `margin`, `padding` (anche `max-`/`min-`/`-inline-*`) | `.module.scss` |
| 3 | `toastError` | `showToast({ … type: "error" })` | `.ts`, `.tsx` |
| 4 | `inlineComponents` | funzioni/const PascalCase **non esportate** con JSX nel corpo, escluso il componente col nome del file (criterio del censimento) | `.tsx` sotto `src/pages` |
| 5 | `fontSize` | dichiarazioni `font-size:` | `.module.scss` |

## Contatore 6 — `uiHex` (lotto 2b)

Stesso criterio del contatore 1, perimetro **solo `src/components/ui`**. I
componenti del sistema devono leggere i token di `_theme.scss`, non hex
propri: è il contatore che i lotti 2b/2c portano a zero famiglia per famiglia.
`ui/` resta escluso dai contatori 1–5 anche perché lì `font-size` è legittimo
(regola: una pagina non dichiara mai una dimensione di testo, un componente sì).

## Baseline

Salvata il 20/09/2026 (lotto 0): 812 · 33 · 406 · 47 · 731. Il sesto
contatore parte con il lotto 2b. I numeri del piano (597 · 12 · 239 · 56 · 524)
venivano da uno script perso che sottostimava: non sono confrontabili.

Dopo il lotto 2c: 797 · 32 · 406 · 47 · 731 · **uiHex 4**. I due cali sul
perimetro sono `AppSidebar.module.scss` (in `components/layout`). Il 4 di
`uiHex` è la baseline definitiva con due eccezioni, commentate nei file:

- `ui/DeviceFrame/DeviceFrame.module.scss` — grafite del bezel `#1c1c1e`
  (bordo + fondo, 2 hex): colore del dispositivo, uguale in entrambi i temi;
  nessun token scuro fisso.
- `ui/ImageReframeEditor/ImageReframeEditor.module.scss` — gradiente
  decorativo del punto «Colore» `#c2410c → #928e72` (2 hex): campione, non
  un colore del sistema.

Qualsiasi altro hex in `ui/` fa fallire il check.
