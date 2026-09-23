# Landing di campagna — punto di consegna per la chat che scrive il codice

Aggiornato: 23/09/2026. Scritto per essere letto **per intero** all'inizio della sessione
nuova, insieme al canvas. Il canvas è la specifica visiva; questo documento dice **perché**
le cose stanno come stanno — il perché in un artboard non si vede.

Studio preparatorio (copy, posizionamento, ragionamenti iniziali): progetto Claude,
`claude/studio-landing-campagna.md`. Vincoli di codebase: `CLAUDE.md`.
Prompt operativi per passata: `docs/landing/passata-*.md`.

---

## 1. Di cosa si tratta

Rifacimento della landing pubblica di CataloGlobe (route `/`, oggi `Home`) in vista di una
campagna a pagamento su Meta / Instagram / TikTok, gestita da un'agenzia esterna.

**Il traffico sarà in larghissima parte da smartphone, dentro le webview in-app dei
social.** Non è un dettaglio di contorno: è il vincolo che ha determinato metà delle
decisioni di design. Nelle webview `target="_blank"` è inaffidabile e il gesto «indietro» è
imprevedibile, quindi vale il principio: **niente in questa pagina naviga altrove, sopra il
form.**

## 2. Come si lavora con Lorenzo (il metodo)

- **Prima si ragiona, poi si costruisce.** Lui chiede un ragionamento, io do *una*
  raccomandazione motivata — non una lista di opzioni — e dico apertamente dove non sono
  d'accordo con lui. Lui risponde «procedi». Solo allora si costruisce.
- **Tutto in italiano**, interfaccia e conversazione.
- **Ogni risposta finisce con una riga breve e laconica**: cosa passare a Claude Code, o
  niente. Lorenzo fa da ponte fra la chat che decide e Claude Code che esegue.
- **Le copy le approva lui** prima del commit.
- Due bandierine rosse che ha alzato più volte e che vanno tenute presenti:
  **«sembra scopiazzato»** (da Menumal, il competitor che ha studiato) e **«è troppo AI
  slop»** (griglie di quattro riquadri colorati con un'icona ciascuno: sono state buttate).
- **Onestà nei claim**: niente prove sociali inventate, niente numeri finti, niente
  «a norma di legge».

## 3. Dove sta la roba

| Cosa | Dove |
|---|---|
| **La specifica visiva** | canvas Design `RTe3iqJZAvXVjrE7L5RDYG` — «Landing CataloGlobe — bozza nuova» |
| Studio preparatorio, copy | progetto Claude, `claude/studio-landing-campagna.md` |
| Vincoli di codebase | `CLAUDE.md` (stack, service layer, SCSS Modules, PROIBITO) |

Le board del canvas, in ordine di lettura:

| Board | Cosa contiene |
|---|---|
| `Main` (390×3410) | mobile, prima metà: hero, carta o PDF, import da foto, martedì vuoto |
| `Main-2` (390×6570) | mobile, seconda metà: le nove schede, i tre locali, prezzi, FAQ, form, footer |
| `Desktop` (1280×7490) | la pagina intera a 1280 |
| `Stati-desktop`, `Stati-mobile` | i due stati della barra fissa |
| `Sheet-mobile` | il menù di esempio che si apre **dentro** la landing |
| `Ordini`, `Prenotazioni`, `Altre` | banchi di prova delle nove schede — riferimento, non pagina |
| `Form-1`, `Form-2` | i due passi del form (**palette vecchia**: valgono per la struttura, non per i colori) |
| `Tipografia` | le tre prove tipografiche; **scelta: B, Young Serif** (la board usa il 700: superato, vale il 400) |

Le board sono **interattive**: si preme Play e si cammina. Vale la pena farlo prima di
scrivere una riga.

## 4. Le sezioni, in ordine

| # | Titolo | Cosa fa |
|---|---|---|
| 1 | *Il tuo menù può **vendere per te**.* | hero scuro, foto (oggi gradiente) + carta menù animata |
| 2 | *Carta o PDF, il problema è lo stesso: non cambia mai.* | due pannelli di confronto, fondo chiaro |
| 3 | *Il menù ce l'hai già. Basta una foto.* | import AI, card animata a 3 passi |
| 4 | *Scopri in che giorni il locale è vuoto.* | analitiche, due grafici a barre + «In evidenza» |
| 5 | *E dentro c'è tutto il resto.* | nove schede cliccabili in una carta sola |
| 6 | *Guarda cosa può diventare il tuo locale.* | tre locali demo + anteprima dal vivo + QR |
| 7 | *Un prezzo per locale. Scritto.* | due piani, mensile/annuale |
| 8 | *Cosa ti costa provarlo: una telefonata.* | timeline a 4 passi |
| 9 | *Domande, in breve.* | 5 FAQ a fisarmonica + riga «scrivici» |
| 10 | *Il tuo menù, sempre al passo. Partiamo?* | form scuro a due colonne |
| 11 | footer | tre colonne di link + riga legale |

Su mobile 1–4 stanno in `Main`, 5–11 in `Main-2`. Su desktop è tutto su una board sola.

## 5. Le decisioni prese, e perché

Queste sono le cose che nel canvas si vedono ma non si spiegano. **Non vanno riaperte senza
motivo** — dietro ciascuna c'è un giro di discussione già fatto.

### 5.1 Lo sheet invece della navigazione

I tre locali demo (§6) **non portano fuori dalla pagina**. Si aprono in una modale in stile
iOS che sale dal basso: `left/right: 8px`, `bottom: 9px`, `top: 64px`, raggio 22, grabber in
cima, header con nome del locale + `cataloglobe.com/il-molo-34` + ✕. La landing dietro fa
`transform: scale(0.955)` con uno scrim `rgba(13,12,28,0.52)`.

Il motivo è il §1: nelle webview in-app aprire una scheda nuova è un biglietto di sola
andata. Lorenzo aveva scartato l'idea dell'iframe che simula un telefono — «sarebbe strano
simulare la forma di un telefono visto da un telefono» — ed è giusto: dentro lo sheet ci va
il menù, non la cornice di un telefono.

In codice **non si usa `SystemDrawer`/`DrawerLayout`**: nel pubblico si usa `PublicSheet`,
che esiste già ed è la stessa famiglia di problema. Vale tutto quello che `CLAUDE.md` dice
su `PublicSheet` (lock dello scroll con `position:fixed` sul body, uscita su WAAPI e non
spring Framer, `dragMomentum={false}`, mai `backdrop-filter` su un elemento che trasla).

### 5.2 Due soli momenti scuri

Hero e chiusura (form + footer). Tutto il resto è chiaro. Ci si è arrivati dopo aver provato
una fascia di confronto scura subito sotto l'hero: due blocchi scuri vicini annullavano il
contrasto e la pagina perdeva ritmo.

### 5.3 La palette è costruita sull'indaco

Lorenzo ha bocciato i neutri color carta: «non si addicono al nostro colore principale che è
sul viola». L'intera rampa è stata ricostruita sulla tinta 239.

| Token | Valore | Ruolo |
|---|---|---|
| `PAPER` | `#F2F2FA` | fondo pagina |
| `PAPER_2` | `#FFFFFF` | bianco pieno |
| `INK` | `#15141F` | testo forte |
| `BODY` | `#3C3A4C` | testo corrente |
| `MUTED` | `#63607A` | testo secondario |
| `LINE` / `LINE_2` | `#E0E0EE` / `#EDEDF6` | bordi |
| `AZIONE` | `#4648C6` | bottoni, link |
| `BRAND` | `#6366F1` | accento |
| `BRAND_S` | `#E6E5FC` | accento tenue |
| `TERRA` | `#A8461F` | **unico caldo rimasto** — «Esaurito», «Dietro le quinte» |
| `FUORI` | `#E3E3F0` | il piano su cui appoggia la cornice |
| `SCURO` | `#15142B` | notte indaco (hero, form) |

I colori che il canvas usa oltre a questi (parola evidenziata su scuro `#A9AAF2`, tratti di
sottolineatura `#6E70D8`/`#9B98F0`, barre `#C4C5F3`, testi del tono scuro `#BDBAD2`/
`#7F7C99`/`#CBC8DE`, linee scure `#2E2C50`, hover `#33359E`, bordo brand-s `#DBDAF4`) sono
nominati nei token `--ld-*` della Passata 0. Le ombre del canvas hanno base
`rgba(23,20,15)`: inchiostro caldo ereditato, in codice sono su indaco `rgba(21,20,43)`.

Tipografia: **Young Serif solo peso 400** per i display (mai 700: si sfalda), **Instrument
Sans** per tutto il resto. Self-hosted (fontsource), non link a Google.

### 5.4 La cornice

La pagina non arriva ai bordi: c'è un riquadro esterno color `FUORI` con dentro la pagina
stondata (margine 10px / raggio 22 su mobile, 16/30 su desktop). In codice `overflow: clip`,
non `hidden` (hidden crea uno scroll container e rompe gli `sticky`); le barre fisse stanno
fuori dall'elemento che scala all'apertura dello sheet. È una decisione strutturale che
tocca ogni board — va presa in Passata 0, non scoperta dopo.

### 5.5 L'identità, e cosa si è tolto per non copiare

Guardando Menumal Lorenzo ha detto «così è fin troppo chiaro che stiamo copiando». Sono
state tolte: le voci di navigazione in alto, la pillola attorno al logo, l'aria molto larga
nei blocchi di confronto (funzionava da loro perché hanno illustrazioni, da noi no).
È rimasto: **il logo nudo e un solo pulsante «Accedi»**, l'hero come pannello stondato
staccato dai bordi. I tre locali demo hanno di proposito accenti **non** indaco (oro,
terracotta, verde): il punto della sezione è «ognuno con il suo stile».

### 5.6 La barra fissa, due stati

Logo e «Accedi» sempre visibili. Sopra l'hero la barra è trasparente; scorrendo si condensa
e compare la CTA. Su mobile, in più, una barra in fondo. Disegnati in `Stati-desktop` e
`Stati-mobile`. Serve un `padding-bottom` sulla pagina per la barra inferiore.

### 5.7 Il fondo dell'hero che cambia con la fascia

Confermata da tenere. Lo stato `fascia` (0/1/2 = pranzo / aperitivo / cena) esiste già
perché pilota la carta menù animata; il fondo diventa un secondo consumatore dello stesso
stato.

**Attenzione**: nel canvas l'hero ha ancora il gradiente caldo (`#2E2636` + radiale ambra)
e i tre gradienti per fascia **non esistono in nessuna board**: vanno disegnati in
Passata 2 sulla notte indaco `SCURO`, non copiati.

**Come**: due o tre layer di gradiente sovrapposti a tutta area, uno per fascia, in
**cross-fade di `opacity`** (1,5–2s). Non interpolare i colori dentro un gradiente: è un
repaint a ogni frame su tutta l'area dell'hero, stessa famiglia di problema del
`backdrop-filter` e delle spring su WebKit già documentata per `PublicSheet`.

**Quando**: nel canvas cicla ogni 3s perché è una demo. Sulla pagina vera deve **partire
sulla fascia che corrisponde all'orario reale del visitatore** — alle otto di sera l'hero è
già su «Cena» — poi fare **un giro completo e fermarsi** sulla fascia reale. Il messaggio
passa, e dopo la pagina sta zitta.

Vale per tutte le animazioni della pagina: **legate all'ingresso in viewport
(`IntersectionObserver`), non al mount**.

### 5.8 L'A/B test

Richiesta dell'agenzia: due landing identiche nel contenuto, una che spinge a **lasciare il
contatto** (form) e una che spinge a **registrarsi**. La misura la fa l'agenzia, non
Lorenzo.

In codice: **una `variante: 'form' | 'signup'`** letta da tutte le CTA (context locale alla
landing, consumato da `LandingCta`), e due route (`/` e `/b`). **Va messa dal primo
giorno**: retrofittarla dopo costa molto di più.

Attenzione, non è solo il form: «Parliamone» compare in almeno **cinque punti** — hero,
barra fissa, le due card dei prezzi, la sezione del rischio, la sezione finale — e nella
variante `signup` diventano tutte «Provalo gratis» → registrazione, più la sezione 10 che
cambia contenuto.

Niente split casuale lato client: nelle webview sfarfalla e sporca l'attribuzione.

`/b` collide con la route pubblica `/:slug`: **prima** che vada in staging serve una
migration che riservi lo slug `b` in `is_reserved_slug()` (oggi non lo è).

**La variante `signup` non si accende** finché il flusso OTP non è verificato dentro una
webview in-app: l'utente deve uscire per leggere il codice e tornare indietro, ed è
esattamente il gesto inaffidabile del §1. Rischi di misurare la fragilità dell'OTP invece
della bontà dell'idea.

## 6. Come partire: tre passate

Concordato il 23/09. **Non** sezione-per-sezione-completa dall'alto in basso: la prima
sezione che incontri è l'hero, cioè la più animata, e dentro l'hero prenderesti per inerzia
tutte le decisioni di fondo che poi ogni altra sezione eredita senza che nessuno le abbia
decise.

**Passata 0 — fondamenta.** Token colore, i due font, il wrapper di pagina (§5.4), il
componente `Section`, la strategia responsive, l'astrazione delle CTA che legge `variante`.
Zero contenuto visivo. Route di sviluppo `/landing-dev` (+ `/b`); `Home` resta su `/`.

> **Stato 23/09**: Passata 0 chiusa, commit `1e122213` su `staging`. Codice in
> `src/pages/CampaignLanding/` (la vecchia `src/pages/Landing/` è la home live e si elimina
> con lo swap). Font self-hosted in `public/fonts/` (`app-campaign.css` + woff2 + `OFL.txt`),
> come Inter. Route `/landing-dev` e `/landing-dev/b`, non limitate a DEV. Token come mixin
> sulla radice di `Frame` (classe con hash: per i selettori usare `[data-landing]`).
> `Highlight` per la parola evidenziata; reset `:where()` contro `_typography.scss`.

**Passata 1 — la pagina intera, statica.** **Primo compito, prima di tutto il resto**: riservare
lo slug `b` in tre posti — migration su `is_reserved_slug()` (letta prima dal DB live con
`pg_get_functiondef`), `RESERVED_SEGMENTS` in `api/ssr-render/index.ts`, esclusione nel rewrite
di `vercel.json`. Senza, `/b` risponde 404 HTTP dall'SSR e la revisione degli annunci Meta lo
rifiuta. Tutte le sezioni, markup e stili definitivi,
**senza animazioni**: i componenti animati nel loro stato di riposo (vetrina ferma su
«Pranzo», card import al passo 3, barre già cresciute, primo pannello aperto). Alla fine
c'è una pagina vera da aprire su un iPhone. Qui lo swap `/` + `/b` e la rimozione di `Home`.

È questa la passata che conta, perché risponde all'unica domanda che il canvas non poteva
rispondere: **come si sente la pagina dentro una webview su un telefono vero.** Se lì si
scopre che è troppo lunga o che il ritmo non regge, si è buttato markup, non animazioni.

**Passata 2 — le animazioni, una alla volta**, in ordine di rischio: vetrina dell'hero,
sheet, nove pannelli, import, analitiche, esempi.

**Dentro la Passata 1: tutti i copy in un file di contenuto unico**, separato dai
componenti — liste dei piani, nove schede, FAQ, testi delle sezioni. Lorenzo ha detto che
«andrà rifinita in tante cose»: così la revisione dei testi è un file solo e la può fare
lui senza toccare markup.

## 7. Vincoli tecnici

Valgono tutte le regole di `CLAUDE.md`. In più, specifiche di questa pagina:

- **La landing sostituisce `Home`** sulla route `/`. Route in `src/App.tsx`, come tutte.
- **Niente provider nuovi.** La landing è pubblica: nessun `TenantProvider`,
  nessun `PermissionsProvider`.
- **Fuori dal bundle admin.** È la pagina che riceve traffico a pagamento: nessun import che
  tiri dentro l'albero della dashboard, route in lazy.
- **SCSS Modules**, mai CSS inline. (Il canvas è tutto inline perché è una simulazione: è
  una specifica, non un sorgente.)
- **`PublicSheet` per lo sheet**, mai `SystemDrawer`.
- **Playwright obbligatorio** se si tocca qualcosa in `src/components/PublicCollectionView/`.
- Il test di performance vero è **solo su iPhone reale in sessione anonima** (Safari serve
  bundle vecchi da cache). Playwright desktop verifica che non ci siano regressioni, non
  che il problema WebKit sia risolto.

## 8. Cosa è ancora aperto

1. **Revisione dei copy.** Lorenzo: «poi i copy li rivaluteremo». Da fare in Passata 1, sul
   file di contenuto.
2. **La foto dell'hero.** Oggi è un gradiente segnaposto. Lorenzo ha scartato l'idea della
   foto vera, quindi il gradiente **non è un buco da riempire**: è la scelta, e il §5.7 ci
   costruisce sopra.
3. **«Parliamone» in fondo alla sezione dei locali demo** — consigliato, mai costruito.
4. **La striscia «torna indietro»** sui tre tenant demo, per chi ci finisce dentro.
5. **Hover** sulle nove schede; **scroll-to-top** del pannello al tocco su mobile.
6. Ancore `#funzioni` / `#faq`; `tel:+39` segnaposto nel footer; rigenerazione dei QR se
   cambiano gli slug.

## 9. Trappole già pagate, da non riscoprire

- **Le altezze delle board non sono l'altezza del contenuto.** Il desktop ha tagliato ~700px
  per giorni senza che si vedesse. È stato costruito un harness Playwright apposta. In
  codice il problema sparisce, ma serve a capire perché certe misure nel canvas sono quelle.
- **Un solo `class Component` per board** nel canvas ⇒ collisioni di identificatori JS fra
  sezioni diverse. Irrilevante in React, ma spiega nomi come `passoA`/`voceOn` invece di
  `pA`/`acceso`.
- **`details[open]`**: il toggle +/− richiede `display:none!important`, altrimenti lo stile
  inline vince.
- **Separatori in CSS Grid multi-colonna**: `:last-child` non basta, serve
  `:nth-last-child(-n+N)` con N = numero di colonne. Già pagata sulla pagina pubblica.
- Il **prezzo in landing** è Base **€ 39** e Pro **€ 59** al mese per sede; in annuale
  390 / 590 con 468 / 708 barrati, e la riga verde «Due mesi gratis: paghi dieci, usi
  dodici.» Va tenuto allineato ai piani veri.

---

**Il primo passo per la chat nuova**: aprire il canvas, premere Play sulle tre board
principali e camminarci dentro. Poi Passata 0.
