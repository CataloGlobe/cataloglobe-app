# Test e2e (Playwright)

`npx playwright test` — config `playwright.config.ts`, test in `e2e/*.spec.ts`, Vite su
5174 avviato (o riusato) da Playwright; niente `vercel dev` finché nessuna pagina coperta
chiama `/api`. Login una volta sola in `e2e/global-setup.ts` con `E2E_EMAIL`/`E2E_PASSWORD`
da `.env.e2e.local` (ignorato da git; `E2E_BUSINESS_ID` opzionale, altrimenti prima card
del workspace), sessione in `e2e/.auth/user.json` (ignorato).
**OTP non automatizzabile**: l'utente e2e va verificato a mano (`/verify-otp`) una volta
ogni 30 giorni (`otp_user_verifications`); scaduta, il global-setup fallisce con messaggio
esplicito. Regola M17: il test e2e di una pagina si scrive PRIMA della sua riscrittura e
resta verde dopo. Locator: nomi accessibili (`getByRole`), non testo label (`required`
aggiunge ` *` aria-hidden); la sidebar è `navigation "Menu principale"`.
Pagine con scritture: stub dei dati via `page.route`. La macchina è in `e2e/restStub.ts` (filtri PostgREST, rete delle scritture a 500, `onWrite`, `revoke`), i dati per pagina in `e2e/menuStub.ts` e `e2e/programmazioneStub.ts`.
Ogni write non registrata risponde 500, così un gesto non previsto fa fallire il test;
i test di sola lettura aspettano `stub.revoked` prima di controllare un'assenza.
`workers: 2` in `playwright.config.ts`: con 4 worker compaiono pagine bianche sotto carico (ambiente, non codice); non alzarlo.
Orologio fisso (`page.clock`, Programmazione: mer 23/09/2026 12:00 Roma): ferma anche le animazioni Framer, quindi negli screenshot gli elementi in entrata restano a opacity 0; per le prove visive, pagina senza orologio fisso.
