# Multi-Tenant Security: Architettura e Best Practice

> ⚠️ **Regola Fondamentale**
>
> Le **PostgreSQL VIEW eseguono come il loro owner** (`postgres` in Supabase),
> che è un superuser. Questo significa che le policy RLS definite sulle tabelle
> sottostanti **vengono completamente bypassate** quando quelle tabelle vengono
> lette tramite una VIEW.
>
> Il filtro utente (`auth.uid()`, `auth.email()`) **DEVE essere esplicito**
> nella definizione della view stessa, o la view deve delegare interamente a
> una funzione `SECURITY DEFINER`.

---

## Il Problema: RLS Bypass nelle VIEW

```sql
-- ❌ ANTI-PATTERN — la RLS su `tenants` non protegge questa view
CREATE VIEW tenants_list AS
SELECT * FROM tenants;
-- Risultato: TUTTI gli utenti autenticati vedono TUTTI i tenant

-- ❌ ANTI-PATTERN — LEFT JOIN senza WHERE non protegge
CREATE VIEW user_tenants_view AS
SELECT t.*, tm.role
FROM tenants t
LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id AND tm.user_id = auth.uid();
-- La LEFT JOIN filtra le COLONNE di membership ma non le RIGHE di tenants
-- Risultato: ogni autenticato vede ancora TUTTI i tenant (con role = NULL)
```

---

## La Soluzione: SECURITY DEFINER Functions

Le funzioni `SECURITY DEFINER` eseguono con i privilegi del **definer** (tipicamente `postgres`), non del caller. Questo permette di:

1. Bypassare la RLS internamente (accesso alle tabelle complete)
2. Applicare un filtro `auth.uid()` **autoritativo** nel corpo della funzione
3. Restituire solo i dati a cui il caller ha diritto

```sql
-- ✅ PATTERN CORRETTO
CREATE OR REPLACE FUNCTION public.get_user_tenants()
RETURNS TABLE (id uuid, name text, user_role text, …)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, …
  FROM public.tenants t
  LEFT JOIN public.tenant_memberships tm
    ON tm.tenant_id = t.id AND tm.user_id = auth.uid() AND tm.status = 'active'
  WHERE t.deleted_at IS NULL
    AND (t.owner_user_id = auth.uid() OR tm.user_id IS NOT NULL)
    --   ^^^^^^^^^^^^^^^^^^^^^^^^^^^ auth.uid() SEMPRE presente
$$;
```

---

## Funzioni Canoniche di Questo Sistema

### `public.get_user_tenants()` → `TABLE(id, name, vertical_type, …)`

**Single Source of Truth** per elencare i tenant di un utente.

- Usata da: `user_tenants_view`, `TenantProvider`, `WorkspacePage`
- Garantisce: owner + active members, no deleted tenants
- Security: `SECURITY DEFINER`, `STABLE`, `GRANT` solo a `authenticated`

### `public.get_my_tenant_ids()` → `SETOF uuid`

**Backbone di tutte le policy RLS** sulle tabelle tenant-scoped.

- Usata da: policy su `tenants`, `activities`, `products`, `catalogs`, `styles`, `schedules`, ...
- Garantisce: stesso scope di `get_user_tenants()` ma ritorna solo gli UUID
- Security: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`

> **Non bypassare mai queste funzioni.** Ogni query che elenca tenant per un
> utente DEVE passare per uno di questi due entry point.

---

## Regole da Seguire

### ✅ DO — Pattern Approvati

**1. Creare nuove view come thin wrapper su funzioni SECURITY DEFINER:**
```sql
CREATE OR REPLACE VIEW my_new_view AS
SELECT
  id, name, col_a, col_b   -- lista colonne esplicita, mai SELECT *
FROM public.my_security_definer_function();
```

**2. Usare `get_my_tenant_ids()` nelle policy RLS:**
```sql
CREATE POLICY "Tenant select own rows"
ON public.my_table
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
```

**3. Funzioni SECURITY DEFINER con REVOKE/GRANT espliciti:**
```sql
REVOKE ALL ON FUNCTION public.my_function() FROM public;
GRANT EXECUTE ON FUNCTION public.my_function() TO authenticated;
```

**4. Aggiungere blocchi DO $$ di validazione in ogni migration:**
```sql
DO $$
BEGIN
  IF NOT exists (... verifica criteri di sicurezza ...) THEN
    RAISE EXCEPTION 'FAIL: ...';
  END IF;
  RAISE NOTICE 'OK: ...';
END $$;
```

### ❌ DON'T — Anti-Pattern

**1. Non usare plain VIEW per dati user-scoped:**
```sql
-- ❌ MAI
CREATE VIEW tenants_for_user AS
SELECT * FROM tenants WHERE owner_user_id = auth.uid();
-- La RLS bypassata rende il WHERE inaffidabile in alcuni contesti
```

**2. Non fare SELECT * nelle view wrapper:**
```sql
-- ❌ EVITARE — schema non congelato, regressioni silenziose possibili
CREATE VIEW user_tenants_view AS SELECT * FROM get_user_tenants();

-- ✅ PREFERIRE — schema esplicito e stabile
CREATE VIEW user_tenants_view AS
SELECT id, name, vertical_type, created_at, owner_user_id, user_role, logo_url
FROM get_user_tenants();
```

**3. Non aggiungere colonne a funzioni canoniche senza aggiornare le view:**
```sql
-- Se aggiungi una colonna a get_user_tenants() devi aggiornare
-- sia la definizione RETURNS TABLE che user_tenants_view
```

**4. Non referenziare tabelle legacy (v2_) dopo il rename:**
```sql
-- ❌ Dopo migration 20260317120000 queste non esistono più
FROM public.v2_tenants
FROM public.v2_tenant_memberships
```

---

## Workflow per Aggiungere Nuovi Dati User-Scoped

Quando hai bisogno di esporre al frontend dati che dipendono dall'identità utente:

```
1. Crea una SECURITY DEFINER function con filtro auth.uid() esplicito
2. Aggiungi REVOKE ALL / GRANT EXECUTE TO authenticated
3. Crea la VIEW come wrapper con colonne esplicite
4. Aggiungi un DO $$ block di validazione nella migration
5. Documenta la funzione con il commento WARNING standard (vedi sotto)
6. Verifica con la migration di audit (20260329130000) che la nuova view
   non venga segnalata come sospetta
```

**Template commento WARNING standard:**
```sql
-- WARNING:
-- Questa funzione è il SINGLE SOURCE OF TRUTH per [tipo di accesso].
-- Non bypassarla con query dirette o view non filtrate.
-- Le VIEW bypassano la RLS: il filtro auth.uid() deve essere in fn body.
```

---

## Query di Verifica Rapida in Produzione

Eseguire nel Supabase SQL Editor dopo ogni deploy:

```sql
-- 1. Verificare che user_tenants_view deleghi alla funzione
SELECT pg_get_viewdef('public.user_tenants_view'::regclass, true);
-- Deve contenere: get_user_tenants

-- 2. Verificare che get_my_tenant_ids non usi nomi legacy
SELECT prosrc FROM pg_proc WHERE proname = 'get_my_tenant_ids';
-- NON deve contenere: v2_tenants, v2_tenant_memberships

-- 3. Verificare attributi di sicurezza delle funzioni canoniche
SELECT proname, prosecdef AS secdef, provolatile AS vol
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_tenants', 'get_my_tenant_ids');
-- prosecdef = t (SECURITY DEFINER), provolatile = s (STABLE)

-- 4. Nessun tenant con ruolo NULL (loggato come utente qualsiasi)
SELECT * FROM public.user_tenants_view WHERE user_role IS NULL;
-- Expected: 0 righe

-- 5. Consistenza view vs funzione
SELECT id FROM public.user_tenants_view
EXCEPT
SELECT id FROM public.get_user_tenants();
-- Expected: 0 righe

-- 6. Audit view sospette
SELECT viewname, left(definition, 200) AS def_preview
FROM pg_views
WHERE schemaname = 'public'
  AND (definition ILIKE '%tenants%' OR definition ILIKE '%tenant_memberships%')
  AND definition NOT ILIKE '%auth.uid()%'
  AND definition NOT ILIKE '%auth.email()%'
  AND viewname NOT IN ('user_tenants_view', 'my_pending_invites_view');
-- Expected: 0 righe
```

---

## Cronologia Bug e Fix

| Data | Migration | Evento |
|------|-----------|--------|
| 2026-03-12 | `20260312170000` | ❌ `v2_user_tenants_view` creata senza WHERE — **CRITICAL LEAK**: tutti i tenant visibili a tutti |
| 2026-03-15 | `20260315160000` | ✅ Primo fix: aggiunto `WHERE … get_my_tenant_ids()` |
| 2026-03-17 | `20260317220000` | ✅ Fix alternativo: `WHERE owner OR active member` |
| 2026-03-17 | `20260317270000` | ✅ Fix finale: CASE role + WHERE guard su tabelle rinominate |
| 2026-03-29 | `20260329100000` | ✅ Hardening: `get_user_tenants()` SECURITY DEFINER |
| 2026-03-29 | `20260329110000` | ✅ Hardening: view delega alla funzione (schema congelato) |
| 2026-03-29 | `20260329120000` | ✅ Fix: `get_my_tenant_ids()` referenziava ancora `v2_*` tables |
| 2026-03-29 | `20260329130000` | ✅ Audit: scan automatico view sospette |
