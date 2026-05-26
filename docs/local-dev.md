# Local development

## TL;DR

Comando singolo, un terminale:

```bash
npm run dev:full
```

Lancia in parallelo Vite (porta 5173) e `vercel dev` solo per `/api/*` (porta 3001) via `concurrently`. Output prefissato `[vite]` (ciano) e `[api]` (magenta) per distinguere i log. `Ctrl+C` chiude entrambi (`--kill-others-on-fail`: se uno crasha, l'altro viene fermato).

Browser su `http://localhost:5173`. Le fetch a `/api/*` vengono proxate automaticamente su `http://localhost:3001` (config in `vite.config.ts > server.proxy`).

### Alternativa: due terminali separati

Utile quando vuoi log isolati per il debug:

```bash
# Terminal 1 — frontend Vite (HMR, SPA routing, asset pipeline)
npm run dev

# Terminal 2 — serverless functions /api/* (Vercel dev su 3001)
npm run dev:api
```

Stessa identica configurazione di rete e proxy: `dev:full` è solo un wrapper `concurrently` su questi due comandi.

## Perché non `vercel dev` standalone

`vercel dev` orchestra Vite + serverless functions sulla stessa porta. La rewrite catch-all in `vercel.json`:

```json
{ "source": "/(.*)", "destination": "/index.html" }
```

è pensata per il fallback SPA in produzione (build statico). In dev, però, intercetta TUTTE le request — inclusi i moduli interni di Vite (es. `/src/main.tsx`, `/index.html?import`). Vite riceve HTML dove si aspetta JS → `vite:import-analysis` fallisce con:

```
[vite] Internal server error: Failed to parse source for import analysis
because the content contains invalid JS syntax.
Plugin: vite:import-analysis
File: .../index.html:22:88
```

`vercel.json` non supporta una sezione `dev` separata e il workaround `missing: [{type:"query",key:"import"}]` non viene applicato dal router di `vercel dev` per i path che generano il crash (verificato empiricamente 2026-05-20).

Conseguenza: tenere `vercel dev` come orchestratore unico in locale non è praticabile finché il bug Vite ↔ Vercel CLI 54.2.0 ↔ Vite 7 non è risolto upstream.

## Cosa fa la soluzione

1. **`vite.config.ts > server.proxy`**: tutte le request `/api/*` su Vite (5173) vengono inoltrate a `http://localhost:3001` con `changeOrigin: true`.
2. **`npm run dev:api`**: lancia `vercel dev --listen 3001` esportando `.env.local`. Vercel auto-detecta Vite e ne avvia un'istanza interna, ma il browser non hitterà mai quella porta su route non-API → il bug del rewrite non si manifesta.
3. **`npm run dev`** (Vite standalone): invariato, funziona da solo se non servono le API in locale.

## Verifica end-to-end

Con entrambi i processi attivi:

```bash
# Frontend SPA route (200 HTML)
curl -I http://localhost:5173/san-pietro-porta-venezia

# Modulo Vite (200 JS, HMR attivo)
curl -I http://localhost:5173/src/main.tsx

# API via Vite proxy (200 JSON)
curl http://localhost:5173/api/public-catalog?slug=san-pietro-porta-venezia

# API diretta su 3001 (200 JSON, identico al precedente)
curl http://localhost:3001/api/public-catalog?slug=san-pietro-porta-venezia
```

Tutti 200. Nessun errore `vite:import-analysis` nei log Vite. HMR funzionante: modifica un file in `src/` → reload nel browser. Hot reload delle serverless functions: modifica un file in `api/` → `vercel dev` rebuilda la function al hit successivo.

## Trade-off

- **`npm run dev` standalone (senza `dev:api`)**: tutte le fetch a `/api/*` falliscono con `ECONNREFUSED` su 3001. Atteso. Chi non lavora sulle API può ignorare `/api/*` e usare i dati cached/staging.
- **`npm run dev:vercel` legacy**: tenuto in `package.json` come alias di `dev:api` per retro-compatibilità con script o muscle memory. Stesso eseguibile, stessa porta — funziona ma se aperto in browser su `/` crash Vite (vedi sopra). Non usarlo come orchestratore unico. Considera la rimozione.
- **`dev:full` log mescolati**: usando `concurrently` i log di Vite e Vercel arrivano interleaved sullo stesso terminale. Il prefisso colorato `[vite]`/`[api]` li distingue, ma per debug pesante (es. tracing serverless function) preferisci la modalità due terminali sopra.
- **Production non toccata.** `vercel.json` resta invariato (rewrite SPA fallback necessario al deploy statico).
- **Dependency aggiunta**: `concurrently` (dev-only, ~50KB). Giustificata da: orchestrazione due processi con prefisso log, gestione segnali (`Ctrl+C` chiude entrambi), `--kill-others-on-fail` evita stato sporco quando uno crasha.

## Versioni testate (2026-05-20)

- `vercel` CLI: 54.2.0 (latest al momento del test)
- Vite: 7.3.1
- `@vitejs/plugin-react`: 5.0.4
- Node: 24.x

Se il bug viene fixato in una versione futura di `vercel` CLI o Vite, questa configurazione resta retro-compatibile (il proxy non interferisce con un eventuale ritorno a `vercel dev` unico).

## Riferimenti

- Vite proxy options: <https://vite.dev/config/server-options.html#server-proxy>
- Vercel rewrites: <https://vercel.com/docs/projects/project-configuration#rewrites>
