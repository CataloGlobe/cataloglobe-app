# Rilascio di ottobre 2026: RUNBOOK (staging → main)

**Prod** = `qomnpzerhbtstbnwxnqc` · **Staging** = `lxeawrpjfphgdspueiag`

Tutti i passi li esegue Lorenzo. Nessuna sessione Claude lancia `link`, `db push`, `functions deploy` o query sulla produzione (CLAUDE.md, `### CLI Supabase`).

Le stampanti restano fuori: i loro commit sono solo locali e non sono in `origin/staging`.

Ordine: **migration → edge function → frontend**. Ogni passo parte solo se il precedente è chiuso.

Contenuto del rilascio, base audit del 2026-10-06:
- 340 commit di staging che main non ha;
- 113 migration nuove, di cui 4 già in prod (batch 1), quindi **109 da applicare**;
- **43 edge function** da distribuire, di cui 11 nuove (CRM) e 32 cambiate.

**Esito (2026-10-06).** Rilasciato con #278. Le migration applicate sono state **98**, non 109: tra l'audit e il rilascio la produzione aveva già ricevuto le altre. Il dry-run è stato confrontato con l'elenco delle versioni di staging assenti dalla produzione (`supabase_migrations.schema_migrations`), non con il conteggio qui sopra. Edge: 43 distribuite. Il passo 1 si è fatto da una cartella dedicata al rilascio (`cg-release`, poi tolta), non da `cataloglobe-ds`.

---

## 0. Prima di partire

- [ ] La PR del flag allergie (`feat/reservation-allergies-flag`) è unita in staging.
- [ ] Le allergie restano **spente** in produzione: `RESERVATION_ALLERGIES_ENABLED` **non** è tra i secret di prod, `VITE_RESERVATION_ALLERGIES` **non** è nelle env Vercel di Production. Si riaccendono quando D1 è decisa (ritiro del consenso, art. 7(3) GDPR).
- [ ] Su staging restano accese, per continuare a provarle: `RESERVATION_ALLERGIES_ENABLED=true` tra i secret di staging e `VITE_RESERVATION_ALLERGIES=true` nelle env Vercel di Preview/staging.
- [ ] Il CRM resta **dormiente** (sezione 4): niente `TELEGRAM_BOT_TOKEN` in prod e nessuna voce del vault `crm_*`.

```bash
git fetch origin main staging
git rev-parse --short origin/staging      # annota lo SHA: tutto il runbook lavora su questo
```

## 1. Migration (da `../cataloglobe-ds`)

Il link vale per la cartella da cui si lancia la CLI: la cartella principale non si ricollega mai a prod.

```bash
cd ~/Lavoro/Progetti/Personali/cataloglobe-ds
git fetch origin && git status -sb                       # pulito, niente modifiche
git pull                                                 # allineato a origin/staging
git diff --quiet origin/staging -- supabase && echo ok   # atteso: ok

# Elenco atteso: le migration nuove rispetto a main, meno le 4 del batch 1 già in prod.
git diff --name-only --diff-filter=A origin/main origin/staging -- supabase/migrations \
  | grep -v '_in-attesa/' \
  | grep -vE '20261003160(000|100|200|300)_' \
  | xargs -n1 basename | sort > /tmp/release-atteso.txt
wc -l < /tmp/release-atteso.txt                          # atteso: 109

supabase link --project-ref qomnpzerhbtstbnwxnqc         # chiede la password DB di prod
cat supabase/.temp/project-ref; echo                     # atteso: qomnpzerhbtstbnwxnqc

supabase db push --dry-run --include-all 2>&1 | tee /tmp/release-dryrun.txt
grep -oE '[0-9]{14}_[a-z0-9_]+\.sql' /tmp/release-dryrun.txt | sort > /tmp/release-dryrun-list.txt
wc -l < /tmp/release-dryrun-list.txt                     # atteso: 109
diff /tmp/release-atteso.txt /tmp/release-dryrun-list.txt && echo "elenco identico"
```

**Fermarsi se** il conteggio non è 109 o il `diff` non è vuoto:
- se compaiono `20261003160000`–`160300`, il batch 1 non risulta registrato in prod;
- se compaiono `20260930160000`, `20260930160100` o `20261005190000`, prod è indietro rispetto a main;
- se compare qualcosa da `_in-attesa/`, va capito perché prima di procedere.

`--include-all` è obbligatorio: 96 delle 109 hanno un timestamp precedente a `20261005190000`, già in prod. Senza, verrebbero saltate senza avviso.

```bash
supabase db push --include-all                           # solo se il dry-run è quello atteso

supabase link --project-ref lxeawrpjfphgdspueiag          # torna su staging, SEMPRE
cat supabase/.temp/project-ref; echo                     # atteso: lxeawrpjfphgdspueiag
```

Dipendenze da tenere a mente (sono già nell'ordine dei timestamp):
- batch 2 di sicurezza: ogni funzione viene prima del suo trigger (`20260930150200`→`150300`, `150400`→`150500`, `150600`→`150700`);
- CRM: tabelle → funzioni → grant → cron;
- `20261001120000` crea l'estensione `pg_trgm`;
- `20261005205457` (CHECK `valid_event_type`) va prima di `log-analytics-event`;
- `20261005210000` (feedback privato) va prima di `submit-review`;
- `20261005230000`/`230100` (allergie) vanno prima di `submit-reservation`.

## 2. Edge function (43, da `../cataloglobe-ds` allineato a origin/staging)

Mai dalla cartella principale: lo `staging` locale ha commit non pushati e modifiche non committate, che finirebbero nel bundle.

```bash
cd ~/Lavoro/Progetti/Personali/cataloglobe-ds
git diff --quiet origin/staging -- supabase/functions && echo ok   # atteso: ok

FUNZIONI="
acknowledge-order cancel-order-admin deliver-order mark-order-ready restore-order
submit-order submit-order-admin unacknowledge-order unready-order undeliver-to-ready
uncancel-to-acknowledged uncancel-to-ready uncancel-to-submitted generate-table-qrs
submit-reservation update-reservation respond-reservation cancel-reservation-public
send-reservation-reminders purge-reservation-data
submit-review log-analytics-event resolve-public-catalog
stripe-checkout stripe-change-subscription stripe-portal
delete-account recover-account status-otp
submit-lead notify-support join-waitlist
crm-notify crm-telegram-webhook crm-wa crm-wa-worker crm-sync-accounts crm-purge
crm-agent crm-agent-check crm-agenda crm-gea-web crm-meta-webhook
"
echo $FUNZIONI | wc -w                                   # atteso: 43

for f in $FUNZIONI; do
  supabase functions deploy "$f" --project-ref qomnpzerhbtstbnwxnqc || { echo "STOP su $f"; break; }
done

supabase functions list --project-ref qomnpzerhbtstbnwxnqc   # 81 voci: 80 del repo + generate-menu-pdf
```

Le 11 `crm-*` vanno su dormienti. Senza i loro secret rispondono 401, 403 o 500 «not configured»: `crm-meta-webhook` senza `META_*`, `crm-telegram-webhook` senza `TELEGRAM_WEBHOOK_SECRET`, le altre senza un admin autenticato o `CRM_JOB_SECRET`. Non mandano niente.

`generate-menu-pdf` è in prod ma non è più nel repo: non si tocca in questo rilascio.

## 3. Frontend: PR staging → main

Il merge ha 3 conflitti. In tutti e tre vale la versione di staging, perché il contenuto proprio di main (#245, landing, docs) è già anche su staging.

```bash
cd ~/Lavoro/Progetti/Personali
git -C CataloGlobe worktree add -b release/2026-10 ../cg-release origin/main
cd cg-release
git merge --no-ff origin/staging -m "release: staging into main (2026-10)"
# CONFLICT in: CLAUDE.md, src/pages/Admin/StatusIncidents/StatusIncidentsPage.tsx,
#              supabase/functions/stripe-change-subscription/index.ts
git checkout origin/staging -- CLAUDE.md \
  src/pages/Admin/StatusIncidents/StatusIncidentsPage.tsx \
  supabase/functions/stripe-change-subscription/index.ts
git add CLAUDE.md src/pages/Admin/StatusIncidents/StatusIncidentsPage.tsx \
  supabase/functions/stripe-change-subscription/index.ts
git commit --no-edit
git diff --stat origin/staging                           # atteso: vuoto (albero = staging)
git push -u origin release/2026-10
gh pr create --base main --title "release: staging into main (2026-10)" \
  --body "Rilascio di ottobre. Migration ed edge già applicate in prod secondo docs/release/2026-10-runbook.md."
```

Dopo il merge, Vercel pubblica la produzione. Prima di unire: Production **senza** `VITE_RESERVATION_ALLERGIES`.

```bash
cd ~/Lavoro/Progetti/Personali/CataloGlobe && git worktree remove ../cg-release
```

## 4. CRM dormiente

In questo rilascio **non** si impostano:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRM_ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `META_*`;
- le voci del vault `crm_notify_url`, `crm_job_secret`, `crm_sync_accounts_url`, `crm_purge_url`, `crm_wa_worker_url`.

Senza voci del vault i cron `crm-*` non chiamano niente (NOTICE). Fa eccezione `crm-sync-landing-leads`, che è solo SQL: copia i `leads` della landing nel CRM con `notified_at` nullo. È voluto, il CRM si popola da solo.

**Prima dell'attivazione** (rilascio a parte, non adesso), nel SQL Editor di prod, per non mandare su Telegram un messaggio e un sollecito per ogni lead storico:

```sql
-- 1. Quanti lead e import verrebbero notificati all'accensione
SELECT count(*) AS lead_da_notificare FROM public.crm_leads WHERE notified_at IS NULL;
SELECT count(*) AS import_da_notificare FROM public.crm_import_runs WHERE notified_at IS NULL;

-- 2. Segnarli come già notificati e già sollecitati
BEGIN;
UPDATE public.crm_leads
SET notified_at  = now(),
    escalated_at = coalesce(escalated_at, now())
WHERE notified_at IS NULL;
UPDATE public.crm_import_runs
SET notified_at = now()
WHERE notified_at IS NULL;
-- controllare i conteggi riportati, poi:
COMMIT;
```

Solo dopo: voci del vault, `TELEGRAM_BOT_TOKEN`, deploy o ridistribuzione se serve, e la verifica con un lead di prova.

## 5. Controlli in prod dopo il deploy

Database:
- [ ] `select count(*) from supabase_migrations.schema_migrations where version >= '20260930150000'`: tutte le versioni di `/tmp/release-atteso.txt` più le 4 del batch 1.
- [ ] Funzioni `crm_*` e nuove `SECURITY DEFINER`: `pg_proc` + `has_function_privilege` per anon/authenticated come su staging (CLAUDE.md, `### Funzioni SQL`).
- [ ] `select jobname, schedule, active from cron.job where jobname like 'crm-%'`: 9 job. In `cron.job_run_details` nessun errore, solo NOTICE di segreto mancante.
- [ ] Security Advisor e Performance Advisor: nessun avviso nuovo rispetto a prima.

Edge function e pagina pubblica:
- [ ] Pagina pubblica su iPhone, Safari **incognito**: caroselli «In evidenza», card «Vedi tutti» con 5 o più contenuti, elenco → dettaglio → indietro → chiudi; barra inferiore senza voce «In evidenza» e senza blink.
- [ ] `log-analytics-event` accetta `featured_see_all_click` e `featured_cta_click`: righe nuove in `analytics_events`.
- [ ] Prenotazione dal modulo pubblico: **nessun campo allergie** visibile; la prenotazione arriva, con email al locale e al cliente.
- [ ] Recensione dal modulo pubblico: finisce in coda come feedback privato, la pagina pubblica non la mostra.
- [ ] Ordine al tavolo con un piatto spento nella Disponibilità della sede: deve essere rifiutato (#224).
- [ ] Comande: conferma / pronto / servito / storna su un ordine di prova (CG-04, #255).
- [ ] Checkout di prova senza carta (codice con `trial_no_card`) e aumento posti con anteprima a 0 € (#256, #258).
- [ ] `crm-meta-webhook` e `crm-telegram-webhook` senza firma: 401/403/500 «not configured».

Frontend:
- [ ] Back office: Prodotti, Programmazione, Prenotazioni, Recensioni, Analitiche si aprono senza errori in console.
- [ ] `/admin` (CRM) si apre per un platform admin; nessuna notifica parte.
