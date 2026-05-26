# Pattern obbligatori — Storage, SQL functions, Stripe lifecycle

## Storage policy `storage.objects`

- Naming: `<bucket-id> <operation>` (es. `avatars insert`, `product-images update`). Lowercase, hyphen-space.
- Roles: `TO authenticated` (no public listing). File pubblici via `getPublicUrl()` che bypassa RLS senza policy SELECT public.
- UPDATE policy: SEMPRE `USING (...) WITH CHECK (...)` con espressione identica. Senza WITH CHECK, l'SDK upsert fallisce silenziosamente.
- Sempre `DROP POLICY IF EXISTS` (idempotenza cross-env).

## Storage upsert — 3 policy DB richieste

`supabase.storage.upload(path, file, { upsert: true })` invoca internamente `INSERT ON CONFLICT DO UPDATE` su `storage.objects`. Per funzionare richiede:

1. INSERT policy con `WITH CHECK (...)`
2. UPDATE policy con `USING (...) WITH CHECK (...)` (entrambi populate)
3. SELECT policy `TO authenticated` (per leggere riga esistente nel ramo ON CONFLICT)

Senza una di queste 3, upsert fallisce con HTTP 400 + messaggio fuorviante `"new row violates row-level security policy"`. Il messaggio non distingue quale manca: indagare sempre TUTTE le policy del bucket.

## Funzioni SQL

- `SECURITY DEFINER` solo se necessario (lookup `auth.users`, `vault`, RLS bypass legittimo). Default: `SECURITY INVOKER`.
- `SET search_path TO ''` obbligatorio + qualifiche `public.<table>` esplicite nel body.
- `REVOKE EXECUTE ... FROM PUBLIC` dopo `CREATE FUNCTION` (Postgres concede grant PUBLIC di default).
- `GRANT EXECUTE` solo a ruoli specifici (`anon`/`authenticated`/`service_role`) in base al caso d'uso.

### SECURITY DEFINER service-role-only

Per ogni function `SECURITY DEFINER` in `public` NON destinata a `anon`/`authenticated`, `REVOKE FROM PUBLIC` da solo NON basta: Supabase pre-configura al bootstrap `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`, e i grant ai ruoli nominati sopravvivono al `REVOKE FROM PUBLIC`. Combinato con `SECURITY DEFINER` (esecuzione con identità owner = bypass RLS), un client `anon` può scrivere su tabelle protette tramite la function.

Pattern obbligatorio nella migration:

```sql
REVOKE EXECUTE ON FUNCTION public.<nome>(<args>) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<nome>(<args>) FROM anon;
REVOKE EXECUTE ON FUNCTION public.<nome>(<args>) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.<nome>(<args>) TO service_role;
```

Verifica empirica post-deploy (atteso `{postgres, service_role}` SOLO; presenza di `anon` o `authenticated` = REVOKE espliciti mancanti):

```sql
SELECT array_agg(DISTINCT r.rolname) FILTER (
  WHERE has_function_privilege(r.oid, p.oid, 'EXECUTE')
) AS roles_with_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
WHERE n.nspname = 'public' AND p.proname = '<nome>'
GROUP BY p.oid;
```

Eccezione: function pubblicamente callable by-design (es. `resolve_table_by_token` per scansione QR anon) mantengono `GRANT TO anon, authenticated` e NON applicano questo pattern.

## Migration con `CREATE FUNCTION` + REVOKE/GRANT — workaround `db push`

`supabase db push` fallisce con `cannot insert multiple commands into a prepared statement (SQLSTATE 42601)` quando un singolo file combina `CREATE OR REPLACE FUNCTION` (body PL/pgSQL multi-statement) con uno o più REVOKE/GRANT. Il CLI usa prepared statement che non accetta multi-command. Due workaround validi:

1. Applicare via Supabase Studio SQL Editor (bypassa il prepared statement layer del CLI).
2. Splittare in 2 file con timestamp consecutivi — `YYYYMMDDHHMMSS_create_x.sql` (solo CREATE) + `YYYYMMDDHHMMSS+1_grant_x.sql` (solo REVOKE/GRANT).

Dopo apply via Studio, registrare la migration history manualmente:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('YYYYMMDDHHMMSS', 'nome_descrittivo')
ON CONFLICT (version) DO NOTHING;
```

Lezione appresa task 2.5a (`submit_order_atomic`, split a 2 file) e 2.11a (`rectify_order_atomic`, applicata via Studio).

## Stripe lifecycle

Usare sempre `_shared/stripe-helpers.ts` per chiamate Stripe nelle Edge Functions.

Pattern: `scheduleStripeCancel()` al soft-delete (account/tenant) → `reactivateStripeSubIfScheduled()` al recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` al hard-delete (cron purge). Tutti idempotenti e non-throwing.

NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete (perde all'utente i giorni pagati e disincentiva il recovery). Usato da: delete-tenant, delete-account, restore-tenant, recover-account, `_shared/tenant-purge.ts`.
