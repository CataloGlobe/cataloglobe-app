# Stili: tunnel, anteprima, vecchio editor

## Il tunnel (D186, Officina)

Uno stile si crea e si modifica nel tunnel: `/business/:businessId/crea/stile` e `crea/stile/:id` (`CreaPage` → `CreaTunnel` → `Tunnelo`). Dall'elenco (`Styles.tsx`) il clic sulla riga, «Modifica» e «Nuovo stile» portano lì con `?da=stili`.

- **Aspetto in sei parti** (`stileLook.ts`): cima, categorie, in evidenza, carattere, colori, piatti (`PART_IDS`). `restore` rimette una parte com'era, `partKey` la confronta. Tavolozza (`palette`) e colori del logo (`logoColors`).
- **Leggibilità**: `hardToRead` accende l'avviso sotto contrasto 3 fra colore principale e sfondo; «Rendilo leggibile» (`readable`) cerca il tono più vicino che arriva a 4,5, prima verso il bianco o il nero secondo quale si legge meglio sullo sfondo, poi dall'altra parte.
- **Salvataggio** (`creaEdit.ts`): il tunnel scrive `styleConfig(t)` = `serializeTokens(cleanLook(look))`. Il solo nome chiama `updateStyle` con config `undefined`: nessuna versione nuova. Colori e caratteri fanno una versione nuova.
- **Versioni di prima** (passo dell'aspetto, solo in modifica): «Guarda» apre l'anteprima di quella versione, «Torna a questa» ne copia l'aspetto nella bozza; diventa una versione nuova solo al Salva.
- **Controlla** dice per nome le sedi che vedono subito le modifiche.
- **Stile di CataloGlobe** (`is_system`): `loadTunnel` lancia `SystemStyleError` e il tunnel parte da lui per farne uno proprio (`fromStyle`), l'originale non si tocca.
- **Senza `styles.write`**: `StileGuarda`, le stesse parti e lo stesso telefono, spenti.
- **Abbonamento fermo**: il Salva si ferma su `useEnsureActive`.
- Prove: `src/tests/creaModel.test.ts` (aspetto, leggibilità), `src/tests/creaEdit.test.ts` (nome senza versione, «Torna a questa» + Salva).

## Il vecchio editor

**Percorso**: `/business/:businessId/styles/:styleId` → `StyleEditorPage`. Ancora montato, ma nessun link ci porta: le note qui sotto valgono per lui e per l'anteprima (`StylePreview`), che il tunnel riusa.

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
