# Rilascio del AAAA-MM-GG: RUNBOOK (staging → main)

Modello per i rilasci piccoli e frequenti (3-5 PR provate, circa una volta a settimana; CLAUDE.md, `### Rami e cartelle`). Copiarlo in `docs/release/AAAA-MM-GG-runbook.md` e compilarlo con `bash scripts/release-diff.sh`.

**Prod** = `qomnpzerhbtstbnwxnqc` · **Staging** = `lxeawrpjfphgdspueiag`. Tutti i passi su produzione li esegue Lorenzo. Ordine: **migration → edge function → frontend**; ogni passo parte solo se il precedente è chiuso.

## Contenuto
Base `origin/staging` a `<SHA>`. Incollare qui l'uscita di `bash scripts/release-diff.sh`: PR, migration nuove, edge da distribuire. Più: variabili d'ambiente, segreti, cron nuovi (o «nessuno»).

## 0. Prima di partire
- [ ] Le PR del rilascio sono provate a mano su staging (elenco con esito).
- [ ] e2e delle spec toccate verdi su staging (`scripts/e2e.sh`, una per volta).
- [ ] Le PR dell'Officina incluse sono unite con merge commit.

## 1. Migration (da `../cg-release`, mai dalla cartella principale)
```bash
cd ~/Lavoro/Progetti/Personali
git -C CataloGlobe fetch origin main staging
git -C CataloGlobe worktree add --detach ../cg-release origin/staging
cd cg-release
supabase link --project-ref qomnpzerhbtstbnwxnqc        # password DB di prod
supabase db push --dry-run --include-all                # elenco = «Migration nuove» sopra
supabase db push --include-all
supabase db push --dry-run --include-all                # atteso: up to date
```
Fermarsi se il dry-run mostra qualcosa che non è nell'elenco.

## 2. Edge function (stesso worktree)
```bash
FUNZIONI=( <array dallo script> )
for f in "${FUNZIONI[@]}"; do
  supabase functions deploy "$f" --project-ref qomnpzerhbtstbnwxnqc || { echo "STOP su $f"; break; }
done
supabase link --project-ref lxeawrpjfphgdspueiag        # la CLI torna su staging
cd ~/Lavoro/Progetti/Personali/CataloGlobe && rm -rf ../cg-release/supabase/.temp && git worktree remove ../cg-release
```

## 3. Frontend
PR `staging` → `main` (titolo `release: AAAA-MM-GG`), CI verde, `gh pr merge <n> --merge`. Vercel pubblica la produzione: controllare che il deploy sia Ready.

## 4. Prove in produzione
- [ ] Una riga per PR, solo ciò che si può provare senza toccare dati di clienti veri.
- [ ] Advisor di sicurezza della produzione.

## Esito
(data, cosa è andato in produzione, cosa è stato saltato e perché)
