# Route — CataloGlobe

Riferimento route applicazione. Tutte definite in `src/App.tsx`, tranne le route pubbliche slug-based, definite in `src/routes/publicRoutes.tsx` e consumate da `App.tsx` e `src/entry-client.tsx`.

```
/                          → Home (landing)
/login, /sign-up, /verify-otp, /check-email, /forgot-password, /reset-password → Auth
/workspace                 → WorkspaceLayout (no TenantProvider)
/onboarding/create-business, /onboarding/activate-trial → Onboarding (no TenantProvider)
/business/:businessId/     → MainLayout + TenantProvider
  overview | locations | locations/:activityId
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
- `/workspace` e `/onboarding/*` NON hanno `TenantProvider` (utente non ha ancora selezionato un'azienda).
- `/:slug` matcha qualunque slug non riservato. Slug riservati enforced a DB level via `is_reserved_slug()` (vedi `docs/database-reference.md`).
