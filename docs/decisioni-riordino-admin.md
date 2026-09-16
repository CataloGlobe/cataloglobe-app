# Decisioni — riordino del pannello admin

**Fase 2 · aggiornato al 13/09/2026.** Base fattuale: `Claude outputs/audit-ui-ux-admin.md` (fase 1).
Le decisioni qui sono prese e non si ridiscutono senza un motivo nuovo. Quello che resta aperto è elencato in fondo, dichiarato come aperto.

---

## 1. I due cambiamenti di struttura

**D1 · La sede è un contesto in cui si entra, non un filtro che si applica.**
Entrando in un locale la sidebar diventa la sua. Il contesto sede **esiste sempre**: con una sede sola ci si atterra dentro per default e il livello azienda resta raggiungibile, così aggiungere la seconda sede non riorganizza la navigazione sotto le mani del cliente.

*Perché:* oggi la sidebar è azienda-scope ma metà del contenuto è sede-scope, e il selettore di sede in navbar compare su 5 route su 18. Le cose di una sede vivono a due indirizzi diversi — alcune come pagine azienda filtrate (Ordini, Prenotazioni, Analitiche, Recensioni), altre come tab dentro `/locations/:id` (Orari, Sala, Disponibilità, canali, QR). Da qui i prerequisiti sparsi e le funzioni duplicate.

**D2 · La Programmazione resta azienda-scope. Nella sede c'è la lettura, non un secondo editor.**
La Programmazione è il punto unico da cui si governa cosa si vede, quando e per quale sede — è stata progettata così e resta così. Dentro la sede c'è una pagina di sola lettura che dice cosa è programmato e cosa il cliente sta vedendo. L'azione correttiva apre **l'editor in Programmazione con la sede già impostata come target**: un indirizzo per la funzione, due ingressi, e l'ingresso porta con sé il contesto.

*Perché:* una regola può targetizzare più sedi o un gruppo, quindi non appartiene a nessuna sede in particolare; duplicare l'editor violerebbe «una funzione, un indirizzo».

---

## 2. La regola dei tre strumenti

| Strumento | Quando | Casi in CataloGlobe |
|---|---|---|
| **Contesto** (la sidebar cambia) | Solo per uno *scope*: un perimetro che contiene altre entità, dentro cui si resta, e che il sistema dei permessi riconosce come confine | **Due, e non se ne aggiungono: azienda e sede** |
| **Tab** (dentro la pagina) | Per le facce di uno stesso record, che si salvano insieme | Prodotto, contenuto in evidenza, regola, storia |
| **Indice laterale** (dentro il contenuto) | Per le gerarchie | Categorie di un catalogo (l'albero esistente) |

**Il test:** *posso restarci dentro un'ora facendo cose diverse fra loro?* → contesto. *Sono viste della stessa cosa, con un solo Salva?* → tab. *È un albero?* → indice.

**L'argomento decisivo:** la sede è l'unico sotto-oggetto che è anche un confine di permessi (`has_permission(perm, activity_id)`, `tenant_membership_activities`, i ruoli manager/staff/viewer esistono solo legati a una sede). Nessun altro oggetto lo è, quindi nessun altro è candidato a diventare un contesto. E il contesto funziona *perché* è l'eccezione: se cambiasse anche entrando in un prodotto o in un catalogo, la sidebar diventerebbe imprevedibile.

---

## 3. Regole trasversali

**R1 · Una funzione, un solo indirizzo.** Oggi Disponibilità sta in due posti (drawer dalla card sede + tab nel dettaglio), i Tavoli in due (tab Sala + tab Tavoli di Ordini), la visibilità prodotto in tre.

**R2 · Una sola fonte per il titolo di pagina.** Oggi ce ne sono tre e divergono: sidebar, `ROUTE_LABELS` (breadcrumb, l'unica renderizzata) e `PAGE_TITLES` (`<title>`). Il `title` che 18 pagine passano a `usePageHeader` **non viene renderizzato affatto**. Tre pagine — Storie, Clienti, Assistenza — non hanno nessun titolo in nessun punto della UI.

**R3 · Un dizionario unico.** Un nome per concetto, deciso una volta. **Chiuso — vedi §10.**

**R4 · Il mobile è un criterio di decisione, non una passata finale.** Ogni scelta di struttura si valuta anche a 375px: sette tab in una pagina e diciotto voci in una sidebar sono decisioni che il telefono boccia a prescindere dal CSS.

---

## 4. Il criterio di collocazione dentro la sede

Non la frequenza d'uso, ma: **«mi serve mentre il servizio è in corso?»**

È quello che decide se una cosa deve stare a due click dal kanban. Regole di accettazione delle prenotazioni, orari, chiusure → no: nessuno cambia il ritmo mentre le comande arrivano. Quindi anagrafica.

---

## 5. La struttura risultante

**Contesto azienda**

```
Panoramica
— Sedi —            Sedi                    ← porta d'ingresso al contesto sede
— Catalogo —        Menù · Prodotti · Stili · In evidenza · Storie
— Confronto —       Programmazione · Analitiche · Recensioni · Clienti
— Sistema —         Team · Abbonamento · Impostazioni · Assistenza
```

**Contesto sede** — `McDonald's – Garbagnate`

```
← Tutte le sedi (o ← Azienda con una sede sola)
Comande             il kanban, pagina intera
Tavoli              stato della sala adesso
Prenotazioni        agenda del giorno
Disponibilità       cosa è finito stasera
Cosa vede il cliente  cosa è attivo e perché · nuova
Scheda              chi è questo locale
— Di questa sede —  Analitiche · Recensioni
```

I nomi dei gruppi di sidebar **si vedono**: oggi esistono in `buildGroups` ma finiscono solo nell'`aria-label`, quindi l'unica gerarchia che la sidebar ha è invisibile a chi vede.

---

## 6. Migrazione — le 18 voci di oggi

| Voce | Livello reale | Dove va | Su cosa lo diciamo |
|---|---|---|---|
| Panoramica | azienda | resta (progettata per ultima) | è la somma delle risposte degli altri livelli |
| Sedi | azienda | resta, diventa la porta del contesto sede | con più di una sede è l'unico punto da cui si sceglie un locale |
| Ordini | **sede** | sede → Comande + Tavoli + *(storico: aperto)* | unica route che vieta «tutte le sedi», senza spiegare perché |
| Prenotazioni | **sede** + confronto | agenda nella sede; inbox cross-sede: aperto | «tutte» ammesso su «Da gestire», rifiutato sull'Agenda |
| Programmazione | azienda | resta — vista d'insieme e governo (D2) | il target di una regola è sempre una sede o un gruppo |
| Menù | azienda | resta | un catalogo è riusabile su più sedi |
| Prodotti | azienda | resta, assorbe gruppi, attributi e ingredienti | sono già tab senza pagina; «Attributi» è perfino irraggiungibile nel verticale attivo |
| Contenuti in evidenza | azienda | resta come «In evidenza» | il contenuto è riusabile, solo la programmazione è per sede |
| Storie | azienda | resta | nessuna dipendenza dalla sede |
| Stili | azienda | resta | riusabile su più regole e sedi |
| Lingue | impostazione | scende in Impostazioni | non ha un permesso proprio: gated su `catalogs.read` come proxy |
| Analitiche | confronto | resta — è il posto naturale del «tutte le sedi» | già oggi ammette lo scope su tutte |
| Recensioni | confronto | resta | con scope «tutte» legge per sede e unisce |
| Clienti | confronto | resta, esce da «Insight» | la rubrica è di tutta l'azienda ma si consulta durante il servizio; il deep link arriva da Prenotazioni |
| Team | azienda | resta | i ruoli si assegnano sull'azienda |
| Abbonamento | azienda | resta | il piano conta le sedi ma è dell'azienda |
| Impostazioni | azienda | resta, assorbe Lingue | oggi è l'unica voce senza gating, e per tre ruoli su cinque porta a un muro |
| Assistenza | azienda | resta | nessuna dipendenza dalla sede |
| **Disponibilità** | **sede** | **nuova voce nella sidebar della sede** | oggi a tre click, in due posti, con tre icone senza etichetta |
| **Sala / Tavoli** | **sede** | config nella Scheda · vista live come voce «Tavoli» | oggi vive in due posti e nessuno dei due è una pagina |

---

## 7. Migrazione — le 7 tab della sede, blocco per blocco

Nessun blocco si perde. Undici destinazioni.

| Oggi | Blocco | Dove va |
|---|---|---|
| Profilo | Immagini (cover + galleria) | Scheda › Immagini |
| Profilo | Identità (nome, indirizzo, slug, presentazione) | Scheda › Identità |
| Profilo | Contatti (email, telefono, sito, Google Reviews) | Scheda › Contatti |
| Profilo | Social (Instagram, Facebook, WhatsApp) | Scheda › Social |
| Profilo | Configurazione sede (pagamenti, servizi, tariffe) | Scheda › Pagamenti e servizi |
| Orari | Orari di apertura | Scheda › Orari |
| Orari | Chiusure straordinarie | Scheda › Chiusure |
| Sala | Capienza, durata media, tavoli, zone, accostamenti, QR | Scheda › Sala *(configurazione)* |
| Sala | Vista live dello stato della sala | sede › **Tavoli** |
| Disponibilità | Tri-state prodotti e ingredienti | sede › **Disponibilità** |
| Disponibilità | Banner «catalogo attivo · regola» | sede › **Cosa vede il cliente** |
| Ordinazioni | Switch ordini QR + stampanti | Scheda › Canali |
| Prenotazioni | Switch, promemoria, email avvisi, email privacy | Scheda › Canali |
| Prenotazioni | Regole di accettazione | Scheda › Canali *(rimando da Prenotazioni)* |
| Impostazioni | Accesso pubblico (URL, QR, export PDF) | Scheda › Accesso pubblico |
| Impostazioni | Stato pubblicazione + elimina sede | Scheda › Stato e eliminazione |

La Scheda risulta in **11 blocchi, 30 campi, ~2600px** — circa 2,7 schermate con un indice laterale sticky. Verificato sul prototipo: regge senza sotto-tab.

**«Cosa vede il cliente» — la pagina nuova.** Quattro contenuti, di cui due oggi non esistono da nessuna parte:
1. cosa è attivo adesso (menù e stile) e **quale regola lo ha deciso**;
2. la giornata, come striscia oraria, per vedere le finestre senza leggere le regole;
3. **cosa è previsto e non è ancora attivo** — oggi nessuna schermata risponde a «cosa succederà»;
4. **cosa devia dal programmato** — gli override manuali di disponibilità, cioè programmato contro reale.

Assorbe il simulatore in lettura (oggi dietro la metà secondaria di uno split-button).

---

## 8. Cosa resta aperto

| Punto | Stato |
|---|---|
| Storico ordini: vista dentro Comande o voce propria | aperto |
| Inbox prenotazioni cross-sede: resta in azienda o si perde | aperto |
| Nome della pagina di lettura — proposta: «Cosa vede il cliente» | da confermare |
| Le Comande a schermo intero, senza la cornice admin, per il tablet al banco | aperto |
| Come la Programmazione diventa un vero punto di controllo (26 regole in lista piatta, verdetti senza percorso di risoluzione, priorità suggerita e non modificabile) | T2 |
| Panoramica | per ultima, per costruzione |
| Fondazioni dei componenti: una via sola per caricamento, salvataggio, conferme, stati vuoti, errori | in corso |

---

## 9. Come si verifica che non si è perso niente

L'inventario è l'audit di fase 1: ogni voce, tab, drawer ed empty state esistente è elencato lì. La verifica è una spunta su quelle righe contro le tabelle 6 e 7 di questo documento — non un giudizio a occhio.

Le uniche cose che spariscono sono quelle classificate come codice morto nell'appendice dell'audit (`PrioritySection`, `OrderRectifyDrawer`, `OrdersKpiBar`, `AnalyticsFilters`, `ui/Drawer`, `ui/Divider`, `SelectBusiness`, più le ~820 righe di `ProductForm` dietro `{false &&`), e vanno confermate una per una prima di toccarle.

---

## 10. Dizionario — deciso il 13/09/2026

Un nome per concetto. Le colonne «oggi» elencano le forme che convivono nel codice attuale.

| # | Concetto | Oggi | **Deciso** |
|---|---|---|---|
| 1 | L'azienda | azienda · attività · tenant (incluso «I tuoi tenant» in navbar) | **Azienda**. «Tenant» sparisce anche dai messaggi d'errore |
| 2 | Il locale | sede · attività (nella stessa scheda: «Nome sede» nel form, «Nome attività» in lettura) | **Sede**. Quindi «Sede pubblicata / Sede sospesa» |
| 3 | Il catalogo | *Menù* in sidebar, *Cataloghi* nel `<title>`, *Nome del Catalogo* nel form, «Elimina Menù» + «questo catalogo» nello stesso drawer | Regola, non parola: **in UI si usa sempre `catalogLabel`**; la parola «catalogo» hardcoded sparisce da ogni stringa utente |
| 4 | I prodotti | Prodotti · Piatti (4 azioni nel catalogo) | **Prodotti**. «Piatti» sparisce — è anche sbagliato per retail e hotel |
| 5 | L'ordine dal tavolo | Comanda e Ordine si alternano | **Comanda** |
| 6 | La programmazione | sezione *Programmazione*, stat *Programmi*, azione *Nuova programmazione*, oggetti *Regole* | sezione **Programmazione**, oggetto **Regola**. «Programmi»/«programmazioni» come cose numerabili sparisono |
| 7 | La disponibilità | Nascondi / Nascosto / Nascosti · Non disp. / Non disponibile / Nasconde — cinque combinazioni | tre stati sempre per intero: **Visibile · Nascosto · Non disponibile**. «Nascondi» solo come verbo di un'azione |
| 8 | I contenuti in evidenza | Contenuti in evidenza · In Evidenza · In evidenza · Highlights | **In evidenza**, una forma sola, `<title>` compreso |
| 9 | Le due posizioni | Prima/Dopo il catalogo (editor) · Sopra/Sotto il menù (guida) | **Sopra il menù · Sotto il menù** |
| 10 | L'indirizzo pubblico | campo *Indirizzo web*, sezione *URL pubblico*, errori che dicono *slug* | **Indirizzo web** in ogni punto; «slug» mai esposto. «URL pubblico» solo dove si mostra l'indirizzo completo da copiare |
| 11 | I ruoli | badge *Owner/Admin/Manager/Staff/Viewer*, prosa «proprietario», «amministratori» | **Proprietario · Amministratore · Manager · Staff · Sola lettura** |
| 12 | Il tipo di regola «Layout» | *Layout* — unica label non italiana della navigazione, e in CataloGlobe «layout» sono anche le impostazioni dello stile | **Menù e stile** |
| 13 | «Target» | sezione *Target*, colonna *Target*, *Nessun target*, *target globale* | **Dove si applica**. La parola «target» sparisce |
| 14 | «Gruppo» | copre cinque concetti, spesso con lo stesso bottone «Crea gruppo» | ne sopravvive uno: **Gruppo** = gruppo di prodotti. Gli altri: **Gruppo di sedi**, **Configurazione**, **Accostamento**, e il gruppo di sistema non si espone mai |

**Allineamenti meccanici** (non sono scelte, si applicano): i dodici accenti mancanti (`c'e'`, `piu'`, `e'`, `gia`, `puo`) e l'accordo «Questo è una variante»; il Title Case a macchia («Nuovo Prodotto», «Conferma Eliminazione», «Nome del Catalogo», «Aspetto Generale») → sentence case; `Analytics` → **Analitiche** nel `<title>`; `Abbonamenti` → **Abbonamento**; le cinque formule per «campo vuoto» nella stessa pagina → una sola; `Hero` rimosso (slot che non esiste più).

---

## 11. Fondazioni dei componenti — deciso il 13/09/2026

Una via sola per ogni cosa. Ogni pagina eredita queste regole invece di ridecidere.

| | Oggi | **Deciso** |
|---|---|---|
| **A · Caricamento** | dieci approcci: `LoadingState`, `AppLoader`, `Loader`, `Skeleton`, testo muted inline, testo in classe locale, `animate-spin` (Tailwind in un progetto senza Tailwind), `Loader2`+`.miniLoader`, `return null`, 9 `@keyframes spin` locali. La frase «Caricamento» in quattro punteggiature | **Skeleton** con la forma del contenuto per liste, tabelle e card. **Spinner dentro il bottone** per un'azione in corso. Vietati `return null`, «Caricamento…» come stato di pagina, `LoadingState`, `animate-spin`. `AppLoader` solo nei route guard |
| **B · Salvataggio** | cinque meccaniche, e in cinque pagine ne convivono più di una (la pagina prodotto ne ha tre) | Nei drawer: submit nel footer, si chiude al successo. Nelle pagine di dettaglio: **draft + unica azione Salva/Annulla nell'header**. Eccezione: i toggle che accendono un canale salvano subito. Spariscono la barra per-sezione e i footer sticky bespoke |
| **C · Conferma di eliminazione** | quattro meccanismi (drawer, modale centrata, `ConfirmDialog`, conferma inline nella riga), tre label di conferma, due capitalizzazioni, sei `.warningBox` diversi | Sempre il **drawer**, struttura fissa: cosa stai eliminando · cosa succede alle cose collegate coi numeri veri · bottone **Elimina**. Digitazione del nome solo per azienda e account |
| **D · Stati vuoti** | `EmptyState` in 39 file + 17 testi nudi con classe locale; cinque liste su nove non distinguono «vuoto» da «nessun risultato» | Sempre `EmptyState`, **sempre due varianti distinte**: *vuoto* (a cosa serve + CTA che crea) e *nessun risultato* (i filtri non trovano + azzera filtri). Titoli senza punto finale |
| **E · Errori** | tre canali usati a caso: `EmptyState title="Errore"`, `InlineBanner`, 405 toast. Il gate abbonamento copiato letteralmente 17 volte | **Toast** per l'esito di un'azione appena fatta · **`InlineBanner`** per una condizione persistente della pagina · **`EmptyState` mai** per gli errori. Formula unica: cosa è andato storto, cosa fare. I messaggi ricorrenti diventano costanti |
| **F · Larghezze drawer** | dodici valori distinti; `DrawerProvider` codifica tre taglie ed è usato da un componente solo | **Tre: 420 · 520 · 720.** Sopra i 720 non è un drawer, è una pagina |

**Token CSS — fatto (13/09).** `--brand-primary` allineato a `#6366f1`; chiusi i 234 riferimenti a custom property mai definite; famiglie nuove `--radius-xs/sm/md/lg`, `--shadow-sm/md/focus`, `--spacing-*` limitate ai valori già referenziati; gli alias verso token esistenti stanno in un blocco di compatibilità che si svuota a refactor di pagina. Nessun re-map dei consumer.

**Dark mode: fuori perimetro.** Non è una funzione del prodotto (frammenti sparsi, mai usata davvero). Non si verifica e non si progetta adesso: è un lavoro a sé, eventualmente durante il refactor.

**Font-size: nessun token di dimensione.** Il progetto ha già una scala in `_typography.scss` consumata da `Text` in 233 file; le 63 dimensioni hardcoded sono chi ha scavalcato `Text` e si sistemano passando a `Text`, pagina per pagina.

---

## 12. Comande — deciso il 13/09/2026

Prima pagina scesa nel dettaglio. Inventario di partenza verificato nel codice: `Orders.tsx` (3 tab Comande/Tavoli/Storico in una sola pagina), `OrdersKanban.tsx` (3 colonne), `OrderCard.tsx` (menù ⋯ a 7 voci), `historyColumns.tsx`, `OrdersKpiBar.tsx`.

| | Oggi | Deciso |
|---|---|---|
| Perimetro pagina | una pagina "Ordini" con 3 tab: Comande, Tavoli, Storico | tre pagine di sede distinte: **Comande**, **Storico**, **Tavoli** |
| Board | 3 colonne (Nuove · In lavorazione · Pronte) in un terzo di schermata quando convive con altro | 4 colonne a pagina intera: **Nuove · In lavorazione · Pronte · Servite (questo turno)** |
| Ripristino di una comanda chiusa per sbaglio | azione "Ripristina" dentro la tab Storico | nella quarta colonna, accanto all'errore: **Riapri** |
| Aggiornamento | bottone **Aggiorna** in header su una board realtime | via il bottone; indicatore **In tempo reale**, azionabile solo se la connessione cade |
| Menù ⋯ della card | 7 voci, di cui 3 varianti di "rimetti in…" | 5 voci: Vedi dettaglio · Stampa comanda · **Torna indietro** · Annulla un articolo · Annulla la comanda |
| Stampa | doppio ingresso: icona nel footer (solo Nuove) + voce nel menù | un solo ingresso, nel menù |
| Copy distruttivo | **Elimina comanda** (non elimina: porta in `cancelled`) | **Annulla la comanda**, in coppia con **Annulla un articolo** |
| Attribuzione staff/cliente | stessa icona `User` per entrambi, distinta solo da colore + `title` | parola: **Cliente** oppure il nome dell'operatore |
| Ritardo | `.late` rosso sul tempo oltre 10 min, soglia muta | banda ambra sulla card (**In attesa da N minuti**) + allarme in testa colonna |
| KPI | `OrdersKpiBar` (4 card) — componente presente ma **non più renderizzato** | riga di servizio sottile: tavoli occupati · più vecchia in attesa · filtro tavolo · suono |
| Mobile | le 3 colonne si impilano (`@media max-width:900px → 1fr`) | una coda per volta, switch a pillole con i conteggi in cima |

**Chiusa l'item aperto "dove vive lo storico ordini"**: pagina di sede propria. Motivo: dentro la board era una tab che si contendeva lo spazio con lo strumento che non si deve mai lasciare durante il servizio, e la sua unica azione urgente è stata spostata nella quarta colonna. Allo Storico resta la consultazione (giorni passati, storni, chi ha fatto cosa).

**Chiusa la domanda su Storna** (14/09/2026). Fatto decisivo nel codice: `TableDetailDrawer.tsx:878` → `canStorna = canManageTable && o.status === "delivered"`. Lo storno è possibile solo su un ordine già consegnato, e `delivered` è esattamente il momento in cui l'ordine esce dalla board. Quindi non sono due collocazioni della stessa azione, sono due operazioni separate dal momento della vendita:

- **prima della consegna** → l'articolo non è venduto: si corregge con **Annulla un articolo**, dal menù ⋯ della card. Nessun movimento di denaro.
- **dopo la consegna** → l'articolo è sul conto: si corregge con **Storna**, che genera un contro-ordine negativo (`is_rectification = true`, riga per riga via `rectify_order_atomic`). Il denaro si muove.

Storna resta quindi sul conto del tavolo. Tre conseguenze operative:

1. La distanza percepita non veniva dall'azione ma dal **conto**, sepolto in Ordini → Tavoli → dettaglio tavolo. Con **Tavoli** pagina di sede a sé, il conto è a due passi (card tavolo → dettaglio), e il problema si risolve senza spostare Storna.
2. La quarta colonna **Servite** contiene ordini `delivered`: il suo menù ⋯ può legittimamente offrire **Storna** oltre a **Riapri**. Non è una ricollocazione, è la stessa regola applicata a uno stato che ora è visibile sulla board.
3. **Copy da correggere**: `OrderCancelDrawer.tsx:87` consiglia «considera la rettifica» — parola che non esiste da nessuna parte nell'interfaccia. Deve dire «considera lo **storno** dal conto del tavolo», con il link al tavolo.

**Ancora aperto su queste due pagine**: se incasso e totali di giornata vivano nello Storico o in Analitiche.

**Da rimuovere quando si tocca il codice**: `OrdersKpiBar.tsx` + il suo `.module.scss` (nessun call site), `OrderRectifyDrawer.tsx` (dead code; `OrderRectifyForm` è invece vivo, usato da `TableDetailDrawer`). Il blocco di CLAUDE.md che descrive la KPI bar come visibile in Comande e Tavoli e il selettore sede `ActivitySelectorCombobox` in header è disallineato dal codice attuale (`useSedeScope`): va corretto nello stesso commit.

---

## 13. Tavoli e conto — deciso il 14/09/2026

Inventario verificato: `TablesManagement.tsx` (usato SOLO da `ActivityDetailPage.tsx:273`, tab `sala`), `TablesLiveView.tsx` (usato SOLO da `Orders.tsx:1032`, tab Tavoli), `TableDetailDrawer.tsx` (`width={560}`, con `view="storna"` interna), `TableCloseDrawer`, `TableZoneManagementDrawer`, `TableQrPreviewDrawer`, `TableRegenerateTokenDrawer`, `TableDeleteDrawer`.

| | Oggi | Deciso |
|---|---|---|
| Indirizzi dei tavoli | **due**: Sede → tab *Sala* (CRUD, zone, QR, capienza) e Ordini → tab *Tavoli* (sala dal vivo) | **uno**: pagina di sede **Tavoli**, con interruttore **Gestisci la sala** |
| Rappresentazione in gestione | `DataTable` — righe con colonna *Zona* (Tavolo · Zona · Posti · Min–Max · Accostamento · Assegnabile) | la **stessa griglia per zona** della vista live, resa editabile |
| Occupazione in gestione | le card mostrano lo stato live anche mentre si modifica | in gestione lo stato live non si mostra: non si modifica la sala in base a chi è seduto |
| "Capienza della sala" (coperti, durata media, modo conferma) | card dentro la tab *Sala*, visibile solo se `enable_reservations` | **si sposta in Prenotazioni**: sono impostazioni delle prenotazioni, non della sala |
| Il conto | `SystemDrawer width={560}` con sotto-navigazione interna (`view="storna"` + freccia indietro) | **pannello a piena altezza, 720** — lo storno sta in linea sulla riga, nessun router dentro un drawer |
| "Chiudi tavolo" | in **due** posti: menù della card live e footer del dettaglio | **solo** nel footer del conto, dove l'importo da pagare è sotto gli occhi, con la frase che dice cosa si chiude |
| "Libero" | verde acceso su tutte le card libere (lo stato più comune urla più di quello che conta) | neutro; l'enfasi resta su *Occupato* e sui flag |
| Flag cliente (Conto richiesto / Cameriere chiamato) | dentro il drawer | anche sulla card in griglia: si vedono attraversando la sala |

**Motivo del punto 1** (il più strutturale): stessi oggetti, due rappresentazioni, due indirizzi. Mappare un tavolo oggi significa uscire dalla pagina operativa, andare in Sede → Sala e tornare. Due viste dello stesso oggetto con affordance diverse sono una **modalità**, non due posti.

**Motivo del punto 5**: a 560px lo storno non ci stava, e invece di allargare il contenitore è stata inventata una navigazione interna al drawer. Un drawer con un router dentro è il segnale che l'oggetto è più grande del contenitore — regola F di §11: sopra i 720 è una pagina, e il conto è l'oggetto più denso del prodotto (ordini in corso + ordini del conto + righe + storni + netto + flusso di storno).

**Conseguenza sulla tab `sala` della sede**: svuotata. I tavoli vanno in *Tavoli*, capienza/durata/conferma in *Prenotazioni*. La tab sparisce, e le 7 tab della sede diventano 6 — da riverificare quando si arriva alla Scheda.
