# Piano — Correzioni di dettaglio del back office (refactor UI)

Aggiornato: 7 ottobre 2026 (aggiunto T9b). Autore delle decisioni: Lorenzo, con Claude (Cowork).
Da copiare nel repo come `docs/correzioni-ui-piano.md`. Claude Code lavora da questo file.

---

## 0. Obiettivo generale

Portare tutto il back office di CataloGlobe (pagine dell'azienda e Workspace) alle decisioni prese nel giro di correzioni del 3–5 ottobre 2026. È un **refactor dell'interfaccia**: stesse funzioni di oggi, stessi dati, stessi permessi. Cambiano composizione, testi, gerarchia, icone e responsive.

**Il lavoro è finito quando:**
- ogni task da T1 a T17 qui sotto ha raggiunto il suo goal;
- le regole trasversali dell'Allegato A valgono in tutte le pagine toccate;
- e2e verdi sulle spec toccate, giro visivo a 375 · 768 · 1280 fatto per ogni task;
- nessuna funzione persa, nessuna funzione nuova;
- `refactor/design-system` è pronto per la PR di checkpoint verso staging.

**Fuori scope** (non farli, anche se sembrano piccoli): tutto ciò che è in «Rinviati» (Allegato C), WS5 (solo analisi, T18), i bug del Lotto bug (T19, PR separate).

---

## 1. Contesto per lavorare in autonomia

### Repo e rami
- Worktree: `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/cataloglobe-ds`, ramo `refactor/design-system`. La cartella principale `CataloGlobe` è condivisa con altre chat: non usarla.
- Prima di iniziare: fondi `origin/staging` in `refactor/design-system` (nel frattempo sono entrate o entreranno #244, #253, #263, #266) e rifai `tsc -b`, lint, vitest.
- Ogni task = un ramo `ui/<task>` da `refactor/design-system`, un commit per passo, merge `--no-ff` in `refactor/design-system`. Alla fine una PR di checkpoint verso staging.
- I bug (T19) vanno in rami propri da `origin/staging`, PR separate.

### Vincoli (da CLAUDE.md e dal metodo, non negoziabili)
- Nessuna funzione persa né aggiunta. Se una decisione sembra richiedere una funzione nuova o un cambio di dati: **fermati e riporta**.
- Contrasto testo ≥ 4,5:1 in chiaro e scuro; solo token esistenti di `src/styles/_theme.scss`; niente CSS inline; SCSS Modules.
- Componenti in `src/components/ui/`: verifica prima di crearne. Le regole condivise si cambiano **una volta nel componente condiviso**, non pagina per pagina.
- Testi in italiano, «Sede» per activity, «Online / Sospesa» per lo stato della sede (D147, era «Pubblicata»).
- Gating: business → `usePermissions()` + `src/lib/permissions.ts`; workspace → `src/utils/workspaceRole.ts`. Nessun permesso cambia.
- DB: Claude Code non applica migration. Questo piano non ne richiede. Se ne serve una: fermati.
- Nessuna query su produzione, nemmeno in lettura. MCP staging solo lettura.
- Playwright obbligatorio per `src/components/PublicCollectionView/`, `src/pages/Dashboard/Styles/Editor/`, `scheduleResolver.ts` / `schedulingNow.ts`.
- e2e: una spec per chiamata, `workers: 2`, mai alzare timeout, mai modificare un test per farlo passare; i test nuovi prima (`test.fail`), poi il codice.
- Budget design system (`ds:budget:check`): solo in discesa. Lint: i 16 errori Edge preesistenti non devono crescere.
- git: `add` file per file, mai `-A`/`.`; niente `stash`, `checkout .`, `reset --hard`; `git --no-optional-locks status`.
- CLAUDE.md e memoria: solo diff proposti a Lorenzo, mai scritti senza ok.

### Quando fermarsi (e solo allora)
1. Una decisione richiede una funzione nuova, un dato che non esiste o una migration.
2. Il codice contraddice un fatto scritto qui (es. un componente che non esiste come descritto).
3. Una decisione è ambigua e le opzioni portano a risultati diversi per l'utente: proponi ≤ 3 opzioni con raccomandazione.
4. Fine di ogni task: riepilogo breve + screenshot 1280 e 375 per l'OK visivo di Lorenzo prima del merge.

### Verifica per ogni task
- `tsc -b`, eslint sui file toccati, vitest, e2e delle spec toccate.
- Giro visivo con Playwright sul dev server (porta 5174) a 375 · 768 · 1280, chiaro e scuro dove la pagina lo supporta; ferma il server alla fine.
- Ruoli: almeno owner e uno scoped (staff o viewer) dove il task tocca azioni gated.

### Materiale di riferimento (fuori repo)
Lorenzo ha: documento «Correzioni di dettaglio — decisioni» (fonte di questo piano), canvas «Correzioni CataloGlobe» (mockup per pagina) e design system «CataloGlobe Back Office». Se un'immagine aiuta, chiedila a Lorenzo indicando la pagina del canvas (es. «canvas, pagina Prenotazioni»). Le regole del design system sono copiate nell'Allegato A.

---

## 2. Ordine dei task

T1 (componenti e regole condivise) per primo: quasi tutte le pagine ne dipendono. Poi le pagine nell'ordine della sidebar. T17 (Workspace) è indipendente e può andare in parallelo. T19 (bug) in rami separati quando vuoi.

| Task | Area | Dipende da |
|---|---|---|
| T1 | Regole e componenti condivisi | — |
| T2 | Icone (sidebar e barra pubblica) | — |
| T3 | Panoramica | T1 |
| T4 | Sedi | T1 |
| T5 | Scheda della sede (+ tab Sala) | T1 |
| T6 | Cosa vedono i clienti | T1 |
| T7 | Menù | T1 |
| T8 | Prodotti e dentro un prodotto | T1 |
| T9 | Programmazione | T1 |
| T9b | Programmazione con più sedi | T9 |
| T10 | Stili | T1 |
| T11 | In evidenza | T1 |
| T12 | Storie | T1 |
| T13 | Lingue | T1 |
| T14 | Operatività: Servizio, Prenotazioni, Comande | T1, T5 |
| T15 | Andamento: Analitiche, Recensioni, Clienti | T1 |
| T16 | Impostazioni | T1 |
| T17 | Workspace | — |
| T18 | Analisi WS5 (sola lettura) | — |
| T19 | Lotto bug (PR separate) | — |

---

## 3. Task

### T1 · Regole e componenti condivisi

**Obiettivo:** mettere le regole trasversali (Allegato A) dentro i componenti condivisi, così che ogni pagina le erediti invece di correggerle una per una.

**Goal:** tutte le pagine del back office mostrano header senza sottotitolo, barra della pagina uniforme con il salvataggio a destra, tabelle che scorrono con la pagina; nessuna `UnsavedChangesBar` fluttuante resta in pagine che salvano in blocco.

**Cosa fare**
1. **Niente descrizione sotto l'header (M1).** Togli il sottotitolo dal punto unico in cui viene disegnato (`PageHeaderContext` / slot centralizzato). Le pagine possono smettere di passarlo; le spiegazioni restano negli stati vuoti (`EmptyState`). Dove una frase serve (es. Lingue «tradotti in pochi minuti»), il task della pagina dice dove spostarla.
2. **Barra della pagina uniforme (MD1, PS1).** A sinistra il contesto (tab, filtri, o stato dell'oggetto nelle pagine di dettaglio), a destra le azioni. Il salvataggio delle pagine che salvano in blocco sta qui: «✓ Salvato» oppure «N modifiche · Annulla · Salva» (`HeaderSaveAction`, già usato da prodotto e Storie). Le tab che salvano a ogni modifica lo dicono accanto a «✓ Salvato» («· in questa tab ogni modifica si salva subito»). Al telefono la barra va su due righe (contesto sopra, azioni sotto), bottoni alti 44. **È l'unico punto fisso della pagina**: nessun altro blocco sticky.
3. **Via `UnsavedChangesBar`** dalle pagine che salvano in blocco (Scheda della sede compresa). Il pattern draft/saved resta; cambia solo dove si mostra il salvataggio. Aggiorna CLAUDE.md (sezione «Pattern: draft inline») solo come diff proposto.
4. **Toolbar su una riga, tutta a destra:** ricerca, vista (griglia/elenco), azioni, principale per ultima. A sinistra solo tab o filtri.
5. **Tabelle (V3):** nel componente tabella condiviso niente scorrimento interno, scorre la pagina; 25 righe per pagina di default (via «Per pagina: Auto»); righe a `row-height` 56. Prezzi in formato italiano «2,90 €» (helper unico).
6. **SectionCard:** azioni nell'intestazione (max 2; varianti → menu); selettore di modo nell'intestazione accanto al titolo; stato vuoto uniforme (titolo, «Aggiungi» secondario nell'intestazione, una riga di testo; mai stato vuoto centrato e alto); niente riquadri informativi dentro (la spiegazione va nel sottotitolo); variante «card a riga singola» (titolo + frase a sinistra, bottone a destra; sotto 768 px il bottone va sotto).
7. **Righe di impostazione e righe con interruttore:** un componente (o variante) per «nome 15/600 + descrizione `caption` in colonna da 300 px a sinistra, controllo a destra, separatore, padding 24; sotto 768 px si impilano»; per gli interruttori i campi dipendenti si aprono sotto la riga.
8. **Scelta multipla da elenco che cresce (SD2/RG1):** in pagina chip (oltre 8: prime 8 e «+N altri») + bottone «Modifica …»; la scelta in un pannello laterale (`SystemDrawer`) con ricerca, «Seleziona tutte», caselle (prodotti: miniatura, prezzo, categoria). Mai tendine per scelte multiple, mai elenchi di caselle che allungano la pagina. Variante a scelta singola per i casi di oggi (una sede, un prodotto).
9. **Azioni AI:** bottone secondario con `Sparkles` in `brand-primary` («Genera con AI», «Importa con AI»).
10. **Un solo primario per schermata:** controlla checklist, liste e card; i «Fai ora» e simili diventano secondari.
11. **Stati:** «Sospesa» neutra ovunque (`hover-bg` + `gray-800`, puntino `gray-400`) (S4); le pillole sono stati, non nomi; avvisi da gestire in `warning-700`.
12. **Cornice:** C1 (selettore azienda senza bordo come la sede: a riposo nessun bordo né sfondo, al passaggio e a menu aperto lo stesso sfondo leggero; il cerchio con le iniziali resta); C2 (sfumatura in basso nell'area voci della sidebar se c'è altro sotto, in alto dopo lo scorrimento; al caricamento la voce attiva viene portata in vista).
13. **Storna:** gate da `tables.manage` a `orders.manage` (deciso prima del giro).
14. **Numeri e grafici (regola):** i numeri chiave stanno in una riga di card uguali in cima alla sezione (fino a 4, 2 al telefono); il colore della variazione segue il significato (`delta.invert` esiste già).

**Verifica in più:** un giro veloce su tutte le pagine della sidebar a 1280 e 375 per vedere che header e barra non si rompono da nessuna parte.

---

### T2 · Icone

**Obiettivo:** icone che parlano di ristorazione, una per concetto, uguali dove compare lo stesso oggetto.

**Goal:** sidebar (tutte le varianti: unica, azienda, sede) e barra inferiore della pagina pubblica usano le icone dell'Allegato B.

**Cosa fare**
- Sidebar (`src/utils/navModel.ts` è la fonte unica): applica la tabella dell'Allegato B. Tutte Lucide, 20 px.
- Selettore sede nell'header: stessa icona di Sedi (`Store`). Verifica che lo sia già.
- Barra inferiore della pagina pubblica: Storie `ScrollText` (al posto del libro), Recensioni `Star` (al posto del fumetto); Menù resta `Utensils`. **Playwright obbligatorio** (PublicCollectionView), stessi test della barra già esistenti (`e2e bottom-bar`).
- Badge: `brand` solo per cose da fare (Prenotazioni, Comande); Recensioni non ha badge (dopo R1).
- Prima di cambiare, elenca le icone attuali (voce → icona → libreria) e riportale nel riepilogo.

---

### T3 · Panoramica

**Obiettivo:** la vetrina con una sede usa lo spazio come quella multisede e ogni riga dice il vero.

**Goal:** P1–P7 fatti; nessuna funzione persa (⋯, collegamenti operativi, «Risolvi», «Apri sede», gate per ruolo); verifica a 375 · 768 · 1280.

**Cosa fare**
- **P1 · Vetrina con una sede:** la stessa riga del multisede, più grande: QR 128 a sinistra, poi nome (collegamento), URL e menù di adesso; a destra Apri · Copia link · Scarica QR (secondari), poi ⋯ con i collegamenti operativi della sede (Comande, Prenotazioni, Servizio, Cosa vedono i clienti), filtrati dai permessi come oggi. Telefono: QR 96 con nome e URL accanto, menù sotto, quattro bottoni da 44 in riga.
- **P2 · Il nome del menù non è uno stato:** puntino a quattro stati + «Sta mostrando» + nome del menù in testo. Pillola solo per i problemi: «Nessun menù attivo» (ambra, con Risolvi) e «Sospesa».
- **P3 · Link «Perché»:** verifica che ci sia accanto al nome del menù (visibile solo con `scheduling.read`, verso «Cosa vedono i clienti» della sede); se manca, rimettilo.
- **P4 · «Le basi ci sono»:** una riga sola senza card intorno, fondo `success-50`, nomi spuntati in testo `success-800`, «Mostra» a destra; tutta la riga apre la checklist.
- **P5 · «Cosa hai attivato»:** se un conteggio in attesa è > 0, quel pezzo in `warning-700` e la riga porta alla pagina. «Ordini» → «Comande» qui e nel ⋯ della vetrina. Dopo R1 Recensioni non ha più «in attesa»: allinea la riga a quello che c'è ora.
- **P6 · Panoramica vuota:** primario solo «Inizia la procedura guidata»; i «Fai ora» secondari.
- **P7 · Lingue «In arrivo»:** trova perché lo stato non è calcolato (probabile testo fisso) e fallo calcolare: Attivo se c'è almeno una lingua oltre l'italiano, altrimenti Non ancora. Se la causa è un'altra: fermati.

---

### T4 · Sedi (azienda con 2+ sedi)

**Obiettivo:** card e tabella allineate e veritiere. Restano entrambe le viste.

**Goal:** S1–S3 fatti (S4 è in T1).

**Cosa fare**
- **S1:** piede delle card ad altezza fissa (68 px) uguale ovunque; l'avviso «N nascosti, N non disponibili» va nel corpo accanto allo stato, `warning-700` con icona.
- **S2:** sede sospesa → «Pagina pubblica: Non visibile ai clienti» (non «Menu attivo ora»); sede senza menù → avviso ambra con puntino come in Panoramica. «Gestisci» su ogni riga e card.
- **S3 · Tabella:** colonna Stato larga quanto la parola, motivo della sospensione sotto; avviso nascosti/non disponibili sotto il menù; stesse informazioni delle card; «4 elementi» → «4 sedi». Sotto 768 px: Sede (con stato) e Menù.

---

### T5 · Scheda della sede

**Obiettivo:** schede ordinate, una cosa per tab, salvataggio nella barra (T1).

**Goal:** tab nell'ordine Anagrafica · Orari · Ordini al tavolo · Prenotazioni · Sala · Pubblicazione; A1–A3, O1–O5, U1–U5, SV3 fatti; Orari invariato.

**Cosa fare — Anagrafica**
- **A1 · Indice con lo stato:** ✓ verde sulle sezioni a valore singolo compilate (Identità, Copertina); conteggio su Contatti e Social; occhio barrato `warning-700` se compilata ma «Visibile ai clienti» spento. Al telefono resta nascosto. (Indirizzo web esce dall'indice: va in Pubblicazione, U1.)
- **A2 · Copertina:** «Cambia foto» (testo) e Rimuovi (icona con `aria-label`) nell'intestazione; senza foto nessuna azione, il corpo è l'area di caricamento; tolta l'etichetta «Immagine di copertina 16:9».
- **A3:** «Obbligatorio.» sotto il nome sparisce; basta l'asterisco, il testo compare solo come errore.

**Ordini e prenotazioni**
- **O1 · Due tab:** «Ordini al tavolo» (Ordini al tavolo · Stampanti) e «Prenotazioni» (Prima delle prenotazioni · Prenotazioni · Avvisi e promemoria · Capienza della sala · Regole di accettazione). I vecchi link/`?tab=` alla tab unica aprono Ordini al tavolo.
- **O2 · Piano Base:** le due tab visibili con lucchetto accanto al nome; dentro un solo pannello (non il form disabilitato): cosa fa la funzione, «Passa a Pro» (primario) e «Confronta i piani»; senza permessi di abbonamento «Chiedi al proprietario di passare a Pro».
- **O3 · Regole di accettazione:** righe di impostazione (T1); fascia con SegmentedControl standard (38); il link «Imposta la capienza» dentro l'opzione «Automatica entro la capienza». Nessun valore o comportamento cambia.
- **O4 · Avvisi e promemoria:** stessa struttura a righe; «Aggiungi dal team» → «Scegli dal team» sulla riga del campo email; aiuto «Se resta vuota avvisiamo …».
- **O5:** Stampanti con sottotitolo «Le stampanti collegate a questa sede»; nella checklist «Prima delle prenotazioni» bottoni secondari.

**Sala (SV3)**
- «Gestisci la sala» esce da Servizio e diventa la tab «Sala» della scheda della sede (tavoli, zone, accostamenti, QR). Stessi permessi (vedere `tables.read`; modificare `tables.manage` + abbonamento attivo); senza ordini né prenotazioni attivi lo stato vuoto di oggi. I vecchi indirizzi (`?modo=gestisci`, `/sala`) portano qui. Tabella secondo T1.

**Pubblicazione**
- **U1:** «Indirizzo web» (con Cambia indirizzo e indirizzi precedenti) si sposta dall'Anagrafica qui e si unisce al QR in una card «Indirizzo e QR».
- **U2:** accanto al QR «Personalizza» e «Scarica ▾» (menu PNG / SVG, ognuno con una riga sull'uso).
- **U3:** Menù in PDF, Stato ed Elimina diventano card a riga singola; allo Stato si toglie il riquadro verde interno (lo stato è la pillola accanto al titolo).
- **U4 · Testi:** PDF «Scegli menù, stile e cosa includere», «Esporta» → «Crea il PDF»; «Elimina il locale» → «Elimina la sede»; «Apri in una nuova scheda» → «Apri» con icona di uscita.
- **U5:** verifica sugli alias (`activity_slug_aliases` + redirect di `resolve-public-catalog`) che un QR stampato col vecchio indirizzo funzioni. Se sì, aiuto «Se cambi indirizzo, il QR già stampato continua a funzionare». Se no: fermati.

---

### T6 · Cosa vedono i clienti

**Obiettivo:** il riepilogo resta, la tabella diventa la parte principale.

**Goal:** V1–V4 fatti, uguali con una e con più sedi.

**Cosa fare**
- **V1:** intestazione alta 56 con «Cosa vedono i clienti» e «Apri pagina pubblica»; sotto due righe (padding 16/24): «Adesso, alle 11:45, vedono **Catalogo Completo**» (16 px) e «Per la regola … · Vedi la regola» (14 px, link normale). Tolti frase col nome della sede e conteggi. ~140 px in tutto.
- **V2:** tolta la riga «24 prodotti totali · 1 nascosto · 1 non disponibile»; restano tab Prodotti / Ingredienti e filtri + ricerca.
- **V3:** tabella secondo T1, categoria accanto al nome; anche per Ingredienti.
- **V4 · Ingredienti come Prodotti:** colonne Ingrediente · Disponibilità; controllo a parole «Come dice la regola · Nascosto · Non disponibile»; «· in 3 prodotti» accanto al nome; con prodotti in stati diversi nessuna voce selezionata e «misto: 1 nascosto su 3» in `warning-700`; tolta la riga «6 ingredienti». **Prima verifica** che l'occhio di oggi equivalga a «Come dice la regola» (tolta la modifica a mano) e non a un «forza visibile»; se è diverso: fermati.

---

### T7 · Menù

**Obiettivo:** elenco dei menù equilibrato e una pagina di composizione che lascia spazio al lavoro.

**Goal:** M2, M3, MD1–MD5 fatti (M1 è in T1); albero delle categorie e drag and drop invariati.

**Cosa fare**
- **M2 · Card dei menù:** card alte 236 con in cima il motivo dei Menù (foglio disegnato: titolo indigo, categorie, voci con puntini fino al prezzo; categorie disegnate = quelle vere fino a 3; menù vuoto = foglio vuoto), poi nome, «5 categorie · 24 prodotti», stato in fondo. Ordine: attivi adesso, poi per nome. Via `StyleSwatch` dalle card e il badge «+1 stile». Riferimenti: `Catalogs.tsx` 33, 117, 370–388, 557–574; `ruleAppearance.ts:268`.
- **M3:** «Solo su regole ferme» → «Nessuna regola attiva» (neutra); completa il commento a `ruleAppearance.ts:85`.
- **MD1:** barra della pagina come T1 (contesto a sinistra, salvataggio a destra).
- **MD2 · «Dove è attivo» nella barra:** a sinistra pillola «Attivo adesso in 2 sedi» + nomi + freccia, e «Le modifiche salvate vanno subito online». La freccia apre un pannello sopra il contenuto (non lo spinge): una riga per sede con regola (collegamento) e stato; si chiude con clic fuori, Esc o di nuovo sulla freccia. La card di ~320 px sparisce.
- **MD3:** tabella prodotti secondo T1; la colonna Categorie resta ferma mentre scorre la pagina.
- **MD4:** il «+» delle Categorie → secondario «+ Nuova» (`aria-label` «Aggiungi categoria»); primario resta «Aggiungi prodotti».
- **MD5 · Tab Traduzioni:** il componente resta; niente altezza fissa, scorre la pagina; la card esterna «Traduzioni del nome della categoria» perde bordo e sfondo (titolo e descrizione restano).

---

### T8 · Prodotti e dentro un prodotto

**Obiettivo:** elenco compatto e scheda prodotto ordinata, uguale nelle regole al resto.

**Goal:** PR1–PR2, PS1–PS4, PO1–PO2, ritocchi Traduzioni, PU1 fatti. PU2 solo dopo il fix di `getProductUsage` (T19).

**Cosa fare — elenco**
- **PR1 · Card compatte:** griglia auto-fill da 180 px (6 a 1280, 2 al telefono), foto 1:1, sotto nome e «prezzo · in N menù», numero di formati come etichetta sulla foto. Senza foto: segnaposto (Lucide `Image` 32 px `gray-400` + «Nessuna foto» su `hover-bg`). Mai iniziali colorate.
- **PR2 · Tabella:** colonne Prodotto · Prezzo · Menù; Prodotto = miniatura 36 (stessa regola) + nome + etichetta formati; Prezzo e Menù a destra, «da 3,00 €». Cambiano solo le colonne passate al componente.

**Scheda**
- **PS1:** salvataggio nella barra (T1).
- **PS2:** «Genera con AI» come T1.
- **PS3 · Riga traduzioni:** sotto la descrizione «Descrizione tradotta in inglese e tedesco», poi per lingua «manca il francese» / «in corso» / «non riuscita · Riprova» in `warning-700`; a destra «Apri Traduzioni →» (stile link) che apre la tab. Senza descrizione la riga non c'è. Dati: lingue attive − traduzioni con `source_hash` attuale − job in coda (`getActiveTenantLanguages`, `listTranslationsForEntity`, `getPendingJobLanguages`); dipende dalla PR #244 (stato `failed`).
- **PS4:** immagine a destra (300 px) con «Modifica» (lo stesso editor di oggi) e cestino sotto; «Nelle card in 4:3» al posto della frase sul punto focale; sotto 1024 px si impila. Allergeni, Ingredienti, Caratteristiche, Note, Abbinamenti vuoti: tutti come T1.

**Prezzi e opzioni**
- **PO1:** selettore «Prezzo unico / Prezzo per formato» nell'intestazione della sezione Prezzo. Prezzo unico: «4,50 €» grande + Modifica. Per formato: un elenco a righe con separatori, riga per aggiungere in fondo con «Aggiungi» secondario; sottotitolo «Nel menù si legge «da 6,00 €»». Telefono: selettore sotto il titolo a tutta larghezza. «In questa scheda ogni modifica si salva subito» va nella barra (T1).
- **PO2:** «Nuovo gruppo» e «Aggiungi variante» solo nell'intestazione, mai nel corpo; il riquadro informativo di Configurazioni diventa sottotitolo («Scelte che il cliente fa quando ordina: una misura, una cottura, aggiunte anche a pagamento.»). Telefono: «+ Nuovo».

**Traduzioni:** lingue in italiano («Italiano · sorgente», «Inglese», non «English»); la barra dice se la tab salva subito.

**Utilizzo**
- **PU1:** righe da 60 con separatore, freccia a destra, sfondo al passaggio; la riga intera porta al menù (aperto sulla categoria), alla regola, alla scheda della sede; tolto «Apri il menù».
- **PU2 (dopo T19):** sotto ogni regola tipo e sedi raggiunte, a destra lo stato con le parole di Programmazione, in cima quelle in esecuzione.

---

### T9 · Programmazione

**Obiettivo:** le regole al primo colpo, la simulazione a un clic.

**Goal:** PG1–PG4, RG1 (pattern T1), RG2 fatti; il componente sticky di oggi rimosso; test che confronta matrice e resolver aggiunto. **Playwright obbligatorio** (resolver).

**Cosa fare**
- **PG1 · Card «Adesso»** al posto della banda (non fissa, ~150 px): in alto «Adesso, 17:30», selettore sede, «Simula un altro momento»; sotto i cinque passaggi in fila (Menù e stile · Disponibilità · Prezzi · In evidenza · A mano) con esito e regola, uguali al simulatore. Evidenziato lo strato della tab aperta (in Tutte nessuno); «A mano» in ambra se ci sono modifiche. Uguale in tutte le tab, altezza costante. Sotto 1024 passaggi su 2 colonne; al telefono il passaggio della tab + «A mano», gli altri dietro «Altri 3 passaggi ▾» (in Tutte tutti e cinque), «Simula» a tutta larghezza.
- **PG2:** gruppi invariati; tolta la frase in fondo «Decidono quale menù… · Come funziona» (va nello stato vuoto e in «Come funziona» del simulatore).
- **PG3 · Ordine tab:** Tutte · Menù e stile · Disponibilità · Prezzi · In evidenza.
- **PG4 · Un solo simulatore:** pannello laterale 720 aperto da «Simula un altro momento»: sede, giorno, ora; risultato come passaggi numerati con esito e regola; con «Tutte le sedi» la matrice di oggi. «Nuova regola» diventa un bottone semplice (via il «Simula regole» nascosto nella freccia). Telefono a schermo intero. Motore: `buildScheduleMatrix` con giorno e ora scelti (mostra le modifiche a mano); **aggiungi un test** che metta matrice e `resolveRulesForActivity` sugli stessi dati. «Apri la pagina pubblica a quest'ora» non si aggiunge.
- **Dentro una regola — RG1:** «Alcune sedi» → «Sedi specifiche»; scelta con il pattern T1 (chip + «Modifica sedi» + pannello laterale con ricerca, «Seleziona tutte», caselle, pillola «Sospesa»). Stesso per «Gruppi di sedi».
- **RG2 · Quando:** modello di oggi: «Sempre attiva» accanto al titolo, acceso di default; spento compaiono In un periodo · In certe ore · In certi giorni come righe con interruttore (T1). Barra: stato della regola e sedi a sinistra, salvataggio a destra.

---

### T9b · Programmazione con più sedi: azienda e sede (PG5–PG7, decise il 7/10)

**Obiettivo:** con 2+ sedi un solo modo di scegliere la sede (l'header), le regole gestite nell'azienda, ogni sede vista da dentro.

**Goal:** nessun selettore di sede dentro Programmazione d'azienda; voce Programmazione nella sidebar della sede; il permesso di modifica rispettato regola per regola nell'interfaccia; e2e aggiornati. Con una sede sola nulla cambia. **Playwright obbligatorio** (resolver/simulatore). Fai T9 prima di questo.

**Cosa fare**
- **PG5 · Azienda:** via il filtro «Tutte le sedi» sotto le tab (`?sede=`, `Programming.tsx:314-322, 863`) e il selettore nella card. La card «Adesso» è una riga sola, alta uguale con qualsiasi numero di sedi: «Adesso · N sedi senza problemi» e, come chip ambra, solo le sedi da guardare (nessun menù attivo, modifiche a mano, sospese; max 2 poi «+N»); il chip porta a Programmazione della sede. Se va tutto bene: «Adesso · tutte le N sedi senza problemi», senza chip. A destra «Vedi tutte le N sedi» apre il pannello unico (il simulatore di PG4, `RuleSimulatorDrawer`) titolato «Cosa vedono i clienti», fermo su adesso:
  - una riga per sede con i cinque passaggi (`buildScheduleMatrix`, già pronto: `RuleSimulatorDrawer.tsx:113-126, 196-204`), ricerca per sede, prima quelle da guardare;
  - «Simula un altro momento» non apre un secondo pannello: in testa al pannello compaiono Giorno e Ora e «Torna ad adesso»; la tabella si ricalcola; sotto, la riga «Sospensioni e abbonamento sono quelli di oggi»;
  - toccando una sede il pannello mostra i suoi cinque passaggi allo stesso momento, con «← Tutte le sedi» e «Vai alla programmazione di <sede> →»;
  - l'elenco delle sedi è limitato a quelle con `scheduling.read` (oggi mostra tutte le activities).
  - Telefono: la card su due righe (frase sopra; un chip + «+N» e «Vedi tutte» a tutta larghezza sotto), pannello a schermo intero.
- «Dove si applica» sempre visibile nell'elenco; se in una sede vince un'altra regola, una riga ambra sotto il nome («A Baranzate vince "Test - Baranzate"»).
- **PG6 · Sede:** nuova voce `level: "sede"` in `navModel.ts` (`NAV_MODELS.sede`, gruppo Il locale, dopo «Cosa vedono i clienti»), gate `{ on: "activity", permission: "scheduling.read" }` (staff non la vede); rotta di sede in `App.tsx` come Analitiche/Recensioni; `Programming.tsx` prende la sede da `useParams` (come `AnalyticsPage.tsx:88`) con precedenza su `?sede=`, selettore nascosto. Card «Adesso» di una sede (come con una sede sola), elenco delle sole regole che raggiungono la sede, «Nuova regola» con la sede già scelta. Il link in `ActivityCosaVedonoRoute.tsx:131` punta alla rotta di sede. **Supera §51.11**: aggiorna `navigazione.spec.ts:640-672`, `sede-nav.spec.ts:157-167`, `programmazione.spec.ts:81-87`, `navModel.test.ts:108`.
- **PG7 · Regola aperta dalla sede:** rotta di sede per il dettaglio regola (stesso componente), così header e «←» restano sulla sede. Se la regola vale per altre sedi la barra lo dice: «Vale per Garbagnate e anche per Comasina: se la cambi, cambia in entrambe» con «Modifica sedi».
- **Permesso per regola (interfaccia):** sostituisci `canWrite = canDoOnAnyActivity` (`Programming.tsx:219`, `RuleDetailPage.tsx:64`) con un controllo per regola che rispecchia `can_write_schedule` (tutti i target tra le sedi scrivibili e non apply_to_all, salvo owner/admin). Chi non può: regola in sola lettura, niente interruttore né Salva, riga «La modifica chi gestisce tutte le sedi coinvolte». Un manager non vede l'opzione «Tutte le sedi» quando crea una regola.
- Documenti: `docs/routes.md`, `docs/permissions-matrix.md:179`; CLAUDE.md («otto voci») solo come diff proposto.
- **Fuori da questo task:** i buchi RLS trovati (Allegato D, «Programmazione · permessi») vanno nella PR di sicurezza separata, prima di questo task se possibile.

---

### T10 · Stili

**Obiettivo:** elenco più denso, editor più pulito.

**Goal:** ST2–ST4 fatti (ST1 è in T1). **Playwright obbligatorio** per ST4 (Styles Editor).

**Cosa fare**
- **ST2:** griglia auto-fill 260 (4 a 1280, 2 sotto 768, 1 al telefono); anteprima alta 140; ordine: attivi adesso, poi per nome.
- **ST3:** resta la riga di testo sull'uso; pillola solo «Attivo adesso»; «Di sistema» diventa testo («Di sistema · in nessuna regola»).
- **ST4 · Editor:** non si tocca, salvo il riquadro grigio di sfondo (palco puntinato): anteprima e pannello poggiano sul fondo della pagina; il pannello tiene bordo e ombra standard della card. Verifica a 1280 e 1440, mobile e desktop.

---

### T11 · In evidenza

**Obiettivo:** elenco leggibile e un contenuto che si compone in una pagina sola.

**Goal:** EV1–EV8 fatti.

**Cosa fare**
- **EV1:** filtri a sinistra (Tutti · In nessuna regola, neutro come «Senza prezzo» in Prodotti); ricerca, vista e «Crea contenuto» a destra.
- **EV2:** griglia da 260 (4/2/1); immagine 16:10, senza immagine il segnaposto dei Prodotti («Nessuna immagine»); corpo ad altezza fissa: nome su una riga, testo per i clienti su una riga con puntini, in fondo tipo e uso. Ordine: attivi adesso.
- **EV3:** l'uso diventa «Evento · in 2 regole»; pillola solo «Attivo adesso»; il tipo è testo.
- **EV4 · Tipo alla creazione:** pannello «Che cosa vuoi mettere in evidenza?» con quattro schede (disegno schematico nei colori del gestionale, frase vera, «con / senza prodotti»): Annuncio (novità o avviso, senza prodotti), Evento (come l'annuncio, con l'etichetta «Evento»), Promo (prodotti con prezzo e nota), Bundle (prezzo unico anche sulla card, totale barrato). Sostituisce il selettore a tutta riga.
- **EV5:** dentro il contenuto il tipo è una riga in cima con «Cambia tipo» (riapre il pannello; avvisa se i prodotti verranno tolti).
- **EV6:** testi e immagine affiancati come PS4; nessuna anteprima con lo stile.
- **EV7:** per Promo e Bundle i prodotti in una sezione sotto i testi (miniatura, prezzo, nota, trascina, «Aggiungi» nell'intestazione); in cima le opzioni oggi nella card Tipo come righe con interruttore (immagini prodotti; Bundle: prezzo e totale barrato). Niente più tab che compare e scompare; sparisce «Prezzi: nessun prezzo».
- **EV8:** «Dove e quando compare» diventa la tab Utilizzo come nel prodotto (righe cliccabili, stato con le parole di Programmazione). Tab: Contenuto · Utilizzo.

---

### T12 · Storie

**Obiettivo:** introduzione compatta e una storia che dice chiaramente dove si vede.

**Goal:** SR2, SD1, SD2 (con i dati di oggi) fatti; editor a blocchi invariato.

**Cosa fare**
- **SR2:** «Il cappello» → «Introduzione»; sottotitolo «Il testo che i clienti leggono prima delle storie. Vale per tutte le sedi.»; corpo: foto 16:9 da 224 px a sinistra, titolo, testo su tre righe con puntini, sito a destra (~210 px). Senza introduzione «Nessuna introduzione · Aggiungi». Telefono: foto sopra. Nel pannello «Sostituisci / Rimuovi» come A2.
- **SD1:** occhiello e titolo a sinistra, copertina 300 px a destra con «Modifica» e cestino sotto.
- **SD2 · «Dove si vede»:** una card a righe. Riga «Pagina pubblica»: Tutte le sedi / Una sede; la sede come chip + «Modifica» (pannello a scelta singola, pattern T1). Riga «Scheda di un prodotto»: chip del prodotto con × per scollegare e «Cambia» (pannello con la tabella prodotti di oggi); senza prodotto «+ Collega un prodotto». Sotto 768 px le righe si impilano. **Il modello dati non cambia** (una sede, un prodotto): la versione multipla è nei Rinviati.
- Pannello «Crea storia»: ordine Occhiello, Titolo.

---

### T13 · Lingue

**Goal:** la frase sotto l'header sparisce (T1) e «i contenuti esistenti vengono tradotti in pochi minuti» va nella riga di riepilogo. Nient'altro.

---

### T14 · Operatività: Servizio, Prenotazioni, Comande

**Obiettivo:** la sala e le richieste si leggono al primo schermo.

**Goal:** SV1, SV2, PN1–PN3 fatti; Comande e Storico invariati salvo il ritocco della barra.

**Cosa fare — Servizio**
- **SV1:** una pagina «Servizio» con la scelta di vista «Elenco / Mappa» nella barra (oggi `?modo=`; i due componenti restano). Riga «Oggi» comune alle due viste, una riga sola, con «N richieste da gestire →» verso Prenotazioni (il conteggio è quello allineato in T19). «+ Senza prenotazione» a destra nella barra. «Gestisci la sala» esce (va in T5).
- **SV2 · Mappa:** ogni tavolo disegnato da `seats` (2 quadrato piccolo, 4 quadrato, 6+ rettangolo, sedie intorno), raggruppato per zona; stato = colore del tavolo (libero bianco, aperto verde, servizio precedente grigio, fuori servizio tratteggiato), ambra solo per i conflitti. «da 390 h 53 min» → «Aperta da un servizio precedente». Nessun dato nuovo.

**Prenotazioni**
- **PN1:** una pagina sola (niente tab). Barra: a sinistra Giorni/Settimana e le date; a destra ricerca, canali, «Nuova prenotazione». L'agenda arriva al primo schermo.
- **PN2:** il riquadro «Oggi» diventa una frase nell'intestazione della card «Richieste da gestire». Richieste valide: righe con Rifiuta / Conferma («Conferma» esiste già, stesso gesto differito con «Annulla»; stile secondario indigo chiaro). Scadute (pending con data < oggi): una riga chiusa «N scadute · richieste per date già passate, mai gestite · Mostra ▾», aperte mostrano solo «Rifiuta». Senza richieste la card sparisce. Il numero nell'intestazione conta tutte le pending, scadute comprese (come Sedi).
- **PN3:** la frase in fondo «Include le prenotazioni online…» va nello stato vuoto dell'agenda.

**Comande:** «Tutti i tavoli» sale nella barra della pagina, a sinistra. Kanban invariato. Storico invariato.

---

### T15 · Andamento: Analitiche, Recensioni, Clienti

**Goal:** AN1, AN2, RC4–RC6, ritocco Clienti fatti.

**Cosa fare**
- **AN1:** via «Cosa fanno i clienti sulla pagina pubblica»; barra: periodi a sinistra, «Esporta Excel» a destra.
- **AN2:** il primo blocco prende il titolo «Pagina pubblica». Numeri chiave in una riga per sezione: Pagina pubblica (Visite · Eventi per visita · Visite con un'aggiunta; la frase su cosa conta come visita nel sottotitolo della card), Ordini (Ordini · Ricavi · Valore medio · Tasso di annullamento), Prenotazioni (Prenotazioni · Coperti · Confermate · Online / a mano). Grafici ed export invariati.
- **Recensioni (dopo R1, PR #266):** RC4 via la frase sotto l'header (quella aggiunta in R1 si sposta, vedi RC5); barra con il conteggio del periodo a sinistra, ricerca · stelle (tendina) · periodo · ordine a destra. RC5 «Riepilogo dei voti» compatto (media grande + distribuzione a tinta unica) con sottotitolo: «Feedback privati dei clienti: li vedi solo tu e il tuo team, non compaiono sulla pagina pubblica. Chi dà 4 o 5 stelle viene invitato a recensirvi su Google.» RC6 elenco a righe: stelle e data in colonna fissa a sinistra, commento a tutta larghezza («Nessun commento» in corsivo grigio), «Elimina» nel menu ⋯ solo con `reviews.delete`; al telefono stelle e data sopra il commento.
- **Clienti:** telefono formattato a gruppi («+39 333 000 0051»), solo in visualizzazione.

---

### T16 · Impostazioni

**Goal:** IM1–IM4 fatti; bottoni del logo invariati (task a parte di Lorenzo).

**Cosa fare**
- **IM1:** tab Azienda / Team / Abbonamento a sinistra nella barra della pagina, stessa altezza nelle tre; a destra l'azione della tab: salvataggio in Azienda, «Invita membro» in Team, niente in Abbonamento.
- **IM2:** card Azienda a righe di impostazione: Nome (campo), Settore (testo + «Scelto alla creazione. Per cambiarlo scrivi al supporto.»), Logo (miniatura con i controlli di oggi; «1:1» → «Quadrato» nella descrizione). La sezione Logo separata sparisce. Dati di fatturazione: card a parte, a righe. «Elimina l'azienda»: card a riga singola, titolo rosso; a chi non è proprietario niente bottone spento ma la frase «Solo il proprietario può eliminarla. Per andartene, chiedi di essere rimosso dal Team» (via il riquadro informativo).
- **IM3 · Team:** Membri / Inviti in attesa come SegmentedControl con conteggi a sinistra della toolbar; ricerca e ruoli a destra; «I posti pagati contano le sedi, non le persone: invitare non costa» nel piede della tabella.
- **IM4 · Abbonamento:** via la frase sotto l'header e il riquadro «Solo il proprietario può disdire…»: la frase va nella riga del Portale di fatturazione.

---

### T17 · Workspace

**Obiettivo:** il Workspace è una porta: bella, pensata per chi ha una sola attività.

**Goal:** WS1–WS4 e WS6 fatti; nessun dato nuovo (copertina = `activities.cover_image` già esistente); `WorkspaceLayout` senza sidebar (non si crea un layout nuovo); funzioni invariate (crea, ripristina, abbonamento, account).

**Cosa fare**
- **WS1:** colonna centrata 960, saluto grande («Buonasera, Lorenzo» con l'ora del giorno) su fondo sfumato indigo leggero. **1 attività:** card grande con la foto di copertina della sede in testa (220 px; senza foto una sfumatura), logo sovrapposto (96), nome, «settore · città · ruolo», 4 numeri (sedi, menù, prodotti, persone nel team — solo se il dato esiste già; altrimenti i 3 di oggi), abbonamento in fondo, «Entra →» unico primario. **2 attività:** due card con copertina (140), «Entra» secondario. **Da 3 in su:** griglia compatta (3 colonne). «+ Nuova attività» secondario accanto al saluto. In fondo «In eliminazione»: una riga tratteggiata per attività con data di eliminazione, data di cancellazione definitiva e «Ripristina»; con molte attività «N in eliminazione · Mostra». Via la frase sotto l'header. Il termine resta «Attività».
- **WS2:** abbonamento dentro la card (stato, piano, sedi usate, «Abbonamento» → Impostazioni › Abbonamento dell'attività). La voce Abbonamento del Workspace sparisce; il suo indirizzo reindirizza a `/workspace`.
- **WS3:** niente sidebar. Account dal menu dell'avatar (Account · Esci). «Impostazioni» → «Account»; il vecchio indirizzo reindirizza.
- **WS4 · Account:** colonna 720, una card: profilo in testa (foto, nome, email, «Modifica profilo»), righe Password («Cambia password») ed Esci (secondario, non più rosso), in fondo «Elimina account» con bottone rosso a contorno e testo «Viene eliminato dopo 30 giorni; fino ad allora puoi recuperarlo accedendo di nuovo.» (il recupero esiste: `recover-account`). «← Le tue attività» in cima. La foto usa il componente di oggi.
- **WS6 · Responsive:** sotto 640 colonna unica, margine 16, saluto 26 px; 1 attività: copertina 140, logo 64, numeri 2 per riga, «Entra» a tutta larghezza alto 48; 2 attività: copertina 84, «Entra» accanto al nome. Account: profilo centrato, «Modifica profilo» a tutta larghezza, righe tappabili alte 56. Tra 640 e 1024: colonna 640, numeri 2 per riga.
- Gating: solo `workspaceRole` (niente PermissionsProvider).

---

### T18 · Analisi WS5 (sola lettura)

**Obiettivo:** capire come saltare il Workspace quando l'utente ha una sola attività.

**Goal:** un breve documento con: flusso attuale dopo il login (già noto: `OtpRoute.tsx:36` → `/workspace`, `GuestRoute.tsx:29`, `/dashboard` + ultima attività in localStorage), proposta (con una sola attività leggibile → `/business/:id`; Workspace raggiungibile dal logo/avatar), punti da toccare, rischi (deep link `from` perso, ruoli scoped, attività in eliminazione). **Nessuna modifica.**

---

### T19 · Lotto bug (PR separate da `origin/staging`)

Ognuno in un ramo e una PR propri, con test prima del fix. Elenco e dettagli nell'Allegato D. Priorità: 0) Programmazione · permessi (sicurezza); 1) conteggio «da gestire»; 2) Prenotazioni scadute confermabili (drawer + edge, `/security-review`); 3) «oggi» col fuso di Roma; 4) `getProductUsage` (abilita PU2); 5) variazione del tasso di annullamento in punti; 6) deep link perso al login; 7) e2e «Team a 1024»; 8) pulizia `SelectBusiness.tsx`. Già in PR: #244, #253, #263, #266 (da mergiare). `FeaturedBlock` showTitle/showCta è nel ramo `feat/public-featured-see-all` dell'altra chat: verifica prima di rifarlo.

---

## Allegato A · Regole di composizione (design system «CataloGlobe Back Office»)

Decise nel giro di correzioni sul back office (ottobre 2026). Valgono per ogni pagina: quando una pagina non le segue, è la pagina a essere sbagliata. Il dettaglio di ogni decisione sta nel documento «Correzioni di dettaglio — decisioni».

### Pagina

- **Nessuna descrizione sotto l'header.** Il nome della pagina viene dall'header; la spiegazione di un concetto sta nello stato vuoto (`EmptyState`), dove serve davvero.
- **Barra degli strumenti su una riga, tutta a destra**: ricerca, poi vista (griglia / elenco) e azioni, l'azione principale per ultima. A sinistra restano le tab o i filtri quando ci sono, altrimenti spazio vuoto: così la ricerca sta nello stesso punto in ogni pagina. Altezza `control-height`.
- **La barra della pagina** (sotto l'header) è uguale ovunque: a sinistra il contesto, a destra le azioni. Nelle liste il contesto sono le tab o i filtri (la ricerca sta a destra con le azioni); nelle pagine di dettaglio è lo stato dell'oggetto (es. «Attivo adesso in 2 sedi ▾», che apre un pannello sopra il contenuto senza spingerlo). Il salvataggio di una pagina che salva in blocco sta a destra: «✓ Salvato» oppure «N modifiche · Annulla · Salva». Al telefono va su due righe: contesto sopra, azioni sotto. Una tab che salva a ogni modifica lo dice lì, accanto a «✓ Salvato» («· in questa tab ogni modifica si salva subito»), non con una frase sopra il contenuto. **È l'unico posto del salvataggio**: niente barra fluttuante (`UnsavedChangesBar`) nelle pagine che salvano in blocco, con o senza tab. Al telefono i bottoni della barra sono alti 44. Niente card di riepilogo sopra il contenuto quando lo stesso può stare nella barra.
- **Fissa resta solo la barra della pagina.** Nessun altro blocco si appiccica in alto durante lo scorrimento.
- **Il contenuto di lavoro arriva al primo schermo.** Riepiloghi e simulazioni si comprimono in una card sopra (es. «Adesso» in Programmazione, ~150 px) e il dettaglio va in un pannello laterale.
- **Cose da gestire: nella stessa pagina o in una tab?** Dipende da cosa serve per decidere. Se per decidere serve vedere il resto, la coda sta in una card sopra il resto, nella stessa pagina (Prenotazioni: per confermare una richiesta guardi l'agenda e i posti). Se invece coda e resto sono la stessa lista divisa per stato e per decidere non serve il resto, lo stato è la tab (Recensioni: Da gestire · Pubblicate · Nascoste). In entrambi i casi le cose da gestire si vedono per prime col loro numero, e le azioni di riga sono secondarie (la conferma in indigo chiaro).
- **Un solo bottone primario per schermata.** Checklist, liste e card usano bottoni secondari.
- **Azioni AI** («Genera con AI», «Importa con AI»): bottone secondario con l'icona scintilla (`Sparkles`) in `brand-primary`. Riconoscibili senza competere col primario.
- **Nessun doppio contenitore**: niente riquadro colorato dentro una card. Uno stato è una pillola accanto al titolo.

### Sezioni (Card / SectionCard)

- **Le azioni della sezione stanno nell'intestazione**, al massimo due. Più varianti della stessa azione diventano un menu (es. «Scarica ▾» con PNG e SVG). Mai ripetute nel corpo quando la sezione è vuota: il vuoto è una riga di testo.
- **Un selettore che cambia il modo della sezione** (es. «Prezzo unico / Prezzo per formato») sta nell'intestazione accanto al titolo, non nel corpo. Al telefono va sotto il titolo a tutta larghezza.
- **Scegliere più elementi da un elenco che può crescere** (sedi, gruppi, prodotti): in pagina le scelte fatte come chip (oltre 8: le prime 8 e «+N altri») e un bottone «Modifica …»; la scelta si fa in un pannello laterale con ricerca, «Seleziona tutte» e caselle (per i prodotti anche miniatura, prezzo e categoria). Regge 3 elementi come 300. Mai un elenco di caselle che si allunga nella pagina, mai una tendina per scelte multiple.
- **Interruttori a righe**: nome e una riga di descrizione a sinistra, interruttore a destra; i campi che dipendono dall'interruttore si aprono sotto la sua riga.
- **Niente riquadri informativi dentro una card**: la spiegazione va nel sottotitolo della sezione.
- **Una sezione con una sola azione è una card a riga singola**: titolo e frase a sinistra, bottone a destra. Sotto 768 px il bottone va sotto il testo.
- **Sezioni di impostazioni a righe**: una riga per impostazione, a sinistra nome (15/600) e una riga su cosa decide (`caption`, colonna di 300 px), a destra il controllo; separatore 1px `border` fra le righe; padding `space-24`. Sotto 768 px le due colonne si impilano.
- **Sezioni vuote tutte uguali**: titolo, «Aggiungi» (secondario) nell'intestazione e una riga di testo; la frase che spiega la sezione va in quella riga. Mai uno stato vuoto centrato e alto dentro una sezione di una scheda.
- **Immagine dentro una sezione con altri campi**: colonna destra (300 px) con le azioni sotto l'immagine, accanto a ciò che toccano; sotto 1024 px si impila e le azioni vanno a tutta larghezza.

### Liste e tabelle

- **La tabella scorre con la pagina**, mai dentro una scatola a scorrimento interno. 25 righe per pagina di default; righe a `row-height` (56).
- **Ogni numero compare una volta sola**: se i conteggi stanno nei filtri, non si ripetono in un riepilogo sopra la tabella.
- **Uno stato si sceglie con le parole**: `SegmentedControl` con etichette, mai tre icone spiegate da un tooltip.
- **Card in griglia allineate**: il piede ha altezza fissa, uguale in tutte le card; avvisi e conteggi variabili vanno nel corpo.
- **Ogni sezione ha il suo motivo nelle card.** Le card in griglia hanno in cima un'area illustrata (128 px, fondo `hover-bg`) con un motivo riconoscibile della sezione, uguale per tutti gli elementi ma che segue i dati veri dove può. Mai i colori dello stile di un locale: l'indigo resta il segno del prodotto. La vista elenco resta solo dati.
  - **Menù**: un foglio di menù disegnato — titolo indigo, categorie, voci con i puntini fino al prezzo. Le categorie disegnate seguono quelle vere (fino a 3); un menù vuoto ha il foglio vuoto.
  - **Stili**: il campione dei colori dello stile (`StyleSwatch`) — è l'unica sezione dove il campione ha senso, perché lo stile è l'oggetto stesso.
  - **Prodotti**: la foto vera, quadrata (1:1), in card compatte (griglia auto-fill da 180 px). Senza foto, il segnaposto classico: icona immagine (Lucide `Image`, 32 px, `gray-400`) e «Nessuna foto» su `hover-bg` — dice cosa manca invece di decorare. Mai iniziali colorate. In tabella la stessa regola in miniatura (36 px).
  - **In evidenza**: l'immagine vera del contenuto (16:10); senza immagine il segnaposto dei Prodotti («Nessuna immagine»).
  - **Storie**: la foto di copertina della storia; l'«Introduzione» è una card bassa con la foto 16:9 a sinistra.
- **Le pillole sono stati, non nomi.** Il nome di un menù o di un oggetto è testo; la pillola compare solo per uno stato (e per i problemi: ambra «Nessun menù attivo», neutra «Sospesa»).

### Numeri e grafici

- **I numeri chiave stanno in una riga di card uguali** in cima alla loro sezione (fino a 4; al telefono 2 per riga). Mai una card numero da sola su una riga, mai 2×2 quando entrano in una riga.
- **Ogni blocco di una pagina di analisi ha un titolo di sezione** (es. «Pagina pubblica», «Ordini al tavolo», «Prenotazioni»), anche il primo.
- **Il colore della variazione segue il significato, non il segno**: verde quando migliora, rosso quando peggiora. Un aumento degli annullamenti è rosso.

### Colore degli stati

- **«Sospesa» è neutra** (`hover-bg` + `gray-800`, puntino `gray-400`) ovunque: sospendere è una scelta, non un guasto. Il rosso resta per ciò che è rotto o irreversibile.
- Un avviso che chiede attenzione (compilato ma nascosto, conteggio in attesa > 0) è testo `warning-700`, con icona se sta da solo.

### Workspace

- **Il Workspace è una porta**: si progetta per chi ha una sola attività (quasi tutti). Niente sidebar; colonna centrata; saluto grande; card dell'attività con la foto di copertina della sede, logo, numeri e abbonamento; «Entra» unico primario. Da 3 attività in su la griglia compatta. L'account si apre dal menu dell'avatar. Qui, e solo qui, si spinge sull'estetica.

### Funzioni del piano Pro

- Nel piano Base le voci restano **visibili con il lucchetto**. Dentro, un solo pannello: cosa fa la funzione, «Passa a Pro» (primario) e «Confronta i piani»; chi non gestisce l'abbonamento legge «Chiedi al proprietario di passare a Pro». Mai un form disabilitato.

### Navigazione

- Header: azienda e sede sono segmenti dello stesso percorso, senza bordo a riposo; al passaggio e a menu aperto `hover-bg`.
- Sidebar: quando le voci superano l'altezza, una sfumatura in basso (e in alto dopo lo scorrimento) dice che c'è altro; all'apertura la voce attiva viene portata in vista.

- **Icone della sidebar:** un'icona per concetto; due della stessa famiglia solo se il segno dentro le distingue a colpo d'occhio e stanno in gruppi diversi (Programmazione `CalendarClock` in Catalogo, Prenotazioni `CalendarDays` in Operatività), mai due uguali o quasi (due libri, due griglie); lo stesso oggetto ha la stessa icona ovunque (Sedi = `Store`, come nel selettore dell'header). `Sparkles` è riservata all'AI. Tutte Lucide a 20 px.

### Testi e formati

- Prezzi in formato italiano: «2,90 €».
- Un link nel testo ha lo stile normale del link (peso 500, colore `brand-primary-hover`), mai ingrandito o sottolineato in grassetto.
- Nei testi dell'interfaccia non entrano ragionamenti di progetto («è una cosa che si produce, non una che si configura»): si dice all'utente cosa fa il controllo.

## Allegato B · Icone (Lucide, 20 px)

| Voce | Icona | Note |
|---|---|---|
| Panoramica | `LayoutDashboard` | resta |
| Sedi | `Store` | come il selettore sede nell'header |
| Cosa vedono i clienti | `Eye` | resta |
| Menù | `Utensils` | come la barra pubblica |
| Prodotti | `ChefHat` | era `Archive` |
| Programmazione | `CalendarClock` | era `Calendar` |
| Stili | `Palette` | resta |
| In evidenza | `Megaphone` | era `Pin` |
| Storie | `ScrollText` | anche nella barra pubblica (era libro) |
| Lingue | `Languages` | resta |
| Servizio | `ConciergeBell` | era `LayoutGrid` |
| Prenotazioni | `CalendarDays` | era `CalendarCheck` |
| Comande | `ClipboardList` | resta |
| Storico | `History` | resta |
| Analitiche | `ChartColumn` | resta |
| Recensioni | `Star` | anche nella barra pubblica (era fumetto) |
| Clienti | `BookUser` | era scheda contatto |
| Impostazioni | `Settings` | resta |
| Assistenza | `LifeBuoy` | resta |

Barra inferiore della pagina pubblica: Menù `Utensils` · Storia `ScrollText` · Recensioni `Star` · Ordini (invariata). `Sparkles` solo per l'AI.

## Allegato C · Rinviati (non fare)

- Terminologia Menù / Menu / Catalogo e Azienda / Attività: task a parte.
- Introduzione delle Storie diversa per sede.
- Storie su più sedi e più prodotti (modello dati: `story_activities`, `story_products`, RLS, edge). La UI di T12 è già pronta.
- Piantina della sala (posizione, forma, rotazione dei tavoli).
- Recensioni: letto / non letto.
- Componente immagine / logo (bottoni cambia / rimuovi): task di Lorenzo.
- Recupero account: abbonamento che non torna dopo 30 giorni; email con link di recupero.
- «Apri la pagina pubblica a quest'ora» nel simulatore.
- WS5 implementazione (dopo T18).

## Allegato D · Lotto bug (dettagli)

- **«Da gestire» conta due cose diverse:** Servizio (`ReservationsTodayStrip.tsx:42`) conta solo le pending di ieri/oggi/domani, la card in Sedi (`countPendingReservationsByActivity`) tutte. Allineare a tutte le pending della sede, stesso conteggio nei due posti.
- **Prenotazioni · conferma di richieste scadute:** dal drawer si può (`ReservationDetailDrawer.tsx:523`, il ramo pending ignora `isInThePast`) e `respond-reservation` la accetta (probabile mail al cliente). Niente «Conferma» su date passate nel drawer e rifiuto lato edge. `/security-review`.
- **Prenotazioni · «oggi» col fuso del browser:** `todayIsoDate()` (`utils/dateLocal.ts:15`) usa l'ora locale del dispositivo; la soglia va calcolata in Europe/Rome (o fuso della sede). Il confine resta il giorno, non l'ora (scelta di Lorenzo).
- **Utilizzo del prodotto:** `getProductUsage` (`productUsage.ts:45`) elenca solo le regole di menù, legge le sedi da `schedules.target_type/target_id` invece che da `schedule_targets`, non filtra per `tenant_id`. Riusare `listAppearanceSources` + `buildAppearance`, estesi alle regole `price` e `visibility` e al prodotto come soggetto.
- **Analitiche · tasso di annullamento:** variazione relativa e soglia `MIN_DELTA_BASE` (`periodComparison.ts:56,63`) pensate per i conteggi; per il tasso confronto in punti percentuali («+3 pt»), senza soglia.
- **Login · deep link perso:** `OtpRoute.tsx:36` manda su `/workspace` ignorando `from`.
- **e2e «Team a 1024»** (`e2e/testata.spec.ts:87`): cerca «Team» in sidebar, sparita con la nav v2.
- **Pulizia:** `src/pages/Onboarding/SelectBusiness.tsx` non è importato da nessuna parte.
- **Programmazione · permessi (sicurezza, priorità alta, PR separata + `/security-review`; conferma prima con una scrittura reale su staging):** (1) `schedule_layout`, `schedule_price_overrides`, `schedule_visibility_overrides` controllano solo `tenant_id IN get_my_tenant_ids()`: anche lo staff può scriverle via REST. (2) INSERT su `schedules` controlla solo `has_permission_any_activity('scheduling.write')`: un manager crea regole apply_to_all che poi non può modificare. (3) `update_schedule_targets` controlla solo i target nuovi: un manager può portare sulla sua sede una regola di altre sedi e poi modificarla. (4) L'UPDATE rifiutato da RLS tocca 0 righe senza errore: il service deve trattarlo come errore (come `deleteReview`). Migration nuove, file prima e conferma di Lorenzo.
- **Noto, nessun intervento ora:** Recensioni pannello vs Analitiche (righe DB contro eventi client) possono dare numeri diversi.
