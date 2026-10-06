# Sentinella: giro in sola lettura (passo 2)

Agente di sicurezza e bug di CataloGlobe. Piano completo in `inbox/sentinella-piano.md` del brain condiviso; elenco della produzione in `inbox/sentinella-elenco-produzione.md` (non usato in questo passo).

Questo passo è il **giro in sola lettura sul Mac di Alex, lanciato a mano** (punto 7.2 del piano), per le prime due settimane. Trova, ricontrolla da capo, scrive un rapporto. Non corregge, non apre PR, non scrive su staging.

## Come si lancia

```bash
bash sentinella/avvia.sh
```

Si apre una sessione di Claude Code **interattiva**, con il giro già chiesto: Alex la vede lavorare e approva ciò che non è in elenco. Nessun avvio programmato (cron, launchd): i termini dell'abbonamento non ammettono l'accesso automatico senza chiave API.

`SENTINELLA_DRY_RUN=1 bash sentinella/avvia.sh` stampa il comando senza lanciarlo.

## Cosa fa lo script prima di partire
- Si ferma se esiste il file `~/.cache/sentinella/STOP` (l'interruttore: lo può creare chiunque).
- Prende il lock degli e2e (`~/.cache/cataloglobe-e2e.lock`, lo stesso di `scripts/e2e.sh`): mai insieme a una run e2e.
- `git fetch` di `origin/staging`, in sola lettura sul repo.
- Calcola da quando guardare: dall'ultimo giro (`~/.cache/sentinella/ultimo-giro`), al primo giro le ultime 24 ore; al massimo 40 entrate in staging (merge delle PR e commit diretti) per giro.
- Lancia Claude Code con un profilo dedicato: nessun connettore MCP (`--strict-mcp-config` con `mcp-vuoto.json`), strumenti in elenco, i sottoagenti di `agenti/`.

## Cosa guarda
| Sottoagente | Cosa | Da dove |
|---|---|---|
| `sentinella-commit` | PR e commit entrati in staging dall'ultimo giro: RLS, `tenant_id`, `SECURITY DEFINER`, edge senza controllo d'accesso, segreti, dati personali nei log | `git log` e `git show` su `origin/staging` |
| `sentinella-intestazioni` | redirect https e intestazioni di sicurezza di staging | 6 richieste `curl -I` verso `staging.cataloglobe.com`, una al secondo |
| `sentinella-avvisi` | avvisi di sicurezza di Supabase di staging | solo se c'è il token di sola lettura di Lorenzo; altrimenti saltato |
| `sentinella-ricontrollo` | ogni scoperta rifatta da capo in un contesto pulito, prima del rapporto | il codice, senza le note del primo sottoagente |

Gli errori 500 del giorno arrivano quando Lorenzo decide da dove leggerli (log di Vercel o Supabase, con un token di sola lettura).

## Il rapporto
- In `~/sentinella-rapporti/AAAA-MM-GG.md` (fuori dal repo e fuori dal brain): le prime due settimane lo legge solo Alex.
- Al massimo 5 voci, in ordine di gravità, quattro livelli: **critico** (qualunque fuga tra aziende o dato personale esposto), **alto**, **medio**, **basso**.
- Solo scoperte nuove, con una prova riproducibile e il secondo controllo superato. I falsi allarmi accettati vanno in `~/sentinella-rapporti/falsi-allarmi.md` con una scadenza e non tornano.
- Mai dati personali, chiavi o corpi di risposta nel rapporto.

## Cosa non fa mai
Produzione, service role, scritture su staging, login, form, mail o messaggi a persone, prove di carico, correzioni del codice, PR.

Se trova dati personali esposti davvero: si ferma, lo scrive in cima al rapporto e non tocca altro; decidono Alex e Lorenzo (72 ore, art. 33 GDPR).
