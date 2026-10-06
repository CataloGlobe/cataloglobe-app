# WS5 · Saltare il Workspace con una sola attività (analisi)

Analisi in sola lettura per T18 di `docs/correzioni-ui-piano.md`. Nessuna modifica al codice. Base: ramo `ui/t17` (Workspace senza sidebar, T17).

## Flusso di oggi dopo il login

1. `/login` (`pages/Auth/Login.tsx:65-71`): passa `from` a `/verify-otp` solo se si arriva da una route protetta (`location.state.from`). Se si apre `/login` direttamente, `from` è vuoto.
2. `/verify-otp` (`pages/Auth/VerifyOtp.tsx:170-171`): dopo l'OTP va a `from` se è un percorso interno, altrimenti a `/dashboard`.
3. `/dashboard` (`components/Routes/DashboardRedirect.tsx:35-48`): se in localStorage c'è l'ultima azienda (`TENANT_KEY`) va a `/business/:id`, altrimenti a `/workspace`.
4. Già loggati e verificati:
   - chi apre `/verify-otp` va sempre a `/workspace` (`components/Routes/OtpRoute.tsx:36`);
   - chi apre `/login` va sempre a `/workspace` (`components/Routes/GuestRoute.tsx:29`).
5. In `/business/:id`, se l'azienda non è fra quelle dell'utente, `TenantProvider.tsx:83-91` rimanda a `/workspace`. Se non è attivata, `MainLayout.tsx:260` rimanda a `/workspace?resume=:id`.

In pratica:
- **sullo stesso browser** chi torna salta già il Workspace, grazie a `TENANT_KEY`;
- lo vede chi entra da un dispositivo nuovo, dopo aver svuotato i dati del sito, o passando da `/login` o `/verify-otp` già loggato.

## Proposta

Una regola sola, in un componente `HomeRedirect` che sostituisce le tre uscite fisse verso `/workspace`:

- **Si va a `/business/:id`** se valgono tutte e tre:
  - l'utente ha esattamente **una** attività leggibile (`user_tenants_view`, la stessa lista del Workspace);
  - quell'attività è **attivata** (`stripe_subscription_id` presente);
  - **non** ci sono inviti in attesa (`listMyPendingInvites`).
- **Altrimenti si va a `/workspace`**, come oggi.
- **Con `TENANT_KEY` valido** si resta come oggi (`/business/:id`). Valido significa che l'id è nella lista.

Il Workspace resta raggiungibile da:
- **il selettore dell'azienda nella testata**, che ha già «Workspace» (`HeaderTenantSwitcher.tsx:46-49`);
- **il menu dell'avatar**, dove si propone una voce «Le tue attività» sopra «Account». Oggi «Account» porta al Workspace (`/workspace/account`) ma non alla lista.

Il logo continua a portare all'inizio dell'azienda (`HeaderLogo.tsx:19`), non al Workspace: un utente con una sola attività non deve tornare alla porta per sbaglio.

## Punti da toccare

1. **Nuovo `components/Routes/HomeRedirect.tsx`.** Legge la lista e gli inviti con un loader (`AppLoader intent="auth"`), poi decide come sopra.
2. **Le tre uscite verso il nuovo componente:**
   - `OtpRoute.tsx:36` va a `HomeRedirect`;
   - `GuestRoute.tsx:29`, se `otpVerified`, va a `HomeRedirect`;
   - `DashboardRedirect.tsx:39-41`, senza `TENANT_KEY`, va a `HomeRedirect` invece di `/workspace`.
3. **`HeaderUserMenu.tsx`:** la voce «Le tue attività» va a `/workspace`.
4. **e2e**
   - `global-setup.ts:31,37` aspetta `/(workspace|business\/)`: va già bene.
   - `business.ts` entra dal Workspace: resta valido, perché va a `/workspace` in modo esplicito.
   - Nuovo test: utente con una sola attività, il login porta a `/business/:id`. Serve un utente e2e con una sola attività attivata, quindi una richiesta a chi gestisce gli utenti di staging.

## Rischi

- **Deep link perso.** `GuestRoute` e `OtpRoute` ignorano `location.state.from`: chi è già loggato e apre un link profondo passando da `/login` finisce comunque alla home. Succede già oggi. `HomeRedirect` deve rispettare `from` quando c'è, non peggiorare il caso.
- **Ruoli limitati.** Nella vista manager, staff e sola lettura hanno `user_role` nullo (`utils/workspaceRole.ts`). Con una sola attività entrano dall'indice dell'azienda (`BusinessHomeRedirect`, D1), che li porta alla sede. Da verificare: un ruolo limitato senza sedi assegnate non deve finire in una pagina vuota. In quel caso conviene restare sul Workspace.
- **Attività in eliminazione.** Non sono nella vista attiva (`get_my_deleted_tenants` a parte). Con una attiva e una in eliminazione si salta il Workspace e il «Ripristina» si vede solo andandoci. Proposta: se ci sono attività in eliminazione, restare sul Workspace.
- **Attività non attivata.** Senza `stripe_subscription_id`, `MainLayout` rimanda a `/workspace?resume=`. La regola lo esclude già, e così si evita il doppio salto.
- **`TENANT_KEY` vecchio.** Se resta l'id di un'attività lasciata o eliminata, `TenantProvider` rimanda a `/workspace` (oggi). Con `HomeRedirect` conviene controllare l'id contro la lista prima di usarlo.
- **Una query in più al login.** Lista e inviti si leggono prima del primo disegno. Sono le stesse due letture che il Workspace fa comunque, quindi nessun costo nuovo, solo spostato.

## Da decidere (Lorenzo)

- Restare sul Workspace se ci sono attività in eliminazione o inviti in attesa? (Consigliato: sì, entrambi.)
- Voce «Le tue attività» nel menu dell'avatar? (Consigliato: sì.)
