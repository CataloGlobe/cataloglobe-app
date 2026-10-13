# Status page (`/status`)

**Fonte dei dati**: Redis è la fonte primaria, il DB è solo storico. La pagina deve poter dire che il database è giù, e gli avvisi devono partire anche quando lo è.

```
scheduler esterno (cron-job.org, ogni 5 min, Bearer CRON_SECRET)
  → api/cron/status-check.ts
      → runAllChecks (4 servizi, 10 s per controllo)
      → Redis: status:v1:current + status:v1:uptime:{servizio}:{giorno}
      → avvisi (status:v1:alert:{servizio}) → al massimo 1 email per ciclo
      → DB storico: status_checks + status_service_state (5 s per chiamata, in parallelo)
/status → src/services/status/statusPage.ts → GET /api/status (Redis + incidenti dal DB)
```

- **Chiavi Redis** (`api/_lib/statusRedis.ts`, namespace `cataloglobe:{env}:status:v1`): `current` (ultimo controllo, TTL 7 giorni) · `uptime:{servizio}:{YYYY-MM-DD}` (hash `up|degraded|down`, giorni UTC, TTL 91 giorni) · `alert:{servizio}` (`lastObserved`, `lastNotified`, TTL 7 giorni) · `history` (riepilogo dei giorni chiusi, TTL 2 giorni).
- **Lettura dell'uptime a pochi comandi**: `readUptime` legge `history` + i 4 contatori di oggi (5 comandi). I giorni chiusi (4 × 89 HGETALL) si ricalcolano solo alla prima lettura del giorno UTC. Prima si rileggevano a ogni richiesta: a ottobre 2026 una pagina `/status` lasciata aperta ha esaurito la quota mensile del piano gratuito di Upstash. Mai tornare a leggere la finestra intera a ogni richiesta, e le pagine che si aggiornano da sole non leggono a scheda nascosta (`document.hidden`).
- **Uptime a 90 giorni solo da Redis**: lo storico della pagina viene solo dai contatori `uptime:*`. Lo storico precedente al passaggio a Redis non è stato ricopiato.
- **`status_checks` è solo per il server**: la scrive `status-check` e la legge il ripiego degli avvisi, entrambi col service role. Nessuna policy per anon/authenticated (tolta con `get_daily_uptime` dalla mig `20261013170000`): il browser non legge il DB per la pagina, solo `GET /api/status`. Righe oltre 7 giorni cancellate dal pg_cron `purge-status-checks` (03:15 UTC); il vecchio `api/cron/status-prune.ts` non c'è più.
- **Incidenti** (`status_incidents`): restano nel DB, letti da `GET /api/status` col service role e scritti da `api/admin/status-incidents.ts`. Nessuna policy per anon/authenticated (tolta dalla mig `20261013180000`): mai leggerli dal browser col client Supabase.
- **Servizi**:
  - `public-menu`: `/api/public-catalog?slug=<canary>`. Una risposta con `X-Cataloglobe-Source: stale` (snapshot Redis, edge o DB non raggiungibili) vale `degraded`.
  - `dashboard`: il peggiore tra HTML statico, `database` e `GET /auth/v1/health` (`combineDashboard`). Serve `SUPABASE_ANON_KEY` nell'ambiente Vercel.
  - `database`: `tenants?select=id&limit=1` con tetto di 10 s (`DATABASE_PROBE_TIMEOUT_MS`).
  - `cache`: `redis.ping()`.
- **Avvisi** (`api/_lib/statusAlerts.ts`): email solo per `down` confermato su 2 controlli consecutivi e per il rientro (anche `DOWN → DEGRADATO`). Il passaggio `up` ↔ `degraded` non manda email. Una sola email per ciclo con tutti i servizi cambiati; se l'invio fallisce, `lastNotified` non avanza e si riprova al ciclo dopo.
- **Ripiego degli avvisi sul DB** (`loadAlertInputs`): se la lettura di `status:alert` fallisce o la chiave manca, l'isteresi legge `status_checks` + `status_service_state`. Mai trattarla come «nessun precedente», che spegnerebbe l'isteresi.
- **`pgrest`** (`api/_lib/statusSupabase.ts`) non lancia su timeout o errori di rete: restituisce `ok: false`, `status: 0`. Chi lo usa per una risposta HTTP mappa lo 0 a 502.
- **`GET /api/status`**: 503 se Redis non risponde (la pagina tiene gli ultimi dati con «dati non aggiornati»). Incidenti dal DB con tetto di 3 s; se il DB non risponde, `incidentsAvailable: false` e il resto della pagina resta in piedi.
