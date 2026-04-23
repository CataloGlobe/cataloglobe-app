# Audit flusso Auth + Onboarding — CataloGlobe

**Data**: 2026-04-22
**Tipo**: Read-only, nessuna modifica al codice
**Branch**: staging

---

## Fase 1 — Inventario file

### Pagine Auth (`src/pages/Auth/`)

| File | Ruolo |
|------|-------|
| `SignUp.tsx` | Form registrazione: nome, cognome, email, telefono, password, checkbox consenso |
| `Login.tsx` | Form login: email, password, checkbox "Ricordami" (default: true) |
| `CheckEmail.tsx` | Schermata statica "controlla la tua email" post-registrazione |
| `EmailConfirmed.tsx` | Landing del magic link: verifica token, poi redirect a `/login` |
| `VerifyOtp.tsx` | Form inserimento codice OTP 6 cifre, richiede sessione attiva |
| `ForgotPassword.tsx` | Form recupero password: invia email con link reset |
| `ResetPassword.tsx` | Form nuova password: guarded da `RecoveryRoute`, chiude sessione dopo reset |

### Pagine Onboarding (`src/pages/Onboarding/`)

| File | Ruolo |
|------|-------|
| `CreateBusiness.tsx` | **Deprecato** — redirige a `/workspace` con `<Navigate replace />` |
| `ActivateTrial.tsx` | Schermata Stripe checkout alternativa (usata come fallback o via URL diretto con `?tenantId=`) |
| `SelectBusiness.tsx` | **Dead code** — la route `/select-business` redirige a `/workspace`; file non raggiungibile |

### Routing (`src/App.tsx`)

Route auth e onboarding rilevanti (righe 86–171):

```
/login               → GuestRoute → Login
/sign-up             → GuestRoute → SignUp
/check-email         → GuestRoute → CheckEmail
/email-confirmed     → (no guard) → EmailConfirmed
/forgot-password     → GuestRoute → ForgotPassword
/reset-password      → RecoveryRoute → ResetPassword
/verify-otp          → OtpRoute → VerifyOtp
/workspace           → ProtectedRoute → WorkspaceLayout → WorkspacePage
/onboarding/create-business  → ProtectedRoute → CreateBusiness (→ Navigate /workspace)
/onboarding/activate-trial   → ProtectedRoute → ActivateTrial
/select-business     → Navigate /workspace (redirect fisso)
/dashboard           → DashboardRedirect (legacy compat)
/business/:businessId → ProtectedRoute → TenantProvider → MainLayout
```

`GuestRoute`: se utente già loggato (con OTP), redirige a `/workspace`; se loggato ma OTP non verificato, redirige a `/verify-otp`.
`ProtectedRoute`: richiede utente + OTP verificato; se OTP mancante → `/verify-otp`.
`OtpRoute`: accessibile solo se utente loggato ma OTP non ancora verificato.
`RecoveryRoute`: verifica evento `PASSWORD_RECOVERY` da Supabase e flag `sessionStorage.passwordRecoveryFlow`.

### Context

| File | Ruolo |
|------|-------|
| `src/context/AuthProvider.tsx` | Stato `user`, `loading`, `otpVerified`, `otpLoading`. Bootstrap via `getUser()` + query su `otp_session_verifications`. Listener `onAuthStateChange`. |
| `src/context/TenantProvider.tsx` | Carica `user_tenants_view`, deriving `selectedTenant` dall'URL `:businessId`. Monta solo su `/business/:businessId`. Se zero tenants o tenant non trovato → redirect `/workspace`. |

### Service layer

| File | Ruolo |
|------|-------|
| `src/services/supabase/auth.ts` | `signUp()`, `signIn()`, `signOut()`, `resetPassword()`, `getCurrentUser()` |
| `src/services/supabase/consent.ts` | `recordConsent(userId)` — inserisce 2 record in `consent_records` (privacy_policy + terms_of_service) |
| `src/services/supabase/billing.ts` | `createCheckoutSession(tenantId, successUrl, cancelUrl, seats)` — chiama edge function `stripe-checkout` |

### Edge Functions

| Funzione | `@ts-nocheck` | Ruolo |
|----------|---------------|-------|
| `send-otp/index.ts` | ✅ sì | Genera OTP 6 cifre, hash SHA-256+pepper, inserisce in `otp_challenges`, invia email via Resend. TTL 5 min, cooldown 60s, max 5 invii/15 min, lock 15 min. |
| `verify-otp/index.ts` | ✅ sì | Verifica hash OTP, marca `consumed_at`, inserisce in `otp_session_verifications` (session_id + user_id). Max 5 tentativi, poi lock 15 min. |
| `status-otp/index.ts` | sì (presumibile) | Restituisce stato challenge attiva: `resend_available_in`, `attempts_left`, `locked`, `max_attempts`. |

### Migrations rilevanti

| File | Contenuto |
|------|-----------|
| `20260309000000_v2_phase1_multi_tenant.sql` | Schema principale tenants, memberships |
| `20260311090000_profiles_add_user_details.sql` | Trigger `handle_new_user`: crea `profiles` da `auth.users` con `first_name`, `last_name` (non phone) |
| `20260311123000_profiles_handle_new_user_phone.sql` | Estensione trigger con phone |
| `20260422094711_create_consent_records.sql` | Tabella `consent_records`, RLS: `user_id = auth.uid()` |

---

## Fase 2 — Tracciamento end-to-end

### 2.1 Nuovo utente — sign-up completo

**Step 1 — `/sign-up` (SignUp.tsx)**
- Componente: `SignUp`, route guarded da `GuestRoute`
- Campi: Nome (**required**, frontend), Cognome (**required**), Email (**required**), Telefono (facoltativo, no `required`, `|| null`), Password (min 8, **required**), Conferma password, Checkbox privacy+termini (**disabilita il pulsante submit** se non spuntato, ma NON validato nel codice form)
- Submit: `signUp(email, password, { first_name, last_name, phone })` → `supabase.auth.signUp({ email, password, options: { data: {...}, emailRedirectTo: origin + "/email-confirmed" } })`
- Effetti collaterali DB al submit:
  - Supabase crea `auth.users` row
  - Trigger `handle_new_user` → crea `public.profiles` con `first_name`, `last_name`
  - **Tentativo** di `recordConsent(user.id)` → vedi ⚠️ zona d'ombra §4.1
- Email inviata: email di conferma con link verso `${origin}/email-confirmed`
- Redirect: `navigate("/check-email", { state: { email } })`

**Step 2 — `/check-email` (CheckEmail.tsx)**
- Schermata statica: "Abbiamo inviato un'email di conferma a [email]"
- Pulsante: link ad `href="/login"`
- Nessuna chiamata a Supabase. Route `GuestRoute`.

**Step 3 — click link email → `/email-confirmed` (EmailConfirmed.tsx)**
- Nessun route guard (App.tsx riga 123)
- URL in arrivo: `/email-confirmed?confirmation_url=<encoded_supabase_url>`
- Logic nel `useEffect`:
  1. `supabase.auth.getSession()` — se sessione già attiva → stato `"already"` → bottone "Vai alla dashboard" → `navigate("/workspace")`
  2. Altrimenti: estrae `confirmation_url` dai query params, decodifica, estrae `token_hash` e `type`
  3. `supabase.auth.verifyOtp({ token_hash, type })` — Supabase verifica il token e **crea sessione attiva**
  4. Su successo → stato `"success"` → mostra "Email verificata con successo" + bottone **"Accedi"** → `navigate("/login")`
  5. Su errore → stato `"error"` → "Il link potrebbe essere scaduto"

**⚠️ Comportamento critico**: nonostante la sessione venga creata da `verifyOtp()`, la pagina **non sfrutta** questa sessione. L'utente viene mandato a `/login` e deve fare login manualmente.

**Step 4 — `/login` (Login.tsx)**
- Campi: email, password, checkbox "Ricordami" (default `true`)
- `signIn(email, password, { rememberMe })`:
  - `setRememberMe(rememberMe)` — imposta persistenza localStorage/sessionStorage nel client Supabase
  - `supabase.auth.signInWithPassword({ email, password })`
- Su successo: `navigate("/verify-otp", { state: { from } })` — **sempre, senza eccezioni**

**Step 5 — `/verify-otp` (VerifyOtp.tsx)**
- Route `OtpRoute`: richiede utente loggato + OTP non ancora verificato
- Al mount: chiama `status-otp` per sapere cooldown; se `resendSeconds === 0` → chiama `send-otp` automaticamente
- `send-otp`: genera OTP 6 cifre, salva hash in `otp_challenges`, invia email via Resend
- Utente inserisce codice → `verify-otp`:
  - Verifica hash (SHA-256 + pepper)
  - Su match: `otp_challenges.consumed_at = now`, INSERT in `otp_session_verifications { session_id, user_id, verified_at }`
- Su successo: `forceOtpCheck()` → `otpVerified = true` → `navigate("/dashboard", { replace: true })`

**Step 6 — `/dashboard` → `DashboardRedirect`**
- Legge `TENANT_KEY` da localStorage
- Se nessun tenant salvato → `<Navigate to="/workspace" />`
- Se tenant salvato → `<Navigate to="/business/:id/overview" />`

**Step 7 — `/workspace` (WorkspacePage.tsx) — primo accesso nuovo utente**
- `ProtectedRoute` ok (user + otpVerified)
- Nessun `TenantProvider`
- Carica `user_tenants_view` → array vuoto per nuovo utente
- Mostra: "Le tue attività" + griglia vuota + pulsante **"Crea attività"** (card con `+`)
- Fetch anche: `my_pending_invites_view`, `v2_notifications`

**Step 8 — Crea attività → `CreateBusinessDrawer`**
- Apertura: click su card "Crea attività" → `setDrawerOpen(true)`
- Campi: Nome attività (required), Tipo attività (select, default da `DEFAULT_SUBTYPE`), Logo (opzionale), N. sedi (number, default 1)
- Submit `handleCreateSubmit`:
  1. `supabase.from("tenants").insert({ owner_user_id: user.id, name, vertical_type: "food_beverage", business_subtype: subtype })`
  2. Upload logo opzionale (non bloccante)
  3. `localStorage.setItem(TENANT_KEY, data.id)`
  4. `createCheckoutSession(tenantId, successUrl, cancelUrl, seats)` → chiama edge function `stripe-checkout`
  5. `window.location.href = checkoutUrl` → redirect a Stripe
- Su errore Stripe: fallback a `window.location.href = /business/${data.id}/subscription`
- Su annulla Stripe: `cancelUrl = ${origin}/workspace`
- Su successo Stripe: `successUrl = ${origin}/business/${data.id}/overview`

**⚠️ Nota**: `vertical_type` è hardcoded a `"food_beverage"` per tutti i nuovi tenant (riga 84 di CreateBusinessDrawer.tsx). Non c'è selezione verticale nel form.

---

### 2.2 Nuovo utente — creazione prima attività (flusso già descritto sopra)

Riepilogo: il tenant non viene creato durante sign-up né durante email confirm né durante login. Viene creato in `WorkspacePage` tramite `CreateBusinessDrawer`, dopo che l'utente ha completato l'intero flusso sign-up + email confirm + login + OTP.

La route `/onboarding/create-business` è deprecata e redirige a `/workspace`. La route `/onboarding/activate-trial` è una pagina alternativa di checkout accessibile con `?tenantId=<uuid>`.

---

### 2.3 Utente esistente — login normale

**Utente con tenant e attività:**
1. `/login` → credenziali → `/verify-otp` → OTP → `/dashboard`
2. `DashboardRedirect`: legge `TENANT_KEY` da localStorage → se presente → `/business/:id/overview`
3. Se non presente in localStorage ma tenants esistono: `/workspace` → TenantProvider non attivo qui → utente vede la lista e sceglie

**Utente con tenant ma zero attività (sede):**
- Stessa navigazione → `/business/:id/overview`
- Overview mostra stato vuoto, ma il tenant esiste
- Le sedi si gestiscono in `/business/:id/locations`

**Utente senza tenant:**
1. `/dashboard` → `DashboardRedirect` → nessun `TENANT_KEY` → `/workspace`
2. WorkspacePage mostra lista vuota + "Crea attività"

**Utente con `businessId` in URL ma tenant non in lista:**
- `TenantProvider` effect 2: `!selectedTenant` → `navigate("/workspace", { replace: true })`

---

### 2.4 Utente esistente — recupero password

**Step 1 — `/forgot-password` (ForgotPassword.tsx)**
- Inserisce email → `resetPassword(email)` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`
- Risposta sempre positiva in UI (no reveal se email esiste)
- Email inviata: link di reset verso `/reset-password` con token in hash

**Step 2 — click link email → `/reset-password` (RecoveryRoute)**
- `RecoveryRoute` ascolta evento `PASSWORD_RECOVERY` da Supabase (⚡ emesso quando il link viene aperto con token valido)
- Supabase autentica l'utente e emette evento `PASSWORD_RECOVERY` → `sessionStorage.setItem("passwordRecoveryFlow", "true")`
- Se flag + sessione → `allowed = true` → mostra `ResetPassword`
- Senza flag/sessione → redirect a `/forgot-password`
- **Sessione Supabase**: attiva (l'utente è autenticato) ma `GuestRoute`/`ProtectedRoute` la bypassano perché `isRecovery = true`

**Step 3 — `ResetPassword.tsx`**
- Campi: nuova password + conferma (min 8)
- `supabase.auth.updateUser({ password })`
- Su successo:
  - `sessionStorage.removeItem("passwordRecoveryFlow")`
  - Pulizia chiavi localStorage legacy OTP (`otpValidated`, `otpSent`, `pendingUserId`, `pendingUserEmail`)
  - `supabase.auth.signOut()` — **logout forzato**
  - Mostra "Password aggiornata" + bottone "Accedi" → `navigate("/login")`

**Risultato**: dopo reset password l'utente deve fare login manuale (nessun login automatico).

---

## Fase 3 — Verifica questioni specifiche

### 3.1 Conferma account: magic link o OTP manuale?

**Magic link Supabase** (non OTP manuale al sign-up).

- `signUp()` usa `emailRedirectTo: origin + "/email-confirmed"` (auth.ts:15)
- L'email contiene un link che porta l'utente a `/email-confirmed?confirmation_url=...`
- `EmailConfirmed.tsx` chiama `supabase.auth.verifyOtp({ token_hash, type })` — questo è l'SDK Supabase che verifica il token del magic link, non un codice OTP inserito dall'utente

### 3.2 La route `/verify-otp` è in uso nel flusso di sign-up?

**No**. `/verify-otp` è usata **solo nel flusso di login** (post `signInWithPassword`), non nel flusso di sign-up.

Scopo: secondo fattore di autenticazione (2FA via email) per ogni sessione di login. È obbligatoria: `Login.tsx` riga 74 redirige **sempre** a `/verify-otp` dopo un login riuscito.

Trigger: `send-otp` edge function invia un codice via Resend. `verify-otp` verifica e registra in `otp_session_verifications`.

`ProtectedRoute` controlla `otpVerified` — se `false` → redirect a `/verify-otp`. Non c'è modo di bypassare l'OTP nelle route protette (salvo `RecoveryRoute` che usa flag sessionStorage).

### 3.3 Dopo click link email, l'utente è loggato automaticamente?

**No.**

`EmailConfirmed.tsx` chiama `supabase.auth.verifyOtp()` che tecnicamente crea una sessione Supabase. Tuttavia, su successo mostra solo "Email verificata" + bottone "Accedi" che chiama `navigate("/login")` (riga 95). L'utente è rimandato al login.

**Unica eccezione**: se l'utente ha già una sessione attiva al momento del click (raro), mostra "Email già verificata" + bottone "Vai alla dashboard" → `navigate("/workspace")`.

### 3.4 In quale momento viene creato il tenant?

**In `/workspace`**, non prima.

Sequenza precisa:
1. Sign-up → email confirm → login → OTP → `/workspace`
2. Utente clicca "Crea attività" → `CreateBusinessDrawer`
3. Submit → `supabase.from("tenants").insert(...)` (CreateBusinessDrawer.tsx:82–86)

Non esiste creazione automatica di tenant durante sign-up, email confirmation, o login. Non c'è trigger DB che crei tenant.

### 3.5 In quale momento viene chiesta la carta di credito?

**Immediatamente dopo la creazione del tenant**, nella stessa richiesta di submit di `CreateBusinessDrawer`.

Flusso esatto (CreateBusinessDrawer.tsx:79–116):
1. INSERT tenant → ottiene `data.id`
2. Upload logo (opzionale, non bloccante)
3. `createCheckoutSession(data.id, ...)` → `stripe-checkout` edge function
4. `window.location.href = checkoutUrl` → redirect a Stripe

Se `createCheckoutSession` fallisce: fallback a `/business/${data.id}/subscription` (riga 110).

`ActivateTrial.tsx` è una pagina separata che può fare la stessa cosa con `?tenantId=` in URL, usata come fallback o link diretto.

### 3.6 La login supporta "Ricordami"? Durata sessione?

**Sì**, con checkbox visibile e funzionante.

- `Login.tsx` riga 20: `rememberMe` default `true`
- `signIn()` chiama `setRememberMe(options.rememberMe)` prima di `signInWithPassword`
- `setRememberMe` nel client Supabase: quando `true` → persistenza localStorage (sopravvive alla chiusura del browser), quando `false` → sessionStorage (persa alla chiusura del tab)
- Durata JWT Supabase: default 1 ora (access token), refresh token a lungo termine se rememberMe=true

### 3.7 Il campo "telefono" è opzionale?

**Sì, sia nel form che nel DB.**

- Form: `TextInput` senza `required` (SignUp.tsx:183–190)
- Logica: `phone: phone.trim() || null` (riga 77) — stringa vuota diventa `null`
- Nessuna validazione formato (es. regex tel)
- DB: passato come user metadata (`raw_user_meta_data`), poi estratto dal trigger `handle_new_user` in `profiles.phone` (migration `20260311123000`)
- RLS `profiles`: solo owner può leggere/aggiornare il proprio profilo

---

## Fase 4 — Gap analysis

Confronto vs flusso desiderato:

```
1. /sign-up              → ✅ Funziona già così
2. /check-email          → ✅ Funziona già così
3. [click link email]    → ❌ NON funziona così
4. /workspace            → 🟡 Funziona ma con percorso diverso
5. Crea attività → Stripe → 🟡 Funziona ma con differenze
6. Dashboard attività    → ✅ Funziona già così
```

### Step 1 — `/sign-up`
**✅ Funziona** — campi identici a quelli desiderati.
Differenze minori:
- Checkbox unica per privacy + termini (non due checkbox separate)
- `recordConsent()` registra 2 record nonostante la checkbox sia unica
- ⚠️ `recordConsent()` probabilmente fallisce silenziosamente (vedi Zona d'ombra §1)

### Step 2 — `/check-email`
**✅ Funziona** — schermata identica a quanto desiderato.

### Step 3 — `[click link email] → login automatico → /workspace`
**❌ Non funziona così.**

Cosa fa invece:
1. Click link → `/email-confirmed`
2. Verifica token → mostra "Email verificata con successo"
3. Bottone "Accedi" → `navigate("/login")` — **login manuale richiesto**
4. Login → `/verify-otp` — **OTP obbligatorio**
5. Solo dopo OTP → `/dashboard` → (se no tenant) `/workspace`

Il flusso desiderato prevede login automatico post-conferma. Oggi NON avviene. L'utente deve:
a) tornare a `/login` manualmente
b) inserire di nuovo email + password
c) completare OTP 6 cifre via email

### Step 4 — `/workspace` — "nessuna attività, creane una"
**🟡 Funziona ma con percorso diverso.**

- `/workspace` mostra la lista tenants + il pulsante "Crea attività" se lista vuota → ✅ comportamento corretto
- Ma ci si arriva solo dopo il giro completo sign-up → email confirm → login manuale → OTP → /dashboard → /workspace (non direttamente post-email-confirm)
- UI: il pulsante "Crea attività" è sempre visibile anche se ci sono altri tenant (è una card `+` in fondo alla griglia)

### Step 5 — Crea attività → redirect su Stripe → trial
**🟡 Funziona ma con differenze.**

- Stripe checkout: ✅ attivato subito dopo la creazione del tenant
- Trial 30 giorni: ✅ menzionato nel form ("Primi 30 giorni gratuiti") e in `ActivateTrial.tsx`
- Differenza: non c'è una route `/onboarding/create-activity` dedicata. La creazione avviene via drawer in `/workspace`. `/onboarding/create-business` redirige a `/workspace`.
- `vertical_type` è hardcoded `"food_beverage"`: non c'è selezione del verticale
- Dopo cancellazione Stripe → `/workspace` (non `cancelUrl=/onboarding/activate-trial` — quella è usata solo da `ActivateTrial.tsx`, non dal drawer principale)

### Step 6 — Dashboard attività funzionante
**✅ Funziona** — dopo Stripe success_url → `/business/:id/overview`.

---

## Zone d'ombra

### ZD-1 — `recordConsent()` funziona davvero post-sign-up?

**Dubbio**: `consent_records` ha RLS `INSERT WITH CHECK (user_id = auth.uid())`. Al momento del sign-up con email confirmation abilitata, `supabase.auth.signUp()` restituisce `data.session = null` (nessuna sessione attiva finché l'email non è confermata). Senza sessione, `auth.uid()` = null nel DB, e l'INSERT fallisce con violazione RLS.

Il catch di `recordConsent()` in `SignUp.tsx` riga 104 logga solo `console.error` senza mostrare errori all'utente e senza bloccare il flusso. **Il consenso potrebbe non essere mai registrato per i nuovi utenti.**

Verifica necessaria: controllare in Supabase Studio se ci sono record in `consent_records` per utenti registrati di recente.

### ZD-2 — Hash-based redirect legacy in `App.tsx`

`App.tsx` righe 67–81: gestisce il caso in cui Supabase manda il token di conferma nel fragment URL (`#access_token=...&type=signup`). Questo è il comportamento delle versioni precedenti di Supabase; la versione attuale usa `?confirmation_url=...`. Il codice è probabilmente morto ma innocuo.

### ZD-3 — `from` redirect perso in OTP

`Login.tsx` cattura `location.state?.from` e lo passa a `navigate("/verify-otp", { state: { from } })`. Ma `VerifyOtp.tsx` non usa `useLocation()` né legge `from` dallo state: dopo OTP naviga sempre a `navigate("/dashboard", { replace: true })`, ignorando la destinazione originale.

Impatto: se un utente non autenticato tenta di accedere a `/business/abc/products`, viene mandato a `/login` con `from=/business/abc/products`. Dopo login + OTP, non torna a `/business/abc/products` ma a `/dashboard` (poi a `/workspace` o all'ultimo tenant in localStorage). Il deep link è rotto.

### ZD-4 — `SelectBusiness.tsx` querizza `tenants` direttamente (senza view)

`SelectBusiness.tsx` riga 21: `supabase.from("tenants").select(...)` — accede direttamente alla tabella, non alla view `user_tenants_view`. Questo significa che i membri del team (non owner) che accedessero a questa pagina non vedrebbero i tenant dove sono invitati. Tuttavia, la pagina è irraggiungibile (route `/select-business` → redirect).

### ZD-5 — OTP edge functions: `// @ts-nocheck`

Entrambe le edge functions `send-otp/index.ts` e `verify-otp/index.ts` iniziano con `// @ts-nocheck` (righe 1 di entrambi). Richiesto dall'audit: segnalato ma non corretto.

### ZD-6 — Sessione OTP e "Ricordami"

Se `rememberMe = false`, la sessione Supabase viene persa alla chiusura del tab. `otp_session_verifications` rimane nel DB ma la sessione non esiste più. Al prossimo accesso, l'utente deve rifare login + OTP da capo. Il cooldown OTP (60s) potrebbe causare attrito se l'utente cerca di fare login subito dopo aver chiuso il browser.

### ZD-7 — Comportamento `EmailConfirmed` se utente ha sessione OTP già valida

Se l'utente è già loggato con OTP verificato e clicca il link di conferma email (es. da un secondo device), `EmailConfirmed.tsx` riga 16 trova `sessionData.session` attiva → stato `"already"` → mostra "Email già verificata" + bottone "Torna alla dashboard" → `navigate("/workspace")`. Questo bypassa l'intera verifica del token. Il comportamento è corretto funzionalmente ma potrebbe confondere.

---

## Riepilogo delle lacune rispetto al flusso desiderato

| Gap | Impatto | Dove |
|-----|---------|------|
| Post-email-confirm: login manuale richiesto | Alto — aggiunge 2 step (login + OTP) | `EmailConfirmed.tsx:95` |
| OTP obbligatorio ad ogni login | Medio — dipende dal prodotto, ma aggiunge frizione | `Login.tsx:74`, `ProtectedRoute.tsx:30–31` |
| Deep link perso dopo OTP | Medio | `VerifyOtp.tsx:342` |
| `recordConsent()` fallisce silenziosamente | Alto (compliance) | `SignUp.tsx:103`, `consent.ts:20` |
| `vertical_type` hardcoded | Basso | `CreateBusinessDrawer.tsx:84` |
| `CreateBusiness.tsx` deprecato ma non rimosso | Basso (manutenzione) | `pages/Onboarding/CreateBusiness.tsx` |
| `SelectBusiness.tsx` dead code | Basso (manutenzione) | `pages/Onboarding/SelectBusiness.tsx` |
