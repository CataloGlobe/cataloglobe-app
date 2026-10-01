# Status page (`/status`)

**Fonte dei dati**: Redis è la fonte primaria, il DB è solo storico. La pagina deve poter dire che il database è giù, e gli avvisi devono partire anche quando lo è.

```
scheduler esterno (ogni 2 min, Bearer CRON_SECRET)
  → api/cron/status-check.ts
      → runAllChecks (4 servizi, 10 s per controllo)
      → Redis: status:v1:current + status:v1:uptime:{servizio}:{giorno}
      → avvisi (status:v1:alert:{servizio}) → al massimo 1 email per ciclo
      → DB storico: status_checks + status_service_state (5 s per chiamata, in parallelo)
/status → src/services/status/statusPage.ts → GET /api/status (Redis + incidenti dal DB)
```

- **Chiavi Redis** (`api/_lib/statusRedis.ts`, namespace `cataloglobe:{env}:status:v1`): `current` (ultimo controllo, TTL 7 giorni) · `uptime:{servizio}:{YYYY-MM-DD}` (hash `up|degraded|down`, giorni UTC, TTL 91 giorni) · `alert:{servizio}` (`lastObserved`, `lastNotified`, TTL 7 giorni).
- **Uptime a 90 giorni solo da Redis**: in produzione `purge-status-checks` cancella `status_checks` oltre 7 giorni. Lo storico precedente al passaggio a Redis non è stato ricopiato.
- **Servizi**:
  - `public-menu`: `/api/public-catalog?slug=<canary>`. Una risposta con `X-Cataloglobe-Source: stale` (snapshot Redis, edge o DB non raggiungibili) vale `degraded`.
  - `dashboard`: il peggiore tra HTML statico, `database` e `GET /auth/v1/health` (`combineDashboard`). Serve `SUPABASE_ANON_KEY` nell'ambiente Vercel.
  - `database`: `tenants?select=id&limit=1` con tetto di 10 s (`DATABASE_PROBE_TIMEOUT_MS`).
  - `cache`: `redis.ping()`.
- **Avvisi** (`api/_lib/statusAlerts.ts`): email solo per `down` confermato su 2 controlli consecutivi e per il rientro (anche `DOWN → DEGRADATO`). Il passaggio `up` ↔ `degraded` non manda email. Una sola email per ciclo con tutti i servizi cambiati; se l'invio fallisce, `lastNotified` non avanza e si riprova al ciclo dopo.
- **Ripiego degli avvisi sul DB** (`loadAlertInputs`): se la lettura di `status:alert` fallisce o la chiave manca, l'isteresi legge `status_checks` + `status_service_state`. Mai trattarla come «nessun precedente», che spegnerebbe l'isteresi.
- **`pgrest`** (`api/_lib/statusSupabase.ts`) non lancia su timeout o errori di rete: restituisce `ok: false`, `status: 0`. Chi lo usa per una risposta HTTP mappa lo 0 a 502.
- **`GET /api/status`**: 503 se Redis non risponde (la pagina tiene gli ultimi dati con «dati non aggiornati»). Incidenti dal DB con tetto di 3 s; se il DB non risponde, `incidentsAvailable: false` e il resto della pagina resta in piedi.
- **Da togliere dopo una settimana di funzionamento**: la funzione SQL `get_daily_uptime`, la policy di lettura anonima su `status_checks`, `api/cron/status-prune.ts`.
