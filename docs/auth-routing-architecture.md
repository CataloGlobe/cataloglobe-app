# Auth Routing Architecture — CataloGlobe

> Prodotto: aprile 2026. Scopo: mappare la macchina a stati del routing auth per diagnosticare ZD-3 (deep link perso dopo OTP).

---

## 1. Guard Components — mappa completa

### 1.1 GuestRoute
**File**: `src/components/Routes/GuestRoute.tsx`
**Wraps**: `/login`, `/sign-up`, `/check-email`, `/forgot-password`

**Inputs letti**:
- `user`, `loading`, `otpVerified`, `otpLoading`, `otpRefreshing` — da `useAuth()`
- `location.state` — da `useLocation()` (atteso: `{ from?: { pathname, search? } }`)
- `sessionStorage["passwordRecoveryFlow"]`

**Decision tree (stato post-fix 458a614)**:
```
isRecovery === "true"      → render children
loading                    → AppLoader
user && otpLoading && !otpRefreshing → AppLoader
user:
  fromPath = location.state?.from?.pathname + search  (converti Location → stringa)
  otpVerified              → Navigate to={fromPath ?? "/workspace"} replace
  !otpVerified             → Navigate to="/verify-otp" state={fromPath ? {from: fromPath} : undefined} replace
no user                    → render children (Login/SignUp/etc.)
```

**State propagato**: `from` come stringa verso `/verify-otp`. Perso se `fromPath` è undefined.

---

### 1.2 OtpRoute
**File**: `src/components/Routes/OtpRoute.tsx`
**Wraps**: `/verify-otp`

**Inputs letti**:
- `user`, `loading`, `otpVerified`, `otpLoading`, `otpRefreshing` — da `useAuth()`
- `location` — da `useLocation()` (usato solo per il ramo `!user`)
- `sessionStorage["passwordRecoveryFlow"]`

**Decision tree (stato attuale — NON modificato)**:
```
isRecovery === "true"                → render children
loading                              → AppLoader
user && otpLoading && !otpRefreshing → AppLoader
!user                                → Navigate to="/login" state={{ from: location }} replace
otpVerified                          → Navigate to="/workspace" replace   ← ⚠️ BUG ZD-3
!otpVerified                         → render children (VerifyOtp)
```

**State propagato**: NESSUNO nel ramo `otpVerified`. `from` hardcoded su `/workspace`.
**Nota critica**: `location.state?.from` è DISPONIBILE qui (è una stringa, passata da Login/GuestRoute), ma non viene letto né propagato.

---

### 1.3 ProtectedRoute
**File**: `src/components/Routes/ProtectedRoute.tsx`
**Wraps**: `/workspace/*`, `/onboarding/*`, `/business/:businessId/*`

**Inputs letti**:
- `user`, `loading`, `otpVerified`, `otpLoading`, `otpRefreshing` — da `useAuth()`
- `location` — da `useLocation()`

**Decision tree**:
```
loading                              → AppLoader
!user                                → Navigate to="/login" state={{ from: location, reason: "login-required" }} replace
otpLoading && !otpRefreshing         → AppLoader
!otpVerified && !otpRefreshing       → Navigate to="/verify-otp" replace   ← ⚠️ no state.from!
render children
```

**State propagato**:
- Verso `/login`: `from` = Location object (pathname + search + state + hash). GuestRoute e Login lo leggono.
- Verso `/verify-otp` (rigo 31): NESSUNO state. Deep link perso se questo path viene percorso.
- Il rigo 31 si attiva solo se `user` esiste ma `otpVerified=false` e `otpRefreshing=false`. Scenario: refresh di pagina con sessione valida ma OTP check ancora pending (race con il bootstrap).

---

### 1.4 RecoveryRoute
**File**: `src/components/Routes/RecoveryRoute.tsx`
**Wraps**: `/reset-password`

**Inputs letti**: `sessionStorage["passwordRecoveryFlow"]`, `supabase.auth.getSession()`, evento `PASSWORD_RECOVERY`

**Decision tree**: check asincrono → `!allowed` → Navigate to `/forgot-password`. Non coinvolto in ZD-3.

---

### 1.5 DashboardRedirect
**File**: `src/components/Routes/DashboardRedirect.tsx`
**Wraps**: `/dashboard/*`

**Inputs letti**: `location.pathname`, `localStorage[TENANT_KEY]`

**Decision tree**: legacy redirect `/dashboard/*` → `/business/:id/*` oppure `/workspace` se nessun tenant. Non coinvolto in ZD-3.

---

## 2. Mappa Route Auth-Sensitive

```
/                              → (nessun guard) → Home
/login                         → GuestRoute → Login
/sign-up                       → GuestRoute → SignUp
/check-email                   → GuestRoute → CheckEmail
/forgot-password               → GuestRoute → ForgotPassword
/verify-otp                    → OtpRoute → VerifyOtp
/reset-password                → RecoveryRoute → ResetPassword
/email-confirmed               → (nessun guard) → EmailConfirmed
/workspace                     → ProtectedRoute → WorkspaceLayout → WorkspacePage/BillingPage/...
/onboarding/create-business    → ProtectedRoute → CreateBusiness
/onboarding/activate-trial     → ProtectedRoute → ActivateTrial
/select-business               → Navigate to="/workspace" (statico)
/business/:businessId/*        → ProtectedRoute → TenantProvider → MainLayout → (pagine business)
/dashboard/*                   → DashboardRedirect (legacy, nessun guard auth)
/invite/:token                 → (nessun guard) → InvitePage
/legal/*                       → (nessun guard) → pagine legali
/:slug                         → (nessun guard) → PublicCollectionPage
*                              → NotFound
```

---

## 3. Comportamento del context AuthProvider

**File**: `src/context/AuthProvider.tsx`

### Init (bootstrap)
1. `supabase.auth.getUser()` → `setUser(data.user)` + `setLoading(false)`
2. Se `user` esiste: `checkOtpForSession("bootstrap")` in background
   - `setOtpLoading(true)` → query DB `otp_session_verifications` → `setOtpVerified(!!data)` + `setOtpLoading(false)`
3. Se `user` è null: `setOtpVerified(false)` + `setOtpLoading(false)`

### onAuthStateChange
- `SIGNED_OUT` → resetta tutto (user=null, otpVerified=false)
- `INITIAL_SESSION` / `TOKEN_REFRESHED` → **ignorati** (non triggerano OTP check)
- Altri eventi (es. `SIGNED_IN`) → `setUser(session.user)` + `checkOtpForSession("refresh")`

### checkOtpForSession("refresh")
- `setOtpRefreshing(true)` → query DB → se data truthy → `setOtpVerified(true)` → `setOtpRefreshing(false)`
- Se data falsy: **non cambia** `otpVerified` (permissivo: non rimuove verifica esistente)

### checkOtpForSession("force") — chiamato da VerifyOtp dopo OTP
- `setOtpRefreshing(true)` → query DB → `setOtpVerified(!!data)` → `setOtpRefreshing(false)`
- Differenza da "refresh": aggiorna otpVerified in entrambi i sensi

### checkOtpForSession("bootstrap")
- `setOtpLoading(true)` → query DB → `setOtpVerified(!!data)` → `setOtpLoading(false)`

---

## 4. Flussi End-to-End

### 4.1 Login senza deep link (utente ricorrente)
```
/login (diretto, no state)
→ GuestRoute: user=null → Login
→ Login: location.state.from = undefined → from = undefined
→ User login → navigate("/verify-otp", { state: { from: undefined } })
→ OtpRoute: !otpVerified → VerifyOtp
→ VerifyOtp: redirectAfterOtp = "/dashboard" (fallback)
→ OTP ok → forceOtpCheck() → otpVerified=true → navigate("/dashboard")
→ DashboardRedirect → /business/:id/overview (se TENANT_KEY presente) o /workspace
```

### 4.2 Login con deep link — scenario ZD-3 (comportamento ATTESO)
```
/business/abc/products (non autenticato)
→ ProtectedRoute: !user → Navigate to="/login" state={{ from: location }}
→ GuestRoute: user=null → Login
→ Login: from = "/business/abc/products"
→ User login → navigate("/verify-otp", { state: { from: "/business/abc/products" } })
→ OtpRoute: !otpVerified → VerifyOtp
→ VerifyOtp: redirectAfterOtp = "/business/abc/products"
→ OTP ok → forceOtpCheck() → otpVerified=true → navigate("/business/abc/products")
→ ProtectedRoute: otpVerified=true → MainLayout → pagina
```

### 4.3 Login con deep link — comportamento REALE (con race conditions)
```
/business/abc/products (non autenticato)
→ ProtectedRoute: !user → Navigate to="/login" state={{ from: location }}
→ /login → GuestRoute: user=null → Login
→ Login: from = "/business/abc/products"
→ User submit form → signIn() → success

  ⚡ RACE 1 (al GuestRoute — RISOLTO in commit 458a614):
  Login vuole: navigate("/verify-otp", { state: { from: "/business/abc/products" } })   [A]
  onAuthStateChange → SIGNED_IN → setUser() → GuestRoute ri-renderizza:
    user=true, otpVerified=false → Navigate to="/verify-otp" state={{ from: "..." }}     [B]  ← Fix: ora propaga from
  [B] vince su [A]: entrambi navigano a /verify-otp CON from. Deep link preservato ✓

→ /verify-otp → OtpRoute: !otpVerified → VerifyOtp
→ VerifyOtp: location.state.from = "/business/abc/products" → redirectAfterOtp = "/business/abc/products"
→ User inserisce OTP → handleVerify() → verify-otp edge function → successo
→ await forceOtpCheck() → setOtpVerified(true)

  ⚡ RACE 2 (al OtpRoute — NON ANCORA RISOLTO):
  VerifyOtp vuole: navigate("/business/abc/products")                                    [C]
  setOtpVerified(true) → OtpRoute ri-renderizza:
    otpVerified=true → Navigate to="/workspace" replace                                  [D] ← BUG
  [D] vince su [C]: utente atterra su /workspace invece del deep link ✗
```

### 4.4 Nuovo utente sign-up
```
/sign-up → GuestRoute → SignUp
→ createUser() → navigate("/check-email")
→ /check-email → GuestRoute → CheckEmail (attende conferma email)
→ Email link → /email-confirmed (nessun guard)
→ (hash con access_token + type=signup) → App.tsx useEffect → navigate("/login")
→ /login → GuestRoute → Login (nessun from, accesso normale)
→ Login → /verify-otp → OTP → /workspace → create-business → Stripe
```

### 4.5 Recupero password
```
/forgot-password → GuestRoute → ForgotPassword → email inviata
→ Email link → Supabase redirect → /reset-password#access_token=...&type=recovery
→ RecoveryRoute: ascolta evento PASSWORD_RECOVERY + sessionStorage flag
→ /reset-password → ResetPassword
→ Dopo reset → navigate("/login") → OTP → workspace
```

### 4.6 Utente "Ricordami" (sessione persistente)
```
App reload → AuthProvider init:
  getUser() → user esiste → setLoading(false) → checkOtpForSession("bootstrap")
  otpLoading=true → ProtectedRoute mostra AppLoader durante check
  DB query → session verificata → setOtpVerified(true) → otpLoading=false
  ProtectedRoute: otpVerified=true → render pagina ✓
Nessuna race: l'utente è già sulla route corretta, nessun redirect di navigazione.
```

---

## 5. Race Conditions Note o Sospette

### RC-1 ⚠️ ATTIVA — OtpRoute hardcoded /workspace (causa ZD-3)
- **Dove**: `OtpRoute`, riga 35–37
- **Trigger**: `forceOtpCheck()` setta `otpVerified=true` → OtpRoute re-renderizza → `Navigate to="/workspace"` prima che VerifyOtp esegua `navigate(redirectAfterOtp)`
- **Effetto**: deep link perso, utente su /workspace
- **Stato**: **non fixata**

### RC-2 ✅ FIXATA — GuestRoute sovrascriveva Login.navigate()
- **Dove**: `GuestRoute`, ramo `!otpVerified`
- **Trigger**: `onAuthStateChange` (SIGNED_IN) → `setUser()` → GuestRoute re-renderizza → Navigate verso /verify-otp SENZA from
- **Fix**: commit 458a614 — GuestRoute ora propaga `fromPath` verso /verify-otp

### RC-3 ⚠️ LATENTE — ProtectedRoute redirige a /verify-otp senza from
- **Dove**: `ProtectedRoute`, riga 30–32
- **Trigger**: utente su route protetta con `user` valido ma `otpVerified=false` e `otpRefreshing=false`
- **Scenario pratico**: refresh di pagina mentre `checkOtpForSession("bootstrap")` non ha ancora completato, MA `otpLoading=false` (anomalia da timeout o crash). In condizioni normali `otpLoading` è true durante il check → AppLoader → questo ramo non si raggiunge.
- **Effetto**: se mai si attivasse, deep link perso verso /verify-otp

### RC-4 ⚠️ LATENTE — OtpRoute.!user con location come from
- **Dove**: `OtpRoute`, riga 30–31
- **Trigger**: utente non loggato accede a /verify-otp
- **Note**: `state={{ from: location }}` passa un oggetto Location, ma Login si aspetta un oggetto `{ from: Location }` (poi lo converte a stringa). Coerente.

### RC-5 ⚠️ POTENZIALE — onAuthStateChange "refresh" sovrascrive otpVerified mid-flow
- **Dove**: `AuthProvider`, listener onAuthStateChange
- **Trigger**: TOKEN_REFRESHED viene **ignorato** (bene). Ma SIGNED_IN triggerga `checkOtpForSession("refresh")` che NON resetta `otpVerified` se la query ritorna null — preserva il valore positivo. Sembra intenzionale e sicuro.
- **Rischio residuo**: se TOKEN_REFRESHED smette di essere ignorato in futuro, potrebbe triggerare un check che interferisce.

---

## 6. Raccomandazioni per Fix ZD-3 Robusto

### Opzione A — Fix chirurgico: correggere OtpRoute (minimo rischio)

**Cosa**: in `OtpRoute`, quando `otpVerified=true`, leggere `location.state?.from` (stringa) e usarla come destinazione.

```tsx
// OtpRoute — ramo otpVerified
if (otpVerified) {
  const fromState = (location.state as { from?: string } | null)?.from;
  const destination = (typeof fromState === 'string' && fromState.startsWith('/') && !fromState.startsWith('//'))
    ? fromState
    : '/workspace';
  return <Navigate to={destination} replace />;
}
```

**Pro**: modifica minima (1 guard, 5 righe), mantiene comportamento attuale su tutti gli altri flussi, rispecchia esattamente il fix già fatto su GuestRoute.

**Contro**: mantiene la logica di "where to redirect" distribuita in 3 posti (Login, GuestRoute, OtpRoute). Se si aggiunge un 4° punto di ingresso, il pattern va replicato ancora.

**Coprirerebbe**: RC-1 (causa diretta ZD-3) ✓

---

### Opzione B — Fix medio: spostare `from` da location.state a sessionStorage

**Cosa**: quando ProtectedRoute redirige a /login, scrivere `sessionStorage["pendingRedirect"] = pathname + search`. Tutti i guard, dopo auth completa, leggono e cancellano questa chiave.

**Pro**: sopravvive ai redirect multipli, non dipende dalla chain di propagazione state, è il pattern usato già per `passwordRecoveryFlow`.

**Contro**: richiede di modificare ProtectedRoute + tutti i guard + VerifyOtp. Surface di modifica ~5 file. Il sessionStorage è condiviso tra tab (potenziale interferenza in multi-tab). Meno "React Router native".

**Coprirerebbe**: RC-1, RC-3 ✓

---

### Opzione C — Refactor architetturale: hook centralizzato `useAuthRedirect`

**Cosa**: estrarre la logica di "dove andare dopo l'auth" in un hook condiviso. Tutti i guard consultano il hook; nessun guard sa nulla di `/workspace` o `/dashboard`.

```typescript
// useAuthRedirect.ts
export function useAuthRedirect() {
  const location = useLocation();

  function getPostAuthDestination(): string {
    // 1. location.state.from (stringa) — passato da Login/GuestRoute/OtpRoute
    // 2. sessionStorage["pendingRedirect"] — fallback persistente
    // 3. "/workspace" — default finale
  }

  function savePendingRedirect(loc: Location) {
    sessionStorage.setItem("pendingRedirect", loc.pathname + (loc.search ?? ''));
  }

  function clearPendingRedirect() {
    sessionStorage.removeItem("pendingRedirect");
  }

  return { getPostAuthDestination, savePendingRedirect, clearPendingRedirect };
}
```

**Pro**: un solo posto per la logica di redirect. Testabile in isolamento. Scalabile a nuovi flussi (social login, magic link, ecc.).

**Contro**: refactor significativo (tutti i guard + ProtectedRoute + VerifyOtp). Introduce un hook con side effect (sessionStorage) che complica il testing dei guard. Over-engineering per il bug attuale.

**Coprirerebbe**: RC-1, RC-2 (già fixata), RC-3, RC-5 ✓

---

### Opzione D — Rimuovere il re-render racing: defer navigate in VerifyOtp

**Cosa**: invece di `await forceOtpCheck()` poi `navigate()`, fare `navigate()` PRIMA e poi `forceOtpCheck()` in background. Oppure usare `flushSync` di React per forzare il navigate prima del re-render di OtpRoute.

```typescript
// VerifyOtp — dopo OTP success:
navigate(redirectAfterOtp, { replace: true }); // prima
void forceOtpCheck(); // poi, in background
```

**Pro**: elimina la race alla radice — OtpRoute viene smontato prima che `otpVerified` diventi true.

**Contro**: rischio di arrivare su ProtectedRoute con `otpVerified=false` ancora → ProtectedRoute redirige a /verify-otp (RC-3). Richiede coordinamento con `otpRefreshing` per evitare il loop. Fragile.

---

### Raccomandazione

**Immediato**: Opzione A (fix chirurgico OtpRoute). Coerente con il fix già fatto, minimo rischio, risolve ZD-3.

**Medio termine**: valutare Opzione B come hardening aggiuntivo se il pattern continua a crescere (nuovi flussi di autenticazione, social login, magic link).

**Non raccomandato ora**: Opzione C (over-engineering per un bug puntuale) e Opzione D (introduce una race diversa).

---

## 7. Stato del Branch

| Branch | Remote | Stato |
|--------|--------|-------|
| `staging` | `origin/staging` | ✅ pushato (include ZD-1 + fix VerifyOtp ZD-3) |
| `fix/zd-3-guestroute-race` | — | locale, non pushato — contiene fix GuestRoute (commit 458a614) |

Il branch `fix/zd-3-guestroute-race` è il punto di partenza per Opzione A: aggiungere la correzione OtpRoute sulla stessa base.
