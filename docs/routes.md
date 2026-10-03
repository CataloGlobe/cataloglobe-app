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
  (indice)                 → una sede leggibile: la sede; altrimenti overview (BusinessHomeRedirect)
  overview | locations
  locations/:activityId    → prima voce usabile della sidebar di sede (SedeHomeRedirect; i vecchi ?tab= vincono)
  locations/:activityId/   comande | prenotazioni | cosa-vedono (disponibilita → cosa-vedono)
                           anagrafica | orari | ordini-prenotazioni | pubblicazione | sala (Scheda, ActivityDetailPage)
  orders | reservations    → redirect all'ultima sede usata (SedeRedirect), o a locations
  guests
  scheduling | scheduling/:ruleId | scheduling/featured/:ruleId
  catalogs | catalogs/:id
  products | products/:productId
  featured | featured/:featuredId
  styles | styles/:styleId
  languages
  attributes | reviews | analytics | team | subscription | settings
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
- Gli ingressi nell'azienda (workspace, cambio azienda, invito, `/dashboard`) puntano a `/business/:businessId`, non a `/overview`: l'indice decide (D1). Le voci di sede e il loro ordine stanno in `src/utils/navLanding.ts` (`SEDE_NAV_ENTRIES`), letti dalla sidebar di sede e dall'atterraggio.
- `/workspace` e `/onboarding/*` NON hanno `TenantProvider` (utente non ha ancora selezionato un'azienda).
- `/:slug` matcha qualunque slug non riservato. Slug riservati enforced a DB level via `is_reserved_slug()` (vedi `docs/database-reference.md`).
