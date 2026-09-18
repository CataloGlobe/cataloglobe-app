# Guida installazione stampante Sunmi — flusso approvato

Decisione presa il 17/09/2026, aggiornata il 18/09/2026 (passo 2 spezzato in due).
Implementata in `src/pages/Operativita/Attivita/tabs/printers/components/PrinterGuideModal.tsx`.

Mockup di riferimento: artifact "Guida stampante — 9 passi" (Design canvas). Il mockup
mostra ancora nove passi con "Accendi e collega il cavo" unito: il codice è la fonte
di verità per l'ordine, questo file per le regole.

## Criterio

Un passo = un posto. I confini degli step seguono dove l'utente sta fisicamente
guardando, non il racconto. Ogni passo mostra tutto quello che il suo testo nomina,
quindi un passo può avere più di un'immagine.

## I dieci passi e le loro immagini

Prima c'è una schermata "Prima di iniziare" fuori dal conteggio della barra.

1. Carica la carta — `01-carta.png`
2. Accendi la stampante — `02-interruttore.png`
3. Collega il cavo di rete — `03-retro.png`
4. Stampa il foglio dei dati di rete — `04-tasto.png` + `05-report-ip.png`
5. Apri il pannello della stampante — `06-login.png`
6. Apri la configurazione Wi-Fi — `07-wifi-pagina.png`
7. Scrivi rete e password — `08-wifi-dialogo.png` + callout 2.4 GHz
8. Verifica e togli il cavo — `09-wifi-stato.png`
9. Collega la stampante a CataloGlobe — `10-report-seriale.png`
10. Controlla che sia collegata — `11-card-online.png` + callout Change Password

Il vecchio passo Wi-Fi è spezzato in 6 e 7 perché da solo non stava nel viewport e
il callout 2.4 GHz finiva sotto la piega. Il vecchio "Accendi e collega il cavo" è
spezzato in 2 e 3 per lo stesso motivo: due immagini hardware da ~280px l'una a
430px di larghezza non stanno in un viewport solo.

**Viewport** `.viewport`: `height: 560px; max-height: 75vh`. Misure a 560px con le
immagini reali: solo il passo 4 (due immagini) supera l'altezza e scrolla; tutti gli
altri stanno. Lo scroll viene azzerato a ogni cambio di passo.

## Posizione dell'interruttore (passo 2)

L'interruttore di accensione sta **sul fianco sinistro guardando la stampante di
fronte, in basso** — confermato da Lorenzo sulla stampante fisica e dal manuale Sunmi
(punto 3, "Power Button"). Non è sul retro. Scrivere sempre "guardando la stampante
di fronte": "lato destro della stampante" è ambiguo e ha già generato l'errore.

## Regole per le immagini

Il riquadro immagine nella modale è largo circa 430px.

**Etichette.** Il carattere nativo deve essere almeno dodici volte il rapporto fra
larghezza dell'immagine e larghezza del riquadro. In pratica: immagini hardware a
~860px native con etichette a 25px, in **Poppins Light**, colore `#38383B`, linee
guida grigie `#6E6E73`, pallini e riquadri arancione `#FE7530`.

**Hardware.** Si ricava dal manuale Sunmi a 400 dpi (`pdftoppm -r 400`), non
ritagliando i JPG: i ritagli stretti perdono il contesto e le etichette composte per
il disegno intero restano appese nel vuoto. Per indicare due elementi diversi dello
stesso oggetto si usa la stessa inquadratura due volte con un'etichetta sola ciascuna
(`03-retro.png` e `04-tasto.png`).

**Screenshot.** Vanno tenuti **interi**, non spezzati in ritagli: l'utente deve
ritrovare sul suo schermo quello che vede nella guida, e i frammenti impilati non
corrispondono a niente. Il testo minuscolo non è un problema, perché il riquadro
arancione fa da ancora e la pagina vera ce l'ha davanti a dimensione piena.
Si tolgono solo le zone vuote ai bordi. Eccezione: un dialogo si ritaglia, perché
è un oggetto intero di per sé (`06-login.png`, `08-wifi-dialogo.png`).
**Non rimuovere pulsanti o elementi dall'interfaccia negli screenshot**: produrrebbe
una schermata che non esiste.

**Valori negli screenshot.** Si modificano nel DOM e si riscatta — mai ritoccando
il pixel. Convenzioni fissate: MAC `XX:XX:XX:XX:XX:XX`, seriale `N4XXXXXXXXXXX`,
rete d'esempio `WiFi-Ristorante`, IP Wi-Fi `192.168.1.50`, IP LAN `192.168.1.214`,
nome stampante `Cucina`. Non mettere testo italiano dentro il pannello Sunmi, che
è in inglese: si romperebbe al passo 8, dove `SSID` mostra la rete davvero connessa.

## Struttura del componente

- `GuideStep = { title, body, images?: GuideImage[], after? }`. `body` precede le
  immagini, `after` le segue (callout 2.4 GHz, "se sono vuoti", callout password):
  serve per rispettare l'ordine testo → immagine → avviso del mockup.
- `INTRO` è un `GuideStep` separato da `STEPS`; `pageIndex` 0 = premessa (nessuna
  barra, bottone "Inizia"), 1..10 = passi numerati.
- Reset dello scroll di `.viewport` su cambio di `pageIndex`/`showAll`.
- Immagini: nella vista passo passo quella del passo corrente è `loading="eager"` e
  quelle del passo successivo vengono prefetchate (`new Image().src`) a ogni cambio
  di pagina. `loading="lazy"` solo in "Vedi tutti i passaggi".
- Vista "Vedi tutti i passaggi": premessa senza numero, passi 1–10, poi
  "Se qualcosa non funziona".
- Callout sull'acquisto (stampanti solo dal nostro link) **non** sta nella guida:
  vive in `PrintersSection.tsx` (`.purchaseNote`), visibile solo con `canManage` e
  lista stampanti non vuota — a lista vuota l'empty state ha già "Compra una
  stampante".

## Copy — regole fissate

- "due volte di seguito" per il tasto di configurazione, mai "doppio click".
- Il tasto tenuto premuto oltre tre secondi entra in modalità abbinamento: detto al
  passo 4, perché chi è insicuro preme a lungo.
- Password vuota detta una volta sola (passo 5).
- Niente riferimenti numerici ai passi ("dal passo 3"): si usano i titoli
  («Scrivi rete e password», «Stampa il foglio dei dati di rete»).
- Seriale d'esempio `N4XXXXXXXXXXX`; al passo 7 si dice che nell'esempio la rete si
  chiama `WiFi-Ristorante`.

## Troubleshooting — ordine per fase

1. Non riesco ad aprire il pannello della stampante
2. Ho cambiato router o password del Wi-Fi
3. La stampante era spenta o senza rete
4. Non esce nessuna comanda
5. Si è accesa la spia bianca — rotolo in esaurimento (dal manuale; il contatore
   carta via API non funziona, quindi la spia è l'unico avviso)
6. La stampante stampa fogli bianchi

## Asset (`src/assets/printer-guide/`)

`01-carta.png`, `02-interruttore.png`, `03-retro.png`, `04-tasto.png`,
`05-report-ip.png`, `06-login.png`, `07-wifi-pagina.png`, `08-wifi-dialogo.png`,
`09-wifi-stato.png`, `10-report-seriale.png`, `11-card-online.png`.
I vecchi `01-carta.jpg`, `02-retro.jpg`, `03-report-rete.jpg`, `04-configure-wifi.png`
sono eliminati.
