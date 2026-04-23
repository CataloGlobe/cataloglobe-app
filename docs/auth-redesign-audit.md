# Auth Redesign Audit — Fase 1

> Prodotto: aprile 2026. Read-only. Nessuna modifica al codice.

---

## 1. Stato attuale dei 7 file pagina

| File | Righe | Pattern SCSS | Layout wrapper | Note |
|------|-------|-------------|----------------|------|
| `src/pages/Auth/Login.tsx` | 214 | `Auth.module.scss` (`.auth`) | nessuno | CheckboxInput già presente |
| `src/pages/Auth/SignUp.tsx` | 258 | `Auth.module.scss` (`.auth`) | nessuno | Raw `<input type="checkbox">` per consenso |
| `src/pages/Auth/CheckEmail.tsx` | 51 | `Auth.module.scss` (`.auth`) | nessuno | Nessuna logica, solo copy |
| `src/pages/Auth/EmailConfirmed.tsx` | 127 | `Auth.module.scss` (`.auth`) | nessuno | 4 stati: loading/success/error/already |
| `src/pages/Auth/VerifyOtp.tsx` | 465 | `Auth.module.scss` (`.auth`) | nessuno | Il file più complesso |
| `src/pages/Auth/ForgotPassword.tsx` | 108 | `Auth.module.scss` (`.auth`) | nessuno | Mostra sempre success (no reveal) |
| `src/pages/Auth/ResetPassword.tsx` | 149 | `Auth.module.scss` (`.auth`) | nessuno | Cleanup sessionStorage all'unmount |

**`Auth.module.scss`**: 114 righe. Definisce il container `.auth` (max-width 420px, margin 6rem auto, padding 2rem, white card con shadow). Tutti e 7 i file usano questo file SCSS come unico shared style. Nessun inline CSS nei componenti. ✅ Pattern rispettato.

**AuthLayout**: **non esiste**. Le 7 pagine non hanno un layout wrapper condiviso. Ogni pagina renderizza direttamente il `<div className={styles.auth}>`. Non c'è logo, né footer con link legali.

**SiteLayout** (`src/layouts/SiteLayout/SiteLayout.tsx`): esiste ma è per il sito marketing (`/`). Ha header con nav e footer. Non wrappa le pagine auth.

---

## 2. Componenti UI condivisi rilevanti

### TextInput (`src/components/ui/Input/TextInput.tsx`)
Props utili per il redesign:
- `label`, `error`, `helperText`, `startAdornment`, `endAdornment` (+ `onEndAdornmentClick`)
- `error`: mostra bordo rosso sul campo + testo caption sotto via InputBase ✅
- `helperText`: testo grigio sotto il campo (scompare se c'è `error`) ✅ — usabile per hint password
- `disabled`: gestito ✅

**Mancante**: nessun `type="password"` show/hide built-in. Se la spec richiede toggle visibilità password, serve o estendere TextInput o usare `endAdornment` + `onEndAdornmentClick` (già supportato).

### InputBase (`src/components/ui/Input/InputBase.tsx`)
Render-prop base per tutti gli input. Gestisce label, error, helperText, required asterisk, aria-describedby. Solida — non serve toccarla.

### Button (`src/components/ui/Button/Button.tsx`)
Varianti: `primary`, `secondary`, `outline`, `ghost`, `danger`. `loading` (spinner) e `disabled` già gestiti. `fullWidth` ✅. `leftIcon` / `rightIcon` ✅.

**Mancante**: nessuna variante "warning" o "info" per banner. Il banner errore del login richiesto dalla spec non ha un componente dedicato (vedi §4).

### CheckboxInput (`src/components/ui/Input/CheckboxInput.tsx`)
Props: `label`, `description` (testo muted a destra), `error`, `disabled`. Supporta tutti gli stati. ✅

**Nota**: SignUp usa un raw `<input type="checkbox">` dentro `<label>` con classi `.consentLabel` / `.consentCheckbox` / `.consentText` — stile diverso dal design system. Va migrato a CheckboxInput.

**Nota 2**: CheckboxInput non espone il label in modo inline con link (per "Ho letto la Privacy Policy e i ToS"). Il label di InputBase è un semplice testo. Il consenso con link interni richiede o un `description` con HTML (non supportato) o una soluzione custom. Dettagli in §4.

### Text (`src/components/ui/Text/Text.tsx`)
Varianti: `display`, `title-lg`, `title-md`, `title-sm`, `body-lg`, `body`, `body-sm`, `caption`, `caption-xs`, `button`. colorVariants: `default`, `muted`, `success`, `error`, `warning`, `info`, `primary`. ✅ Copre tutti i casi del design.

### Componente Banner/Alert
**Non esiste.** Gli errori attuali sono `<Text colorVariant="error" variant="caption">`. Il design spec chiede un banner sopra il CTA per errori di credenziali e rate-limit. Questo è un nuovo componente da creare o uno stile aggiuntivo in Auth.module.scss.

### PasswordField
**Non esiste come componente dedicato.** Si usa `TextInput type="password"`. Se vogliamo il toggle show/hide si può usare `endAdornment` + `onEndAdornmentClick` direttamente sulle pagine, senza creare un nuovo componente.

---

## 3. Layout condiviso auth — analisi

**Situazione attuale**: nessun AuthLayout. Il container `.auth` in Auth.module.scss funge da unico denominatore comune visivo. Logo e footer legali non esistono nelle pagine auth.

**Valore di creare un AuthLayout**:
- Logo CataloGlobe in cima (unico punto di aggiornamento futuro)
- Link privacy/termini in fondo (già necessari per il consenso sign-up)
- Selezione lingua (futura)
- Vale la pena: ~30 righe, bassissimo rischio, zero impatto su routing

**Come funzionerebbe**: `AuthLayout` wrappa `children` con logo + contenuto + footer link. Le 7 pagine mantengono il loro `<div className={styles.auth}>` invariato — AuthLayout sta fuori. Non richiede modifica a `App.tsx` se le pagine lo includono internamente (ogni pagina lo usa come wrapper top-level) oppure si aggiunge come Route wrapper in App.tsx (più pulito, ma richiede toccare App.tsx che è out-of-scope per questa iterazione).

**Proposta**: AuthLayout come componente locale incluso direttamente nelle 7 pagine. Non tocca App.tsx.

---

## 4. Copy attuale vs nuovo — delta per schermata

### Login
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Accedi` | `Ciao, bentornato` | ✏️ |
| Sottotitolo | assente | `Accedi per gestire i tuoi cataloghi.` | ➕ |
| Checkbox | `Ricordami` + desc `Accedi in automatico` | `Ricordami su questo dispositivo` | ✏️ |
| Errore credenziali | `<Text caption error>` inline | banner sopra CTA | ✏️ pattern |
| Rate-limit | non distinto dall'errore generico | banner grigio-ambra sopra CTA | ➕ stato |
| CTA | `Accedi` | `Accedi` | ✅ |
| Link sign-up | `Non hai un account? Registrati` | — (da confermare) | — |
| Link forgot | `Password dimenticata?` | `Password dimenticata?` | ✅ |

### SignUp
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Crea il tuo account` | `Crea il tuo account` | ✅ |
| Sottotitolo | `Inserisci i tuoi dati per creare un nuovo account.` | `Inizia gratis, paga solo quando attivi la prima sede.` | ✏️ |
| Campo Telefono | label `Telefono` | label `Telefono · facoltativo` (muted) | ✏️ |
| Consenso | raw `<input type="checkbox">` + label con link | `CheckboxInput` + label con link | ✏️ tecnico |
| CTA disabled | `!termsAccepted` (già) | `!termsAccepted` (già) | ✅ |
| CTA | `Registrati` | `Registrati` | ✅ |

**Problema tecnico consenso**: `CheckboxInput` ha un prop `label` che è solo testo, non accetta JSX con link. Il testo del consenso include `<a href="/legal/privacy">` e `<a href="/legal/termini">`. Opzioni: (a) mantenere il pattern raw `<label>` con stile ridisegnato in Auth.module.scss; (b) usare `CheckboxInput` senza `label` e costruire il testo del consenso come elemento separato accanto. Raccomandazione: tenere pattern custom per il consenso ma ridisegnarlo per allinearlo al design system visivamente.

### CheckEmail
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Conferma la tua email` | `Controlla la tua email` | ✏️ |
| Body principale | `Abbiamo inviato un'email di conferma a <email>.` + paragrafo separato con istruzioni | `Ti abbiamo inviato un link di conferma a <email>. Apri la tua casella e clicca il link per attivare l'account.` | ✏️ |
| Secondario spam | `Non trovi l'email? Controlla anche la cartella spam...` (presente come hint) | `Non trovi l'email? Controlla lo spam o richiedi un nuovo invio.` | ✏️ |
| Torna indietro | assente | `Hai sbagliato indirizzo? Torna indietro` (link) | ➕ |
| CTA | `Vai alla pagina di accesso` (Button primary) | rimosso o ridotto a link? (spec non chiara) | ⚠️ chiarire |

**Nota**: la spec non menziona esplicitamente il CTA "Vai alla pagina di accesso". Da chiarire se rimane o viene sostituito dal solo link "Torna indietro".

### EmailConfirmed
| Stato | Elemento | Attuale | Nuovo | Delta |
|-------|----------|---------|-------|-------|
| `success` | H1 | `Email verificata con successo` | `Email confermata` | ✏️ |
| `success` | Body | `La tua email è stata verificata. Ora puoi accedere al tuo account.` | `Il tuo account è attivo. Ora puoi accedere a CataloGlobe.` | ✏️ |
| `success` | CTA | `Accedi` | `Accedi` | ✅ |
| `success` | Icona | nessuna | check indigo | ➕ |
| `already` | H1 | `Email già verificata` | — (non specificato, da allineare) | ⚠️ |
| `already` | Icona | nessuna | info grigio (distinguere da success) | ➕ |
| `error` | H1 | `Errore nella verifica della email` | — (non specificato) | ⚠️ |
| `error` | Icona | nessuna | info grigio (non check indigo) | ➕ |
| `loading` | H1 | `Verifica della tua email in corso...` | — | — |

**Nota**: la spec corregge la distinzione visiva tra "link già utilizzato/error" (info grigio) e "email confermata" (check indigo). Nessun icon attualmente presente. Lucide React è disponibile.

### VerifyOtp
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Verifica il codice` | `Inserisci il codice` | ✏️ |
| Body | `Inserisci il codice a 6 cifre che ti abbiamo inviato via email.` | `Ti abbiamo inviato un codice di verifica a <email>.` | ✏️ + ⚠️ |
| Label input | nessuna (6 box anonimi) | `Codice a 6 cifre` (testo sopra i box) | ➕ |
| Checkbox Ricordami | assente | `Ricordati di me su questo dispositivo (non richiedere il codice la prossima volta)` | ➕ ⚠️ |
| Countdown | 60s (`RESEND_COOLDOWN = 60`) | 30s | ✏️ |
| Link resend | `Reinvia codice (Xs)` (Button ghost) | `Non hai ricevuto il codice? Invialo di nuovo` + countdown | ✏️ |
| CTA | `Verifica` | `Verifica` | ✅ |

**Problema email personalizzata**: VerifyOtp non riceve l'email come state né la legge da context. Opzioni: (a) leggerla da `supabase.auth.getUser()` all'interno del componente (un useEffect); (b) passarla come state nella navigate da Login. Supabase ha `session.user.email` disponibile via `useAuth()` se l'hook lo espone — attualmente non lo espone.

**Problema checkbox Ricordami**: non c'è nessun meccanismo backend attuale che skippa OTP per sessioni fidate. La checkbox sarebbe **solo visiva** per ora, o richiederebbe implementazione. Da decidere: la includiamo visivamente senza funzione, o la escludiamo? La spec la include — segnalo che richiede un flag aggiuntivo e integrazione con il flow OTP per essere funzionale.

### ForgotPassword
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Recupera password` | `Password dimenticata?` | ✏️ |
| Body | `Inserisci l'indirizzo email associato al tuo account. Se esiste un account, ti invieremo un link...` | `Inserisci la tua email: ti invieremo un link per reimpostare la password.` | ✏️ |
| CTA | `Invia link di recupero` | `Invia link di recupero` | ✅ |
| Link back | `Torna alla pagina di accesso` | `Torna alla login` | ✏️ |
| Stato success body | `Se l'indirizzo email è associato a un account...` | — (da confermare) | ⚠️ |

### ResetPassword
| Elemento | Attuale | Nuovo | Delta |
|----------|---------|-------|-------|
| H1 | `Reimposta password` | `Imposta una nuova password` | ✏️ |
| Sottotitolo | `Inserisci una nuova password per il tuo account.` | `Scegli una password nuova per il tuo account.` | ✏️ |
| Label campo | `Nuova password` | `Nuova password` | ✅ |
| Hint campo | assente | `Minimo 8 caratteri, una maiuscola, un numero.` (helperText) | ➕ |
| Errore campo | `<Text caption error>` sotto form | errore inline sotto campo specifico | ✏️ pattern |
| Strength bar | assente (mai implementata) | assente (spec: rimuovere) | ✅ |
| CTA | `Aggiorna password` | `Aggiorna password` | ✅ |
| Success H1 | `Password aggiornata` | `Password aggiornata` | ✅ |

---

## 5. Stati implementati per schermata

### Login
| Stato | Implementato | Note |
|-------|-------------|------|
| default | ✅ | |
| loading (submit) | ✅ | Button spinner |
| errore generico | ✅ | Text caption error, ma posizionato sopra il CTA già ora |
| rate-limit | ❌ | Stessa logica del generico, non distinto |
| banned/deleted account | ✅ | Box warning personalizzato |
| recovery success | ✅ | |

### SignUp
| Stato | Implementato | Note |
|-------|-------------|------|
| default | ✅ | |
| loading | ✅ | |
| field errors | ✅ | Via TextInput.error (bordi rossi + caption) |
| global error | ✅ | |
| consent disabled | ✅ | `disabled={!termsAccepted}` |

### CheckEmail
| Stato | Implementato | Note |
|-------|-------------|------|
| con email | ✅ | `location.state.email` |
| senza email | ✅ | Fallback senza personalizzazione |
| resend | ❌ | Non implementato |

### EmailConfirmed
| Stato | Implementato | Note |
|-------|-------------|------|
| loading | ✅ | |
| success | ✅ | |
| error (link scaduto) | ✅ | |
| already (già verificata) | ✅ | |
| icone distinzione visiva | ❌ | Tutti gli stati usano solo testo |

### VerifyOtp
| Stato | Implementato | Note |
|-------|-------------|------|
| default | ✅ | |
| loading (verifica) | ✅ | |
| loading (invio) | ✅ | |
| error (codice errato) | ✅ | |
| error (locked) | ✅ | |
| error (rate limited) | ✅ | |
| countdown resend | ✅ | 60s attuale |
| attempts left | ✅ | |
| email personalizzata nel body | ❌ | Non riceve l'email |
| checkbox Ricordami | ❌ | Non implementata |

### ForgotPassword
| Stato | Implementato | Note |
|-------|-------------|------|
| default | ✅ | |
| loading | ✅ | |
| success | ✅ | (sempre, anche su errore) |
| errore (mai visibile) | ✅/❌ | Esiste in codice ma non viene mai mostrato (always success) |

### ResetPassword
| Stato | Implementato | Note |
|-------|-------------|------|
| default | ✅ | |
| loading | ✅ | |
| success | ✅ | |
| errore (link scaduto/generico) | ✅ | |
| validazione < 8 chars | ✅ | |
| validazione maiuscola | ❌ | Non controllata (spec dice hint testuale + errore inline) |
| hint password | ❌ | Mancante (da aggiungere via helperText) |

---

## 6. Token e variabili CSS esistenti

### `src/styles/_variables.scss` — SCSS variables
```scss
$brand-primary: #6366f1;   // indigo — identico al design spec ✅
$brand-dark: #1e1b4b;
$text-color: #1f2937;
$gray-100...$gray-800
$success: #16a34a;
$error: #dc2626;
$warning: #d97706;
$info: #2563eb;
$font-stack: "Inter", system-ui, Avenir, Helvetica, Arial, sans-serif;
```

### `src/styles/_theme.scss` — CSS custom properties
```css
--brand-primary: #6366f1;
--brand-primary-hover: #4648c6;
--bg: #f8fafc;
--text: #0f172a;
--card-bg: #ffffff;
--border: #e2e8f0;
--hover-bg: #f1f5f9;
--color-warning-50/100/200/300/500/700  (amber)
--color-red-50/200/900
```

**Mancanti in `:root`**: non ci sono `--color-error`, `--color-success`, `--color-muted` come CSS custom properties. I componenti (Text, InputBase) usano colori via classi SCSS che referenziano i `$variables`. Nessun problema pratico.

**Mancante per il banner errore**: nessun token per background error-light (tipo `#fef2f2`) o warning-light. Se serve un banner con sfondo colorato, va aggiunto in `_theme.scss` o come variabile locale in Auth.module.scss.

### `src/styles/_typography.scss` — Font base
**⚠️ Attenzione**: `html` e `h1-h6` usano `font-family: var(--preview-font-family, var(--pub-font-family, "Outfit", sans-serif))`. Se `--pub-font-family` non è settato nel contesto auth (è settato solo nella pagina pubblica), le auth pages usano **Outfit come fallback**, non Inter.

`$font-stack` in `_variables.scss` definisce Inter ma non è applicato come CSS custom property globale — è solo usato in componenti specifici che importano le variabili SCSS.

**Impatto**: il design spec dice "Inter only". Per le auth pages, Inter deve essere esplicitamente impostato. Opzioni: (a) aggiungere `font-family: $font-stack` nel `.auth` container di Auth.module.scss; (b) aggiungere `font-family: "Inter", sans-serif` in AuthLayout. Questa è la cosa più semplice da fare.

---

## 7. Componenti nuovi necessari (flag prima di creare)

| Componente | Necessità | Alternativa | Decisione richiesta |
|-----------|-----------|-------------|---------------------|
| `AuthBanner` | Banner errore/warning sopra CTA in Login | Stile aggiuntivo in Auth.module.scss + pattern JSX locale | Da decidere: componente vs SCSS locale |
| `AuthLayout` | Logo + footer legali condivisi | Nessuna (attuale: nessun logo nelle auth) | Raccomandato: sì, scope locale alle pagine |
| `PasswordField` | Show/hide password | `TextInput` con `endAdornment` già supportato | Raccomandato: NO nuovo componente, usare endAdornment |
| Icone EmailConfirmed | Check indigo (success) vs Info grigio (error/already) | Lucide React già installato | Pronto, nessun componente nuovo |

---

## 8. Questioni aperte da confermare prima di Fase 2

1. **CheckEmail CTA**: rimane il Button "Vai alla pagina di accesso" o viene sostituito solo dal link "Torna indietro"?
2. **VerifyOtp email personalizzata**: leggiamo email da `supabase.auth.getUser()` dentro VerifyOtp (un useEffect aggiuntivo), oppure la propaghiamo come state da Login? (preferisco option B: Login passa email a /verify-otp via state, coerente con il pattern di from)
3. **VerifyOtp checkbox Ricordami**: solo visiva (placeholder) o funzionale? Se funzionale richiede implementazione backend.
4. **ForgotPassword success copy**: il copy del success state non è nella spec. Mantengo l'attuale o propongo nuovo copy?
5. **Banner errore Login**: componente separato `AuthBanner.tsx` o pattern SCSS locale in Auth.module.scss? Con il primo sono riusabile ma aggiungo un file; col secondo è zero overhead architetturale.
6. **AuthLayout in App.tsx vs incluso nelle pagine**: modificare App.tsx (out-of-scope per ora) o ogni pagina lo include internamente? Propendo per ogni pagina, ma cambia l'aspetto del file.
7. **Validazione maiuscola in ResetPassword**: la spec dice errore inline "Manca una maiuscola". Va implementata la validazione o solo l'hint testuale?

---

## Riepilogo delta totale

| Schermata | Copy changes | New states | New components/patterns | Technical debt |
|-----------|-------------|------------|------------------------|----------------|
| Login | H1 + subtitle | rate-limit banner | AuthBanner pattern | — |
| SignUp | subtitle + telefono label | — | consenso ridisegnato | raw checkbox → CheckboxInput-style |
| CheckEmail | H1 + body + hint | — | link "torna indietro" | — |
| EmailConfirmed | H1 + body success | icone distinzione | Lucide icons | — |
| VerifyOtp | H1 + body + label + resend | email personalizzata, Ricordami, countdown 30s | label sopra OTP box | email non disponibile |
| ForgotPassword | H1 + body + link | — | — | — |
| ResetPassword | H1 + subtitle + hint | validazione maiuscola | hint helperText | localStorage.removeItem vestigiale |

**Osservazione ResetPassword**: righe 59-62 rimuovono chiavi localStorage (`otpValidated`, `otpSent`, `pendingUserId`, `pendingUserEmail`) che non esistono più nel sistema auth attuale (sono residui di una versione precedente dell'OTP). Non vanno toccate in questo redesign ma segnalate.
