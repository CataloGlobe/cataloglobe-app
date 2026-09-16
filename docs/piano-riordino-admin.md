# Riordino del pannello admin — piano di lavoro

**Documento vivo.** Si aggiorna a ogni milestone. È la prima cosa da leggere riaprendo il lavoro.

Gli altri due documenti non si riscrivono:

| Documento | Natura | Quando si tocca |
|---|---|---|
| `audit-ui-ux-admin.md` | la fotografia di FASE 1 (628 righe, osservazioni N/C/P/T) | mai: è congelato |
| `decisioni-riordino-admin.md` | l'archivio delle decisioni, in sezioni numerate | solo in append, una sezione per milestone |
| **`piano-riordino-admin.md`** (questo) | stato + scaletta + procedura | a ogni milestone |

---

## 1. Dove siamo

| # | Milestone | Stato | Dove è scritta |
|---|---|---|---|
| 0 | Audit read-only del pannello | **chiusa** | `audit-ui-ux-admin.md` |
| 1 | Macro: sede come contesto, Programmazione azienda-scope, criterio di collocazione, regole trasversali | **chiusa** | decisioni §1–9 |
| 2 | Dizionario dei 14 termini | **chiusa** | decisioni §10 |
| 3 | Fondazioni dei componenti (A–F) | **chiusa** | decisioni §11 |
| 4 | **Comande** + Storico | **chiusa** | decisioni §12 |
| 5 | **Tavoli** + conto | **chiusa** | decisioni §13 |
| 6 | Prenotazioni (sede) | prossima | — |
| 7 | Disponibilità (sede) | da fare | — |
| 8 | Cosa mostra (sede) | da fare | — |
| 9 | Programmazione (azienda) | da fare | — |
| 10 | Menù: cataloghi, prodotti, attributi, in evidenza (azienda) | da fare | — |
| 11 | Scheda della sede | da fare | — |
| 12 | Sedi (azienda) | da fare | — |
| 13 | Stili · Storie · Recensioni | da fare | — |
| 14 | Analitiche | da fare | — |
| 15 | Team · Abbonamento · Impostazioni | da fare | — |
| 16 | Panoramica (azienda) | ultima per decisione | — |

Prototipo navigabile: artifact **"Pannello a due contesti"**, v6. Contiene azienda (Panoramica, Sedi, Menù, Programmazione) e sede (Comande, Storico, Tavoli + conto, Prenotazioni, Disponibilità, Cosa mostra, Scheda).

### Perché questo ordine

- Si finisce **la sede** prima di salire: è il territorio già deciso e il cuore operativo, e ogni pagina di sede chiarisce cosa deve restare nella Scheda.
- **Cosa mostra** viene prima di **Programmazione**: è la sede che dichiara di cosa ha bisogno, e Programmazione deve fornirlo. Al contrario si progetta un motore e poi si scopre che non risponde alla domanda.
- La **Scheda** viene dopo le pagine che le portano via roba (tavoli, capienza, disponibilità): solo allora si sa cosa le resta.
- **Panoramica** per ultima: riassume tutto, quindi può esistere solo quando tutto esiste.

---

## 2. Procedura per ogni pagina

Cinque passi, nell'ordine. Il primo non si salta: serve a non inventare strutture.

**1 · Ricognizione nel codice.** Prima di toccare il prototipo: tutti i call site del componente, tutte le label, tutti i drawer con la loro larghezza, tutti i gate di permesso, tutte le funzioni di service. Si contano le cose (quanti campi, quante azioni, quante voci di menù, quanti px). Nessuna proposta in questo passo.

**Regola anti-allucinazione:** niente entra nel record se non è stato letto nel codice, e si cita `file:riga`. Se una cosa non si trova, si scrive "non trovato", non si assume.

**2 · Confronto con l'audit.** Si ripescano le osservazioni già numerate (N/C/P/T) su quella pagina, così niente di già trovato va perso per strada.

**3 · Decisioni proposte.** Una per una, ognuna con il motivo. Vincolo: **ogni feature esistente deve essere contabilizzata** — spostata, rinominata o confermata. Mai lasciata cadere in silenzio. Le decisioni si etichettano: struttura · copy · componente.

**4 · Prototipo.** Si costruisce, si verifica con Playwright (i click funzionano, console pulita, a 400px nessun overflow orizzontale), si guarda lo screenshot, si pubblica.

**5 · Milestone.** Si appende la sezione al record delle decisioni, si aggiorna questo piano (stato, scaletta, aperti, debiti), si dichiara cosa resta aperto.

Un solo dubbio per volta, alla fine. Se ce ne sono due, il secondo aspetta.

---

## 3. Punti aperti

| Aperto | Dove si chiude |
|---|---|
| "Metti in manutenzione": solo in modalità gestione o anche sulla card live? | Tavoli — in attesa di risposta |
| Incasso e totali di giornata: nello Storico o in Analitiche? | milestone 14 |
| Come Programmazione diventa un vero punto di controllo (osservazione T2) | milestone 9 |
| Il nome "Cosa vede il cliente" / "Cosa mostra" | milestone 8 |
| Se Comande debba girare a schermo pieno senza la cornice admin | dopo la milestone 16 |
| Inbox prenotazioni cross-sede: resta a livello azienda? | milestone 6 |

## 4. Debiti trovati nel codice, da saldare quando si tocca

| Cosa | Dove | Trovato in |
|---|---|---|
| `OrdersKpiBar.tsx` + scss: nessun call site | `src/pages/Dashboard/Orders/` | milestone 4 |
| `OrderRectifyDrawer.tsx`: dead code (`OrderRectifyForm` è invece vivo) | `src/pages/Dashboard/Orders/` | audit + milestone 4 |
| `PublicProductCard.tsx`: candidato a cleanup | `src/components/` | audit |
| CLAUDE.md descrive la KPI bar come visibile e `ActivitySelectorCombobox` in header: falso, oggi è `useSedeScope` | `CLAUDE.md` | milestone 4 |
| `OrderCancelDrawer.tsx:87` consiglia "la rettifica", parola che nell'interfaccia non esiste | `src/pages/Dashboard/Orders/` | milestone 5 |
| `PageHeaderContext`: `title`/`subtitle` accettati e ignorati da `PageHeaderSlot` | `src/context/`, `src/components/layout/` | audit (N-load-bearing) |
| Tre fonti di label divergenti: `buildGroups`, `ROUTE_LABELS`, `PAGE_TITLES` | Sidebar, AppHeader, MainLayout | audit |
| Token CSS: lotto in corso su `_theme.scss` (staged, non committato) | `src/styles/` | traccia parallela |

## 5. Fuori perimetro

- **Dark mode**: mai stata implementata. Non si progetta ora; eventualmente durante il refactor, un pezzo per volta.
- **Scala di token per le dimensioni del testo**: non si introduce (collisione di namespace con `--text-muted`, e duplicherebbe `_typography.scss` + `Text`, usato in 233 file).
- **Traduzioni**: la UI del selettore esiste, la logica no. Solo IT.
