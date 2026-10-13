# Officina: tunnel nuovi e Calendario, stato del lavoro

Ramo `officina-tunnel-nuovi`, nato da `officina-pronto` (che contiene `officina-stile-pulizia`). Si aggiorna a ogni push.

Pagine da portare nel codice, versione «proposte + Claude» (segno viola), così come sono:
- Tunnel di Officina: https://claude.ai/artifact/FYt9Zg4UaAkGRx8wqfRkEV
- Calendario di Officina: https://claude.ai/artifact/BwMntrgzqmuGs6P8j7vL1D

Vale la pagina: se una decisione vecchia dice altro, vale la pagina. Testi e disegni non si inventano: se manca o è ambiguo, si chiede ad Alex.

## Risposte di Alex (2026-10-13)
1. **Database**: staging non entra nel ramo, nessun file in `supabase/migrations`. Ciò che scrive le colonne nuove resta dietro `DB.ready = false` (`src/pages/Dashboard/Programming/calendar/calendarFlags.ts`) con la scritta «si salva col database nuovo» (`DB_WAIT`), ma il codice per salvare si prepara già.
2. **Menù che stanno da soli**: il consiglio della pagina, cioè la scelta sede per sede, menù per menù; chiede il database nuovo [int.].
3. **«Vedi il piatto»**: consiglio B, apre la scheda del piatto.
4. **Cancellare una regola**: nello stesso pannello del Calendario, azione secondaria con conferma, sotto «Spegni» che resta il pulsante principale. Testi di oggi nel codice: «Togli» · «Togliere dal calendario? Non andrà più in onda.» · toast «Tolto dal calendario: X.».

[int.] = resta dietro l'interruttore `DB.ready`.

## Prima: le prove e2e di `officina-pronto`
Sul Mac, su `033e8898`: 5 prove fallite in `e2e/crea.spec.ts`, tutte D189.
- **Fatto** `039ea274`: il difetto vero. In modifica contavano anche le regole spente: un menù con una accesa e una spenta (nello stub: menù Pranzo, regole «pranzo» e «spento») perdeva «Dove e quando». Ora contano le accese, le spente solo se non ce n'è nessuna. Prova in `src/tests/creaLoad.test.ts`.
- **Da fare**: le altre quattro prove «scritte male». I nomi non sono scritti da nessuna parte: servono i nomi o l'output di `bash scripts/e2e.sh e2e/crea.spec.ts` sul Mac (dopo `039ea274`, che dovrebbe già far passare la prova sul menù Pranzo, riga ~232). Mai cambiare una prova solo per farla passare.

## I 27 punti

### Tunnel Menù
1. Via «Che menù è»: niente più multi menù da qui; al suo posto «Da dove parti» e «Quale menù copi?». **Da fare**
2. Dove prima del Quando; si parte da nessuna sede; nel Dove «In onda?». **Da fare**
3. Quando in due parti: «Le ore» («Hanno le stesse ore?», ora scritta 22 / 2230 / 22:30 o dall'orologio con ↑ ↓, «Giorno dopo» [int.], più fasce [int.]); poi «In onda insieme / al posto» [int.] («È uguale in tutte le sedi?», una sede alla volta con «N di M sedi viste», spunta, etichetta «diversa»). **Da fare**
4. Menù che stanno da soli (soloBox) [int.]. **Da fare**
5. Controlla: «Cosa cambia nel calendario» (versione Claude), settimana a destra, pallino colore, frecce delle sedi, fumetto. **Da fare**
6. «Avanti» porta a ciò che manca: bordo rosso, scossa, messaggio. **Da fare**
7. «E adesso?» dopo ogni creazione: eredita sedi e ore e chiede di confermarle. **Da fare**
8. In modifica, la casella «Dove e Quando» separati. **Da fare**

### Tunnel Stile
9. «Prende il posto» oppure «lascia l'altro». **Da fare**
10. «No, lo spengo» su uno stile in onda [int.]. **Da fare**

### Tunnel In evidenza
11. Testo: si vede in un posto solo, in cima al menù (D187). **Da fare**
12. «Quando succede», data informativa [int.]. **Da fare**
13. «Il pulsante» senza link libero [int.]. **Da fare**
14. «Fino al [giorno]: puoi cambiarlo». **Da fare**
15. Passo «L'ordine» per sede: «È uguale in tutte le sedi?», chip delle sedi, righe trascinabili [int.]. **Da fare**

### Tunnel Storia
16. «Di cosa parla»: prodotto con ricerca a tendina, oppure la sede. **Da fare**
17. «In onda?» senza Dove e Quando (strada A, D191). **Da fare**
18. Nell'elenco ogni riga dice di cosa parla e se è in onda. **Da fare**

### Comune
19. Colori per tipo. **Da fare**
20. «E adesso?» sul binario dei passi. **Da fare**

### Calendario (per ultimo)
21. Testi G1, G7, G2, G3, G8, G5, G4 (vedi la pagina, etichette viola). **Da fare**
22. Menù, Stile, In evidenza: passi Cosa · Dove · Quando («Le ore», poi «In onda insieme») · Controlla; pulsanti «Metti in onda» / «Salva e tieni pronto» · «Salva le modifiche». **Da fare**
23. «Quale menù»: «in onda» o «pronto, non in onda»; una voce per menù, con l'avviso «ha già la sua voce nel Calendario… Modifica la sua voce». **Da fare**
24. Modifica: «Cosa vuoi modificare?», solo i passi scelti, Controlla con «Prima / Adesso». **Da fare**
25. Pannello: «Spegni» principale, «Metti in onda» sulle spente; «Togli» secondaria con conferma (testi di oggi); spente tratteggiate «pronto, non in onda»; «In onda, insieme a «X».» / «Prende il posto di «X».»; legenda «2 insieme · al posto». **Da fare**
26. Mezzanotte: si disegna nel giorno in cui comincia; nel pannello «Anche dopo mezzanotte: fino alle 02:00 è la stessa serata.»; asse fino all'ultima fascia [int.]. **Da fare**
27. Prezzi e Disponibilità restano come oggi. **Niente da fare**

Il punto «due strade» della pagina del tunnel è superato da D191 e non si porta.

## Controlli a ogni commit
`npx tsc -b`, `npm run -s typecheck:e2e`, `npm run lint`, `npm test`, `npm run ds:budget:check`, `npm run public:budget:check`. Playwright solo sul Mac con `bash scripts/e2e.sh e2e/<spec>.spec.ts`.
