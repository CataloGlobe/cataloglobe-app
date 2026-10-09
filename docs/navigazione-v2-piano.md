# Navigazione v2 — decisioni (§51) e piano di esecuzione

Stato: **approvato da Lorenzo il 03/10/2026**. Fonte delle decisioni: conversazione del 03/10 con Lorenzo + prototipi (navigazione, sidebar, header a 375px).
Base di partenza: `refactor/design-system` = staging = `367a1f6d` (dopo il lotto B-b, PR #206).

Questo documento è scritto per essere eseguito da Claude Code **dall'inizio alla fine senza dubbi a metà**. Tutto quello che serve sapere è qui; dove serve leggere il codice, il passo lo dice.

---

## Parte 1 — §51 Navigazione v2: le decisioni

§51 **supera**: D1 (§1, «il contesto sede esiste sempre»), la struttura di §5, i gruppi Ospiti/Ordini di §19.5, le voci Ordini/Prenotazioni d'azienda di §48.1 (i redirect restano), l'atterraggio «una sede leggibile → si entra nella sede» di §50.21.

### 51.1 La regola di collocazione
Dentro la sede va ciò i cui dati appartengono a **quella sede sola**. Fuori restano: ciò che si crea una volta e vale su più sedi (Catalogo, Programmazione, Pagina pubblica), ciò che è dell'azienda (Clienti, Impostazioni), e i totali di più sedi.

### 51.2 Una o più sedi
Si conta sulle **sedi che chi guarda può leggere** (`useSedeScope().readableActivities`), non sulle sedi dell'azienda.
- 1 sede leggibile → **sidebar unica** (51.3).
- 2+ sedi leggibili → **due contesti** (51.4).
- 0 sedi leggibili → sidebar d'azienda; con permesso di creare sedi, la voce Sedi porta a «Aggiungi la prima sede».

### 51.3 Una sede: sidebar unica
Un solo elenco, nessun contesto in cui entrare, **nessuna pagina Sedi**: `/locations` porta alla Scheda della sede. Eliminare la sede resta in Scheda › Pubblicazione (com'è oggi).

### 51.4 Più sedi: due contesti
- **Azienda**: Panoramica, Sedi, Catalogo, Pagina pubblica, Andamento (totali), Impostazioni.
- **Sede**: Il locale, Operatività, Andamento della sede. In testa alla sidebar solo «← Tutte le sedi» (niente nome né stato della sede: stanno nell'header).
Passando da 1 a 2 sedi entrano nella sede Il locale, Operatività e la parte di sede di Andamento, e compare la voce Sedi; tutto il resto resta dov'era. Nessun avviso dedicato.

### 51.5 Gruppi e ordine (segue il percorso dell'utente)
**Sidebar unica (1 sede)** — 18 voci (16 nei gruppi, 2 nel piede):
| Gruppo | Voci |
|---|---|
| — | Panoramica |
| Il locale | Scheda · Cosa vedono i clienti |
| Catalogo | Menù · Prodotti · Programmazione |
| Pagina pubblica | Stili · In evidenza · Storie · Lingue |
| Operatività | Servizio · Prenotazioni · Comande · Storico |
| Andamento | Analitiche · Recensioni · Clienti |
| piede | Impostazioni · Assistenza |

**Azienda (2+ sedi)**: — Panoramica · Sedi | Catalogo (Menù · Prodotti · Programmazione) | Pagina pubblica (Stili · In evidenza · Storie · Lingue) | Andamento (Analitiche · Recensioni · Clienti) | piede Impostazioni · Assistenza.

**Sede (2+ sedi)**: ← Tutte le sedi | Il locale (Scheda · Cosa vedono i clienti) | Operatività (Servizio · Prenotazioni · Comande · Storico) | Andamento (Analitiche · Recensioni) | piede: il menù dell'account, lo stesso dell'azienda (Impostazioni · Team · Abbonamento · Lingue · Assistenza). Impostazioni è dell'azienda ma si apre anche da dentro la sede (deciso il 2026-10-09).

Ordine voluto: prima il locale, poi cosa offre, poi il lavoro in sala, poi i risultati. Operatività non sta in cima perché è del piano Pro.
«Menù» è l'etichetta di verticale (`catalogLabel`), non una stringa fissa.

### 51.6 Dove si atterra
- Chi configura (owner, admin, e chi ha il permesso di gestire almeno una sede — il permesso esatto lo conferma il censimento) → **Panoramica**, con una o più sedi.
- Entrando in una sede (2+ sedi) → **Scheda**.
- Staff e viewer (non configurano):
  - 1 sede leggibile → prima voce di **Operatività** che possono usare (Servizio o Comande);
  - 2+ sedi → **Sedi** per scegliere il locale; entrando, prima voce di Operatività usabile.
- Se nessuna voce è usabile: Scheda (fallback di oggi, `SEDE_FALLBACK_SEGMENT`).
- La regola «prima voce usabile nell'ordine della sidebar» resta: cambia solo l'ordine e il punto di partenza.

### 51.7 Il selettore di sede vive nell'header, sempre
- **1 sede**: mostra il nome della sede ▾. Menu: la sede (✓), separatore, «+ Aggiungi una sede» (solo a chi può creare sedi: stesso gate di oggi su «Aggiungi sede» in Sedi), che apre **direttamente** il flusso di creazione di oggi.
- **2+ sedi, contesto azienda**: «Tutte le sedi ▾». Menu: le sedi leggibili (con «Sospesa» dove serve); scegliere una sede ci entra. In fondo «+ Aggiungi una sede» e «Tutte le sedi» (= pagina Sedi).
- **2+ sedi, dentro una sede**: il nome della sede ▾. Scegliere un'altra sede **resta sulla stessa pagina** (Comande di A → Comande di B; se la pagina non è usabile nella sede nuova, prima voce usabile).
- Sostituisce `SedeScopeSelect` nella navbar: il selettore di scope di oggi (Analitiche, Recensioni, Programmazione) **sparisce** dall'header (vedi 51.10, 51.11).
- Stato: accanto alla sede compare solo **«Sospesa»**; «Pubblicata» resta nella testata della Scheda.
- Un manager con una sede: menu con la sola sede, senza «Aggiungi».

### 51.8 L'header: percorso a cartelle
- **Desktop e tablet (≥768px)**: logo / azienda ▾ / sede ▾ (+ «Sospesa») / pagina.
- **Telefono (<768px)**: [menu] / azienda ▾ / sede ▾. **Niente logo, niente nome della pagina** (è il titolo sotto). L'azienda si accorcia con i puntini oltre ~170px; la sede resta sempre intera.
- Il nome dell'azienda resta sempre visibile: è l'unico punto della UI dove compare.

### 51.9 Ordini e Prenotazioni fuori dalla sidebar d'azienda
Le voci escono. Gli indirizzi `/orders` e `/reservations` restano come redirect all'ultima sede usata (`SedeRedirect`, com'è oggi), per link e notifiche.

### 51.10 Andamento: Analitiche e Recensioni
- **Dentro la sede** (e nella sidebar unica): nuove rotte `/locations/:activityId/analitiche` e `/locations/:activityId/recensioni`, **stesso componente** con la sede fissata dal path. Stesse sezioni (Pagina pubblica · Ordini · Prenotazioni), stessi filtri, stesso export.
- **A livello azienda** (`/analytics`, `/reviews`, solo con 2+ sedi): il **totale delle sedi leggibili** (lo `SCOPE_ALL` di oggi), senza selettore.
- Recensioni d'azienda: ogni riga dice di quale sede è (colonna o etichetta Sede, se non c'è già). Il contatore in sidebar: totale in azienda, della sede dentro la sede.
- Gate: quelli di oggi (`analytics.read`, `reviews.read`, `reviews.moderate`), chiesti **sulla sede** dentro la sede.
- Con 1 sede: Analitiche e Recensioni della sidebar unica sono le rotte di sede.
- La tabella di confronto sede per sede **non** si fa (funzione nuova, §36.2).

### 51.11 Clienti e Programmazione
- **Clienti**: sempre d'azienda, in Andamento in entrambi i casi. Nessun filtro per sede (oggi non c'è). Il link da una prenotazione resta.
- **Programmazione**: sempre d'azienda, in Catalogo in entrambi i casi. Il filtro sede passa **dall'header alla pagina** (FilterBar), e `?sede=` continua a funzionare. Da «Cosa vedono i clienti» il link apre Programmazione già filtrata sulla sede: si esce dal contesto sede, si torna col selettore o col pulsante indietro. Nessun «← Torna alla sede».

### 51.12 Impostazioni e Assistenza
- **Impostazioni** diventa una voce con tab **Azienda · Team · Abbonamento** (rotte `/settings` = Azienda, `/settings/team`, `/settings/abbonamento`). Ogni tab col suo gate di oggi (Team: `team.read`, Abbonamento: `billing.read`, Azienda: com'è oggi); tab non permessa = non mostrata. Team tiene le sue sotto-tab Membri · Inviti. Contenuti invariati.
- **Assistenza** scende nel **piede** della sidebar, uguale in tutti i contesti, col suo pallino dei non letti e il gate di oggi (`support.read`).

### 51.13 Piano base
Le voci Pro restano visibili col **lucchetto**, come oggi. Nessun upsell nuovo.

### 51.14 Indirizzi vecchi
Ogni vecchio indirizzo porta alla pagina che oggi fa la stessa cosa (`replace`):
| Vecchio | Nuovo |
|---|---|
| `/team` | `/settings/team` |
| `/subscription` | `/settings/abbonamento` |
| `/locations` con 1 sede leggibile | `/locations/:id/anagrafica` |
| `/orders`, `/reservations` | invariati: ultima sede usata |
| `/analytics`, `/reviews` con 1 sede leggibile | rotta di sede corrispondente |
| `/analytics`, `/reviews` con 2+ sedi | totale (la sede ricordata in sessionStorage non conta più) |
| notifiche/avvisi di una sede (es. nuova recensione) | pagina di quella sede |
L'elenco completo dei punti che linkano queste pagine lo produce il censimento.

### 51.15 La sidebar: aspetto e comportamento
Modello: elenco con titoli di gruppo (riferimento: sidebar di Supabase Studio). **I gruppi non si chiudono.**
- **Aperta**: larghezza 232px. Ogni gruppo ha il titolo (11px, semibold, maiuscolo, spaziatura .06em) in uno slot alto 36px col testo in basso (6px sotto): lo spazio sta sopra il titolo, che resta attaccato alle sue voci. Colore muted come le voci: nessun token di `_theme.scss` più chiaro tiene 4,5:1 su `--surface` in chiaro (`--color-gray-400` 2,56:1; `--color-gray-500` in chiaro è uguale alle voci), quindi i gruppi si separano con lo spazio. Fra i gruppi nessun divisore: solo titoli. Righe alte 36px, icona 18px, padding orizzontale 12px, gap icona-testo 12px.
- **Chiusa**: larghezza 64px. **Le righe restano esattamente alla stessa altezza**: sparisce il testo, resta l'icona. Lo slot del titolo resta alto uguale (36px) e al posto del testo mostra un trattino (linea 1px, colore line, margini 14px), tutti uguali. Al passaggio del mouse/focus: tooltip col nome della voce (componente `Tooltip` esistente).
- **Animazione**: solo la larghezza (≈200ms, ease); il testo viene tagliato, non riposizionato. Con `prefers-reduced-motion`: nessuna transizione.
- **Voce attiva**: sfondo accent-soft, testo e icona accent, semibold. Hover: sfondo sunken.
- **Segnali** (quelli di oggi, nessuno nuovo): aperta → a destra della riga (contatore a pillola, spinner 14px dell'import, pallino 7px, lucchetto 14px muted); chiusa → badge piccolo in alto a destra dell'icona (contatore, spinner, pallino); voce col lucchetto → icona muted, tooltip «Nome · Pro».
- **Piede**: Impostazioni · Assistenza · pulsante apri/chiudi (nella sede: Assistenza · apri/chiudi). Stato aperta/chiusa salvato come oggi.
- **Sotto 1024px** parte chiusa (resta apribile). **Sotto 768px** nessuna versione chiusa: pannello a tutta altezza dal pulsante menu, come oggi.
- Solo token esistenti di `_theme.scss` e componenti di `src/components/ui/`: nessun colore nuovo, nessuna libreria nuova.

### 51.16 Fuori da questo lavoro (funzioni nuove, lotti propri)
Tabella confronto sedi (Analitiche) · memoria Elenco/Mappa (§18.2) · badge «modifiche a mano» su Cosa vedono (§19.5) · avviso al passaggio 1→2 sedi · gruppi chiudibili · upsell sul piano base · Storna → `orders.manage` (lotto correzioni).

---

## Parte 2 — Piano di esecuzione

**Un solo lotto, «Navigazione v2»**, su un branch, con **un solo checkpoint su staging**: sidebar, header e Andamento cambiano insieme, così staging non resta mai a metà (es. selettore tolto dall'header ma Analitiche non ancora dentro la sede).

Branch: `feat/navigazione-v2` da `refactor/design-system` (`367a1f6d`), worktree `cataloglobe-ds`.

### Regole di esecuzione (valgono per ogni passo)
- Prima gli e2e del passo (`test.fail` per i comportamenti nuovi, `page.route` stub, locator per ruolo, helper `e2e/asRole.ts`), poi il codice, poi un commit (Conventional Commits, `git add` file per file).
- Refactor di navigazione: **nessuna funzione persa né aggiunta** oltre a §51. Un test che codifica la navigazione vecchia si riscrive col motivo nel commit; nessun test si modifica per farlo passare.
- `tsc -b`, `typecheck:e2e`, vitest, lint (16 errori Edge preesistenti: non aumentano), `ds:budget:check` (ratchet solo in discesa) a ogni commit.
- e2e una spec per chiamata (mai cicli), `workers: 2`, timeout invariati. Staging è Nano/Free.
- Nessun DB, nessuna migration, nessuna Edge Function. Se un passo ne richiede una: **stop**.
- Niente `git add -A/.`, `stash`, `checkout .`, `reset --hard`. `git --no-optional-locks status`.
- File curati (CLAUDE.md, MEMORY.md, memory/): solo diff da approvare, mai scritti.

### Fermate (le uniche)
1. Fine censimento, **solo se** emerge una decisione di prodotto non coperta da §51 (al massimo 5, ognuna con raccomandazione).
2. Prima del merge: report + giro visivo + diff di CLAUDE.md + bozza §51 esiti e righe registro.
Tutto il resto procede senza chiedere.

### Passo 0 — Censimento (sola lettura, nessun commit)
Produrre un elenco breve, con file:riga:
- tutti i link/`navigate` verso `orders`, `reservations`, `team`, `subscription`, `locations`, `analytics`, `reviews`, `settings`, `support` (inclusi `operationalAlertRoutes`, notifiche, Panoramica, onboarding, email/Edge che generano URL — queste ultime solo da elencare);
- usi di `useSedeScope`, `SedeScopeSelect`, `SEDE_NAVBAR_ROUTES`, `SEDE_SINGLE_SITE_ROUTES`, `businessHomePath`, `BusinessHomeRedirect`, `SedeRedirect`, `SEDE_NAV_ENTRIES`, `firstSedeSegment`;
- il permesso che abilita «Aggiungi sede» in `Businesses.tsx` e il flusso di creazione che apre;
- il permesso da usare per «chi configura» (51.6) — proposta: `activity.manage` su almeno una sede, o owner/admin;
- come Reviews oggi rende lo scope «tutte» (c'è già l'indicazione della sede per riga?);
- le spec e2e che toccano sidebar, header, atterraggio, Analitiche, Recensioni, Team, Abbonamento, Impostazioni.

### Passo 1 — Modello di navigazione unico
Un modulo puro (estendere `src/utils/navLanding.ts` o nuovo `src/utils/navModel.ts`, a scelta motivata) che descrive **una volta** gruppi, voci, ordine, icone, gate e segnali per i tre casi (unica, azienda, sede) e risolve: contesto (`unica | azienda | sede`) dalle sedi leggibili, atterraggio (51.6), prima voce usabile. `TenantSidebar` e `SedeSidebar` leggono da qui.
Test: unit sul modulo (contesti × ruoli × piano), atterraggio per owner/manager/staff con 1 e 2+ sedi.

### Passo 2 — Le tre sidebar
Sidebar unica (nuova composizione), azienda (senza Ordini/Prenotazioni, Sedi sotto Panoramica), sede (testata solo «← Tutte le sedi»). Impostazioni come voce singola, Assistenza nel piede.
e2e: voci e ordine per contesto e ruolo; voce Sedi assente con 1 sede; staff vede Operatività.

### Passo 3 — Aspetto e comportamento della sidebar (51.15)
`AppSidebar`: slot titolo 28px, righe 36px, chiusa 64px con trattino, righe ferme, tooltip, segnali aperta/chiusa, piede, partenza chiusa <1024px, pannello <768px.
Verifica: e2e che misura la posizione verticale delle prime voci aperta vs chiusa (uguale ±1px); screenshot.

### Passo 4 — Header: percorso e selettore di sede (51.7, 51.8)
Nuovo segmento sede nell'header per tutti i contesti; menu con sedi, «Aggiungi una sede», «Tutte le sedi»; cambio sede che resta sulla pagina; «Sospesa». Via `SedeScopeSelect` dalla navbar. Mobile: niente logo né pagina.
e2e: 1 sede (menu con Aggiungi, che apre la creazione), 2+ sedi in azienda (entra), in sede (cambia restando su Comande), manager di 1 sede (niente Aggiungi), 375px (azienda + sede, niente pagina).

### Passo 5 — Atterraggio e indirizzi (51.6, 51.9, 51.14)
`BusinessHomeRedirect` e ingresso in sede secondo 51.6; `/locations` con 1 sede → Scheda; redirect di 51.14; deep link delle notifiche di sede verso le pagine di sede.
e2e: una riga per redirect della tabella; atterraggio per ruolo.

### Passo 6 — Impostazioni con tab (51.12)
`/settings` · `/settings/team` · `/settings/abbonamento`, tab come quelle della Scheda (tab che navigano), gate per tab, redirect `/team` e `/subscription`. Contenuti delle tre pagine invariati.
e2e: tab visibili per ruolo; redirect; Membri · Inviti dentro Team.

### Passo 7 — Andamento (51.10)
Rotte di sede per Analitiche e Recensioni (stesso componente, sede dal path, gate sulla sede); pagine d'azienda fisse sul totale delle sedi leggibili; sede per riga in Recensioni d'azienda se manca; contatori in sidebar (totale / della sede). Rimuovere la persistenza di scope non più usata.
e2e: Analitiche e Recensioni dentro la sede chiamano i service con quella sede; in azienda col totale; 1 sede → rotte di sede.

### Passo 8 — Programmazione (51.11)
Filtro sede nella FilterBar della pagina, `?sede=` invariato; link da Cosa vedono i clienti verso Programmazione filtrata.
e2e: filtro da URL e da UI; link da Cosa vedono.

### Passo 9 — Documentazione
`docs/routes.md`, `docs/patterns/activity-detail.md`, matrice permessi §7, `navLanding`/`navModel` commentati. **Diff di CLAUDE.md** (sezioni Layout, Route principali, Sede/Servizio) preparato, non scritto.

### Passo 10 — Giro visivo e report
Playwright su 5174 (avviarlo e fermarlo), dati di staging, screenshot 1280/768/375 per: owner 1 sede, owner 2+ sedi (azienda e dentro sede), manager di 1 sede su più, staff 1 sede e 2+ sedi; sidebar aperta e chiusa; menu del selettore; Impostazioni; Analitiche e Recensioni nei due livelli. Scroll orizzontale 0, zero scritture. Pulizia temporanei.
**Report di stop**: commit, esiti e2e per spec, misure (unit, lint, budget), scostamenti numerati, bozza «§51 — esiti», righe «Esiti» del registro, diff CLAUDE.md.

Dopo l'ok: merge `--no-ff` in `refactor/design-system`, PR di checkpoint verso staging con merge commit, fast-forward, cancellazione del branch.
