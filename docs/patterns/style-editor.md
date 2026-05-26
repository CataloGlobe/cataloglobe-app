# Style Editor / Preview

**Percorso**: `/business/:businessId/styles/:styleId` → `StyleEditorPage`.

```
StyleEditorPage
├── StylePropertiesPanel (editing) / StylePropertiesReadOnly (versioni pubblicate)
├── StyleVersionsPopover
└── StylePreview
     ├── PublicThemeScope
     └── CollectionView (mode="preview", MOCK_FEATURED + MOCK_SECTION_GROUPS inline)
```

- `StylePreview` passa al `CollectionView` sia `scrollContainerEl` sia `viewportWidthEl` (entrambi `screenEl` del device frame). Senza `viewportWidthEl`, `window.innerWidth` del browser editor farebbe collassare l'header in preview mobile.
- `headerRadius` passato come valore numerico dal campo `appearanceRadius` del `CollectionStyle` — NON letto via `getComputedStyle`. Helper `borderRadiusToPx("none"|"soft"|"rounded") -> 0|10|20` in `src/features/public/utils/mapStyleTokensToCssVars.ts`.
- `navigationStyle` valori correnti: `"filled" | "outline" | "tabs" | "dot" | "minimal"`. I valori deprecati `"pill"` e `"chip"` sono rimappati a `"filled"` in `parseTokens` — la label UI nel PropertiesPanel resta "Pill" per familiarità.
- Responsive grid card è basato su container queries: misura larghezza di `.container` (device frame in preview, body in runtime). Coerente preview/runtime by design.
- Runtime e preview devono restare sincronizzati: `parseTokens()` converte i token nel `collectionStyle` usato da CollectionView.
