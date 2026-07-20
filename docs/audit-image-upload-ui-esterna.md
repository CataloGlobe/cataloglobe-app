# Audit — UI esterna dei picker immagine (FASE 10, read-only)

> Documento di sola lettura. Le fasi precedenti hanno unificato solo l'**editor**
> interno (`ImageUploadEditor` = dropzone + compress + `ImageReframeEditor` +
> preview `FramedMedia`), adottato in 6 dei 7 punti. Questa fase mappa la **UI
> esterna** — il "guscio" (drawer / sezione di pagina) che ognuno dei 7 punti ha
> mantenuto attorno al wrapper: anteprima pre-editor, posizione del trigger di
> modifica, affordance di rimozione, micro-copy. Propedeutico a una fase che
> unificherà anche il guscio.
>
> Nessuna modifica al codice. Audit eseguito il 2026-07-17.

---

## 0. Premessa architetturale — cosa il wrapper già uniforma

Prima dei 7 punti, va chiarito **cosa produce oggi `ImageUploadEditor`** a livello
di UI, perché una fetta rilevante dell'"esterno" è già di fatto standardizzata dal
wrapper stesso (`src/components/ui/ImageUploadEditor/ImageUploadEditor.tsx`).

Il wrapper ha **due stage** e li renderizza **in-place, nello stesso contenitore**
(nessun overlay/drawer proprio — l'adottante lo inserisce nel suo guscio):

- **Stage `select`** (default):
  - Se è passato `initialSource` (contesto modifica): box anteprima `FramedMedia`
    all'`aspectRatio` del punto + bottone **secondary fullWidth "Ri-inquadra"** +
    dropzone sotto.
  - Sempre presente sotto: la dropzone `ImageUploadField`, invocata **sempre con
    `imageUrl={null}`** → mostra solo lo stato vuoto: icona `ImagePlus` + testo
    **"Clicca o trascina un'immagine"**. (Le azioni interne "Sostituisci/Rimuovi"
    di `ImageUploadField` NON sono mai usate dal wrapper.)
- **Stage `edit`** (dopo selezione file o click "Ri-inquadra"): `ImageReframeEditor`
  inline (pan/zoom/fit/fill) + riga azioni **"Annulla" / "Conferma"**.

**Conseguenza:** empty-state, trigger di apertura editor, forma anteprima,
esperienza di crop e i bottoni Annulla/Conferma sono **già identici** ovunque il
wrapper è adottato. Ciò che ogni punto ancora possiede e diverge è:

1. Il **testo hint** sopra il wrapper (muted `Text`).
2. Il **contenitore** (SystemDrawer vs sezione in-page).
3. L'**affordance di rimozione** (bottone, stile, etichetta, conferma, timing) —
   che vive **fuori** dal wrapper, re-implementata in ogni guscio. **È qui che sta
   il grosso della divergenza residua.**
4. Il **timing di salvataggio** (immediato vs differito al "Salva" di pagina).
5. **Baked vs metadata** (5 baked, Prodotto = framing metadata).

---

## 1. Logo tenant

- **File**: `src/pages/Business/BusinessSettingsPage.tsx` (sezione "Identità visiva", L174-213).
- **Contesto**: sezione **in-page** (non drawer), dentro Impostazioni attività. Editor inline.
- **Hint**: *"Logo attività — PNG, JPG o WEBP. Inquadra e ritaglia in formato quadrato prima di salvare."*
- **Stato "nessuna immagine"**: solo dropzone "Clicca o trascina un'immagine".
- **Stato "immagine presente"**: `FramedMedia` quadrato (`aspectRatio=1`, `initialAspectRatio=1`) + bottone "Ri-inquadra" + dropzone.
- **Modifica/sostituisci**: "Ri-inquadra" (re-crop del remoto) oppure drop di un nuovo file → editor inline. Bake quadrato 512px, fill modes `color`/`none`.
- **Rimozione**: `Button variant="danger"` **"Rimuovi logo"** in `sectionFooter`, visibile solo se `logo_url`. **Nessuna conferma — immediata** (con toast "Logo rimosso.").
- **Timing**: immediato (upload al Conferma, remove standalone).

## 2. Cover sede

- **File**: `src/pages/Operativita/Attivita/tabs/ActivityCoverDrawer.tsx`.
- **Contesto**: **SystemDrawer** 520px, header "Modifica immagine di copertina", footer "Chiudi". Editor inline.
- **Hint**: *"Utilizzata come sfondo principale nella testata del catalogo pubblico. PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in formato 16:9 prima di salvare."*
- **Stato "nessuna immagine"**: solo dropzone.
- **Stato "immagine presente"**: `FramedMedia` 16:9 (`initialSource=cover_image`) + "Ri-inquadra" + dropzone.
- **Modifica/sostituisci**: "Ri-inquadra" o drop nuovo file → editor inline. Bake 16:9 1280px.
- **Rimozione**: **due-step inline** (unico punto con conferma). Link testuale con icona `Trash2` **"Rimuovi immagine di copertina"** → si espande in riga di conferma *"Rimuovere l'immagine di copertina?"* + "Annulla" / "Rimuovi". Conferma **inline** (né dialog né drawer separato).
- **Timing**: immediato.

## 3. Avatar utente

- **File**: `src/pages/Workspace/WorkspaceSettingsPage.tsx` (Card "Profilo" + drawer "Modifica profilo", L425-444).
- **Contesto**: **annidato/due-livelli**. Card "Profilo" mostra avatar (`<img>` circolare o placeholder iniziali) + bottone secondary **"Modifica profilo"** → apre **SystemDrawer** 480px condiviso col form nome/telefono. L'editor è dentro il drawer. Editor inline.
- **Hint** (nel drawer): *"Avatar — PNG, JPG o WEBP, max 10 MB. Inquadra e ritaglia in formato quadrato; viene salvato subito."*
- **Stato "nessuna immagine"**: nella Card → placeholder `<span>` con **iniziali** (es. "LC"); nel drawer → dropzone.
- **Stato "immagine presente"**: Card → `<img>` circolare `.avatar`; drawer → `FramedMedia` quadrato (`initialSource=avatarUrl`, `initialAspectRatio=1`) + "Ri-inquadra" + dropzone.
- **Modifica/sostituisci**: da Card apri drawer, poi "Ri-inquadra" / drop → editor inline. Bake quadrato 512px, fill `blur`/`none`.
- **Rimozione**: `<button>` testuale **"Rimuovi foto"** (`styles.removeAvatarBtn`), visibile se `avatar_url`. **Nessuna conferma — immediata**.
- **Timing**: **immediato** per l'avatar (upload al Conferma; rimozione standalone), mentre nome/telefono restano legati al "Salva modifiche" del form — asimmetria intenzionale documentata nel codice.

## 4. Gallery sede

- **File**: `src/pages/Operativita/Attivita/tabs/ActivityGalleryUploadDrawer.tsx`.
- **Contesto**: **SystemDrawer** 520px, header "Aggiungi immagine", footer "Chiudi". Editor inline.
- **Hint**: *"Aggiungi una foto alla galleria. PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in formato 16:9; ogni foto viene salvata subito. Puoi aggiungerne altre una alla volta."*
- **Stato "nessuna immagine"**: solo dropzone (**nessun `initialSource`** — flusso add-only single-image che si resetta a ogni Conferma).
- **Stato "immagine presente"**: **N/D in questo drawer.** L'anteprima delle foto esistenti + riordino/rimozione/set-as-cover vivono in `ActivityProfileTab` (logica di **lista**, fuori da questo guscio).
- **Modifica/sostituisci**: N/D (solo aggiunta). Ogni Conferma carica+inserisce una foto (bake 16:9 1280px) e resetta per la successiva.
- **Rimozione**: **NON qui** — gestita dalla lista in `ActivityProfileTab`.
- **Timing**: immediato per ogni foto.

## 5. Story cover

- **File**: `src/pages/Dashboard/Stories/components/StoryForm.tsx` (blocco "Copertina", L74-112).
- **Contesto**: **inline in pagina** (form controllato dentro `StoryDetailPage`, pattern draft-inline). Editor inline.
- **Hint**: label "Copertina" + caption *"PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in formato 16:9."*
- **Stato "nessuna immagine"**: solo dropzone.
- **Stato "immagine presente"**: `FramedMedia` 16:9 (`initialSource=coverUrl`, che può essere objectURL pendente o URL salvato) + "Ri-inquadra" + dropzone.
- **Modifica/sostituisci**: "Ri-inquadra" / drop → editor inline. Bake 16:9 1280px.
- **Rimozione**: `<button>` testuale **"Rimuovi copertina"** (`styles.coverRemoveBtn`), visibile se `coverUrl`. **Nessuna conferma.** Marca la rimozione come modifica **pendente** nel draft.
- **Timing**: **differito** al "Salva" di pagina (`StoryDetailPage` non fa eager upload; "esci senza salvare" non tocca lo storage). Read-only (`!canWrite`): mostra `<img>` semplice.

## 6. Prodotto (tab "Scheda")

- **File**: `src/pages/Dashboard/Products/SchedaTab.tsx` (`SectionCard "Immagine"`, L112-159).
- **Contesto**: **`SectionCard` in-page** (dentro `ProductPage`, pattern draft-inline). Editor inline.
- **Hint**: *"PNG, JPG o WEBP — max 10 MB. Inquadra in 16:9; l'inquadratura (punto focale) viene riapplicata alle card e al dettaglio."*
- **Stato "nessuna immagine"**: solo dropzone.
- **Stato "immagine presente"**: `FramedMedia` 16:9 con il **framing reale salvato** (`initialFraming=savedFraming`, `initialAspectRatio=savedAspectRatio`) + "Ri-inquadra" + dropzone.
- **Modifica/sostituisci**: "Ri-inquadra" / drop → editor inline.
- **UNICITÀ — metadata NON-baked**: nessuna prop `bake`. Il wrapper ritorna `{ file, framing, aspectRatio }` e il draft persiste **framing metadata** (colonne `image_framing` / `image_aspect_ratio`), riapplicato ai vari ratio di render via `FramedMedia`. È l'unico punto che NON schiaccia il crop sui pixel.
- **Rimozione**: `Button variant="ghost" size="sm"` **"Rimuovi immagine"**, visibile se `visibleImageUrl`. **Nessuna conferma.** Setta il flag `removeImage` + mostra nota *"L'immagine verrà rimossa al salvataggio."*
- **Timing**: **differito** al "Salva" di pagina.

## 7. Riferimento (fuori scope migrazione) — Featured + Blocco immagine Storia

Non passano dal wrapper: usano `ImageReframeEditor` **direttamente** nei propri drawer.
Citati solo come termine di paragone.

- **Contenuto in evidenza** — `src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx`: editor completo dentro drawer dedicato, framing su **colonne DB** di `featured_contents`.
- **Blocco immagine Storia** — `src/pages/Dashboard/Stories/components/blocks/StoryImageFramingDrawer.tsx`: **SegmentedControl** ratio `3:2`/`4:5` (scelta utente) + editor + fill, framing in **JSONB** `body_blocks[]`. Replace file dal footer del drawer.

> Rispetto ai 6 punti migrati, questi due hanno un guscio proprio più ricco
> (drawer dedicato, e per il blocco Storia un selettore di ratio) e **non**
> espongono lo stage `select`/preview del wrapper. Non vanno allineati in questa
> fase, ma dimostrano che il ratio può essere reso selezionabile a runtime.

---

## 8. Analisi comparativa

### 8.1 Tabella comparativa

| Punto | Trigger apertura | Anteprima (present) | Trigger modifica | Trigger rimozione | Contesto | Conferma rimozione |
|---|---|---|---|---|---|---|
| **Logo** | dropzone "Clicca o trascina" | `FramedMedia` 1:1 | "Ri-inquadra" / drop | `Button` danger "Rimuovi logo" (footer sezione) | sezione in-page | **No** (immediata) |
| **Cover sede** | dropzone | `FramedMedia` 16:9 | "Ri-inquadra" / drop | link `Trash2` "Rimuovi immagine di copertina" | SystemDrawer 520 | **Sì** (inline 2-step) |
| **Avatar** | Card "Modifica profilo" → dropzone | Card `<img>` cerchio / drawer `FramedMedia` 1:1 | "Ri-inquadra" / drop | `<button>` "Rimuovi foto" | SystemDrawer 480 (annidato) | **No** (immediata) |
| **Gallery** | dropzone (add-only) | — (lista in `ActivityProfileTab`) | N/D (solo aggiunta) | N/D (lista esterna) | SystemDrawer 520 | N/D |
| **Story cover** | dropzone | `FramedMedia` 16:9 | "Ri-inquadra" / drop | `<button>` "Rimuovi copertina" | inline in-page (form) | **No** (differita/reversibile) |
| **Prodotto** | dropzone | `FramedMedia` 16:9 (framing reale) | "Ri-inquadra" / drop | `Button` ghost "Rimuovi immagine" | `SectionCard` in-page | **No** (differita/reversibile) |

### 8.2 Pattern dominante (quasi-standard de facto)

Grazie al wrapper condiviso, **il 70% dell'UI esterna è già uniforme**:

- **Trigger apertura**: dropzone identica "Clicca o trascina un'immagine" ovunque.
- **Anteprima present**: box `FramedMedia` all'`aspectRatio` del punto.
- **Trigger modifica**: bottone secondary fullWidth **"Ri-inquadra"** + dropzone.
- **Editor**: inline in-place, azioni "Annulla" / "Conferma".
- **Hint copy**: segue già un template quasi-fisso — *"[Nome] — PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in formato [ratio]..."* (varia solo il nome/ratio e piccole code).

Il quasi-standard NON copre: **rimozione** (bottone, stile, etichetta, conferma) e
**timing salvataggio** — perché vivono nel guscio, non nel wrapper.

### 8.3 Outlier

- **Gallery** — outlier atteso: è una **lista** (add sequenziale + riordino/rimozione/set-cover altrove), non uno slot singolo. Non ha anteprima-di-esistente né rimozione nel drawer. Differenza strutturale, non un difetto.
- **Prodotto** — unico **metadata / non-baked**: persiste focal point per servire più ratio (List 1:1 / Grid 4:3 / dettaglio 16:9). Divergenza voluta e giustificata.
- **Cover sede** — unico con **conferma** sulla rimozione (2-step inline).
- **Avatar** — unico **annidato** (anteprima in una Card esterna, editor in un drawer aperto da "Modifica profilo"): due livelli di ingresso invece di uno.

### 8.4 Divergenze puntuali sulla rimozione (il vero debito)

La rimozione è re-implementata 5 volte con 5 combinazioni diverse:

| Punto | Etichetta | Stile bottone | Conferma | Timing |
|---|---|---|---|---|
| Logo | "Rimuovi logo" | `Button` danger | no | immediato |
| Cover sede | "Rimuovi immagine di copertina" | link testo + `Trash2` | **sì** (inline) | immediato |
| Avatar | "Rimuovi foto" | `<button>` testo | no | immediato |
| Story cover | "Rimuovi copertina" | `<button>` testo | no | differito (reversibile) |
| Prodotto | "Rimuovi immagine" | `Button` ghost | no | differito (reversibile) |

5 etichette diverse, 4 stili diversi, 1 solo con conferma, 2 timing diversi.

### 8.5 Proposta di pattern unico (1 sola proposta ragionata)

1. **Trigger apertura**: invariato — dropzone "Clicca o trascina un'immagine". Già uniforme.
2. **Forma anteprima**: invariata — `FramedMedia` all'`aspectRatio` del punto. Già uniforme.
3. **Posizione bottone modifica**: invariata — "Ri-inquadra" secondary fullWidth sotto l'anteprima. Già uniforme.
4. **Bottone rimozione — assorbirlo NEL wrapper**: aggiungere a `ImageUploadEditor` una prop opzionale `onRemove?` (+ `removeLabel?`). Quando presente e c'è `initialSource`, il wrapper renderizza **un unico bottone di rimozione standard** (stile e posizione fissi: testo destructive defilato sotto "Ri-inquadra"). Questo elimina 5 re-implementazioni e uniforma etichetta/stile in un solo posto. È la vera leva di consolidamento.
5. **Etichetta**: uniformare a **"Rimuovi immagine"** ovunque (nome-oggetto specifico rimosso). Semplice e coerente.
6. **Conferma su rimozione — regola per timing** (non "sempre" né "mai"):
   - Rimozione **immediata su storage** (Logo, Cover, Avatar, foto Gallery) → **conferma leggera inline** (il 2-step di Cover sede come standard). È distruttiva e non annullabile.
   - Rimozione **differita/draft** (Story cover, Prodotto) → **nessuna conferma**: è già reversibile via "Annulla" della barra Salva prima del commit; una conferma sarebbe rumore. Mantenere la nota "verrà rimossa al salvataggio" (pattern Prodotto) generalizzata.
7. **Timing salvataggio**: lasciare invariato (immediato per i punti standalone, differito per i draft-inline). È legato all'architettura del guscio, non alla UI del picker → **fuori scope** di un'unificazione puramente visiva.

### 8.6 Complessità stimata per allineare ciascun punto

| Punto | Complessità | Tipo di cambio | Note |
|---|---|---|---|
| **Cover sede** | Bassa | stile/label | È già il riferimento per la conferma; solo adozione della prop `onRemove` del wrapper. |
| **Story cover** | Bassa | stile/label | Sposta il bottone dentro il wrapper; nessuna conferma (corretto: reversibile). |
| **Prodotto** | Bassa | stile/label | Idem; mantiene metadata + nota "al salvataggio". Nessun cambio di comportamento. |
| **Logo** | Bassa/Media | **comportamento** | Adozione prop + label. **Cambio di comportamento**: oggi rimozione senza conferma → il pattern aggiunge conferma inline (immediata su storage). |
| **Avatar** | Bassa/Media | **comportamento** | Come Logo (**guadagna conferma** che oggi non ha). L'anteprima annidata nella Card resta com'è (non toccata). |
| **Gallery** | N/D per lo slot singolo | — | Outlier lista. Allineabile solo la copy dell'add-flow (bassa); rimozione resta nella lista di `ActivityProfileTab`. |
| **Wrapper** (`ImageUploadEditor`) | Media | API + UI | Aggiungere `onRemove?`/`removeLabel?` + rendering standard + logica conferma-per-timing. Tocca i 6 gusci ma li semplifica. |

**Cambi di comportamento da segnalare esplicitamente** (non solo stile):
- **Logo** e **Avatar** oggi rimuovono **senza conferma**; il pattern unico introduce
  una **conferma inline** (perché la delete è immediata e irreversibile). Va deciso
  consapevolmente, non è un semplice restyle.
- **Story cover** e **Prodotto** NON devono ricevere conferma (regressione UX: sono
  già reversibili via draft). Uniformare "sempre conferma" sarebbe un errore.

---

## 9. Punti con picker immagine NON tra i 7 (segnalati, non in tabella)

Emersi da FASE 1 e dal codice, **non ancora migrati al wrapper** — fuori scope qui,
ma rilevanti per una futura unificazione completa:

- **Logo in creazione azienda** — `CreateBusinessWizard.tsx` (~L452) e `CreateBusinessDrawer.tsx` (~L74): upload logo con il vecchio `FileInput`, non col wrapper. Duplicano l'affordance logo fuori da Impostazioni.
- **Cover in `Businesses.tsx`** (~L554, L855): altri call-site di cover fuori dal drawer sede.
- **AI Menu Import** — `src/pages/Dashboard/Catalogs/AiMenuImport/steps/UploadStep.tsx`: usa `compressImage` per le immagini menu (flusso import, non un picker di framing utente).

---

*Fine audit FASE 10. Nessun file di produzione modificato.*
