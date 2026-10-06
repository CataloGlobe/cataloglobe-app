# Route — CataloGlobe

Riferimento route applicazione. Tutte definite in `src/App.tsx`, tranne le route pubbliche slug-based, definite in `src/routes/publicRoutes.tsx` e consumate da `App.tsx` e `src/entry-client.tsx`.

```
/                          → Landing di campagna, variante form (CampaignLanding)
/b                         → Landing di campagna, variante signup (canonical su /, noindex)
/landing-dev, /landing-dev/b → 301 a / e /b (vercel.json `redirects`)
/login, /sign-up, /verify-otp, /check-email, /forgot-password, /reset-password → Auth
/workspace                 → WorkspaceLayout (no TenantProvider)
/onboarding/create-business, /onboarding/activate-trial → Onboarding (no TenantProvider)
/business/:businessId/     → MainLayout + TenantProvider
  (indice)                 → chi configura: overview; staff/viewer con una sede la prima voce di
                             Operatività usabile, con più sedi locations (BusinessHomeRedirect, §51.6)
  overview
  locations                → con una sede leggibile → locations/:id/anagrafica (SingleSedeRoute, §51.3)
  locations/:activityId    → chi gestisce la sede: anagrafica; staff/viewer la prima voce di Operatività
                             usabile (SedeHomeRedirect; i vecchi ?tab= vincono)
  locations/:activityId/   servizio (?modo=elenco|mappa|gestisci) | prenotazioni | comande | storico | cosa-vedono
                           analitiche | recensioni (Andamento della sede, §51.10: stesse pagine d'azienda, sede dal path)
                           (sala → servizio?modo=gestisci, disponibilita → cosa-vedono,
                            comande?tab=tavoli → servizio?modo=mappa, comande?tab=storico → storico,
                            prenotazioni?tab=service → servizio?modo=elenco)
                           anagrafica | orari | ordini-prenotazioni | pubblicazione (Scheda, ActivityDetailPage; canali → ordini-prenotazioni)
  orders | reservations    → redirect all'ultima sede usata (SedeRedirect), o a locations
  guests
  scheduling (?sede=<id> = filtro della pagina, §51.11) | scheduling/:ruleId | scheduling/featured/:ruleId
  catalogs | catalogs/:id
  products | products/:productId
  featured | featured/:featuredId
  styles | styles/:styleId
  languages
  analytics | reviews       → totale delle sedi leggibili; con una sede → locations/:id/analitiche|recensioni
                             con query e ancora (SingleSedeRoute, §51.14)
  settings | settings/team | settings/abbonamento → Impostazioni a tab (Azienda · Team · Abbonamento, §51.12)
  team → settings/team, subscription → settings/abbonamento (BusinessPathRedirect, query e ancora)
  attributes → products?tab=attributes
/invite/:token             → InvitePage
/legal/privacy | /legal/termini → pagine legali
/status                    → StatusPage
/t/:qrToken                → TableEntryPage (ingresso QR tavolo)
/:slug/prenota | /:slug/:lang/prenota → ReservationPage
/:slug/:lang?              → PublicCollectionPage (pagina pubblica)
```

## Note

- Una route pubblica slug-based nuova va aggiunta in `src/routes/publicRoutes.tsx`, mai direttamente in uno dei due entry.
- `businessId` = source of truth per tenant (vedi `CLAUDE.md` → Architettura).
- Gli ingressi nell'azienda (workspace, cambio azienda, logo, invito, `/dashboard`) puntano a `/business/:businessId`, non a `/overview`: l'indice decide (§51.6). Voci, gruppi, ordine dei tre contesti (sidebar unica, azienda, sede) e atterraggio stanno in `src/utils/navModel.ts` (`NAV_MODELS`, `businessHomePath`, `sedeLandingSegment`, `switchSedePath`); `src/utils/navLanding.ts` tiene solo i vecchi `?tab=` della Scheda.
- Le Edge che generano indirizzi usano ancora i vecchi (`stripe-portal` → `/subscription`, `_shared/publicSiteUrl.ts` → `/reservations`, `/support/:id`): funzionano tramite i redirect.
- `/workspace` e `/onboarding/*` NON hanno `TenantProvider` (utente non ha ancora selezionato un'azienda).
- `/:slug` matcha qualunque slug non riservato. Slug riservati enforced a DB level via `is_reserved_slug()` (vedi `docs/database-reference.md`).
