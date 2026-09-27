# Style Editor / Preview

**Percorso**: `/business/:businessId/styles/:styleId` → `StyleEditorPage`.

```
StyleEditorPage
├── StylePropertiesPanel (una sola vista: in `fieldset disabled` + banner per chi non ha `styles.write`,
│   per l'abbonamento fermo e per gli stili di sistema — StylePropertiesReadOnly è uscito, §50.11/3)
├── StyleVersionsPopover
└── StylePreview
     ├── PublicThemeScope
     └── CollectionView (mode="preview", MOCK_FEATURED + MOCK_SECTION_GROUPS inline)
```

- `StylePreview` passa al `CollectionView` sia `scrollContainerEl` sia `viewportWidthEl` (entrambi `screenEl` del device frame). Senza `viewportWidthEl`, `window.innerWidth` del browser editor farebbe collassare l'header in preview mobile.
- `headerRadius` passato come valore numerico dal campo `appearanceRadius` del `CollectionStyle` — NON letto via `getComputedStyle`. Helper `borderRadiusToPx("none"|"soft"|"rounded") -> 0|10|20` in `src/features/public/utils/mapStyleTokensToCssVars.ts`.
- `navigationStyle` valori correnti: `"filled" | "outline" | "tabs" | "minimal" | "tinted"`. I valori deprecati `"pill"`, `"chip"` e `"dot"` (variante rimossa) sono rimappati a `"filled"` in `parseTokens` — la label UI nel PropertiesPanel resta "Pill" per familiarità. `"tinted"` ("Sfondo soffuso") riusa il token `--pub-primary-soft` già consumato altrove (AllergenIcon, CharacteristicIcon, CollectionView, MoreSheet, FeaturedCard).
- Responsive grid card è basato su container queries: misura larghezza di `.container` (device frame in preview, body in runtime). Coerente preview/runtime by design.
- Runtime e preview devono restare sincronizzati: `parseTokens()` converte i token nel `collectionStyle` usato da CollectionView.
- **Salva in testata** (`HeaderSaveAction`) con guardia all'uscita (`useUnsavedChangesGuard`); l'avviso «Stile in uso» è un `ConfirmDialog` che non si spegne (via «Non chiedere più» e la chiave `cataloglobe-style-skip-confirm-*`, §34.5/3). Rilegge le regole al Salva e nomina chi vede la modifica e quando (`describeStyleSaveWarning`, §34.5/1–2): senza regole vive non si apre. Stile di sistema: «Duplica e personalizza» in testata.
- **Editor stretto** (container query `style-editor`, sotto 600 px): il pannello resta a destra e comprimibile ma si sovrappone all'anteprima ed è largo al più quanto l'editor. L'anteprima mobile non scala (`DeviceFrame` mobile): a 768 con pannello aperto è tagliata a sinistra.
- **Elenco**: `CardGrid` con `StyleSwatch` (SVG, colori negli attributi `fill`) nell'area media, o `DataTable` con lo swatch compatto. `StyleSwatch` vive in `src/components/ui/StyleSwatch/` (due consumatori: Stili e la card del menù, §49.3); `label` gli dà un nome accessibile quando il campione dice qualcosa che il testo non dice.
