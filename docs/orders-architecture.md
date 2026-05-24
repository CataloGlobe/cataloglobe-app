# Orders Architecture — Epic Ordinazioni dal Tavolo

> **Status**: decisioni cristallizzate, pronto per implementazione
> **Versione**: 1.2
> **Data**: maggio 2026
> **Owner**: Lorenzo
> **Related**: `docs/orders-audit.md`, `CLAUDE.md`
>
> **Changelog v1.2** (post Fase 2 deploy parziale + audit empirici):
>
> - §4.3 corretto: `options_snapshot.primary_option` NON contiene `price_delta` (il prezzo è già in `unit_price_snapshot` / `line_total`). `addons[i].price_delta` resta.
> - §4.5 corretto: `current_total` nella view `v_tables_with_state` sottrae la somma delle rettifiche (`is_rectification = true`) dalla somma degli ordini padre. Allineato alla migration `20260519180000`.
> - §5.2 corretto (rispetto v1.1): l'env var del secret di firma è `CUSTOMER_JWT_SECRET`, NON `SUPABASE_JWT_SECRET`. Supabase riserva il prefisso `SUPABASE_` per env vars auto-iniettate, quindi un nome custom è obbligatorio. Il valore del secret resta il JWT Secret di progetto (Settings → API).
> - §16 espanso: pattern definitivo di rate limiting (tabella `rate_limit_buckets` + RPC `increment_rate_limit` + helper TS `rateLimit.ts` + cron cleanup + hardening REVOKE espliciti).
> - §16 corretto: chiave rate-limit di `resolve-table` è `qr_token` (non IP).
> - §19 nuovo: "Known limitations / Open issues" — sessioni orfane su JWT-sign failure, `product_availability_overrides` non wired nel public catalog, override product-level su prodotti senza PRIMARY_PRICE.
>
> **Changelog v1.1** (post-discovery JWT custom Supabase, storico):
>
> - §5.2 corretto: JWT firmato con `SUPABASE_JWT_SECRET` (non `CUSTOMER_JWT_SECRET`). Il pattern è "bring-your-own-JWT" ufficialmente supportato da Supabase. — _Rivisto in v1.2: l'env var deve chiamarsi `CUSTOMER_JWT_SECRET`._
> - §5.2 aggiunto: il JWT custom DEVE portare claim `role: "anon"` (non `"authenticated"`) per non confliggere con le policy admin.
> - §5.2 aggiunto: claim standard JWT obbligatori (sub, iss, iat, exp, aud) oltre al claim custom `customer_session_id`.
> - §5.2 aggiunto: dettaglio policy anon che verranno create. Solo SELECT per orders/order_items, SELECT + UPDATE per customer_sessions (limitato a customer_name via Edge Function).
> - §6.2 aggiornato: Realtime rispetta automaticamente RLS, niente configurazione aggiuntiva.
> - §9.1 aggiornato: cancel-order è Edge Function, NON policy UPDATE anon su orders.

Questo documento è la **fonte di verità** per tutte le decisioni architetturali dell'epic Ordinazioni. È il pendant di `translations-architecture-v2.md` per il dominio ordini.

In caso di conflitto con commenti nel codice o memoria di altre sessioni, **questo documento prevale**. Aggiornare qui PRIMA di cambiare il codice.

---

## 0. Indice

1. Visione e perimetro MVP
2. Modello concettuale
3. Sessione cliente e fusione tavolo (`order_groups`)
4. Schema database
5. RLS e sicurezza
6. Real-time: pattern admin e pattern cliente (JWT custom)
7. Resolver server-side e validazione submit
8. Stati ordine e transizioni
9. Ticket di rettifica e cancellazione
10. Disponibilità prodotto con scope di reset
11. Tavoli: CRUD, QR, soft-delete, lifecycle
12. UI admin: route, page, drawer
13. UI cliente: schermata "I miei ordini", carrello, sheet
14. Edge Functions: contratti
15. Cron jobs
16. Rate limiting e abuse prevention
17. Constraints fuori MVP e porte aperte
18. Glossario
19. Known limitations / Open issues

---

## 1. Visione e perimetro MVP

### Cosa è incluso

Sistema completo di ordinazione dal tavolo:

- Cliente scansiona QR tavolo, naviga menu, ordina, vede stato in real-time.
- Admin riceve ordini in real-time in dashboard sede, gestisce stati, chiude tavoli.
- Sessioni cliente individuali con possibilità opzionale di "ordinare insieme" al tavolo.
- Disponibilità prodotto gestita per sede, con scope di reset.
- Tavoli come entità di prima classe con QR persistenti.

### Cosa è esplicitamente escluso (per non chiudere le porte)

| Funzionalità                      | Quando      | Note                                                                  |
| --------------------------------- | ----------- | --------------------------------------------------------------------- |
| Pagamenti online (Stripe Connect) | Fase 2      | Schema già pronto: `total_amount`, `currency`, `order_groups`         |
| KDS separato cucina               | Fase 3      | Aggiungeremo stati `in_preparation`, `ready` all'enum                 |
| Mappa visuale tavoli              | Fase 2      | Schema `tables` pronto, manca solo UI                                 |
| Stock counter automatico          | Fase futura | `product_availability_overrides` accoglie `stock_remaining` opzionale |
| Push notification browser/mobile  | Fase 2      | Real-time admin sufficiente per MVP                                   |
| App mobile dedicata               | Fase futura | Web mobile sufficiente                                                |
| Account cliente / loyalty         | Fase futura | `customer_sessions` potrà avere `user_id` nullable                    |
| Asporto/delivery                  | Fase 4+     | Modello `tables` accoglie tavoli "Banco" / "Asporto"                  |
| Prenotazioni                      | Fase 3      | Tabella `reservations` separata                                       |
| Split bill UI dedicata            | Fase 2      | Già nativo via `customer_session_id` / `order_group_id`               |
| Stampa comanda fisica             | Fase 2/3    | Solo gestionale digitale nell'MVP                                     |

### Principi guida

1. **Future-proof prima di velocità**. Ogni scelta passa il test "rompe nulla quando aggiungeremo pagamenti, KDS, analytics?".
2. **Immutabilità degli ordini**. Un ordine inviato non si modifica mai. Le modifiche sono nuovi ordini (rettifiche).
3. **Server-side autoritativo**. Prezzi, disponibilità, validità: sempre ricalcolati lato server al submit. Il client è solo un'interfaccia.
4. **Privacy by default**. Il cliente vede solo i propri ordini. Niente leakage cross-sessione, cross-tavolo, cross-tenant.
5. **Pattern coerenti**. Replichiamo le convenzioni CataloGlobe (Service Layer, Drawer, Edge Functions, RLS) — niente patterns nuovi senza motivo forte.

---

## 2. Modello concettuale

```
┌──────────────────────────────────────────────────────────────────┐
│                          TENANT                                   │
│                                                                   │
│  ┌──────────────┐         ┌─────────────────────────────────┐   │
│  │  ACTIVITY    │◄────────┤  TABLES (label, qr_token, …)    │   │
│  │  (sede)      │         └─────────────────────────────────┘   │
│  └──────┬───────┘                       │                        │
│         │                               │                        │
│         │                               ▼                        │
│         │              ┌──────────────────────────────────┐     │
│         │              │  CUSTOMER_SESSIONS (per phone)    │     │
│         │              │  - current_table_id               │     │
│         │              │  - order_group_id (nullable)      │     │
│         │              └──────────────────────────────────┘     │
│         │                       │                                │
│         │                       │                                │
│         │              ┌────────▼─────────────────────┐         │
│         │              │  ORDER_GROUPS                 │         │
│         │              │  (conto condiviso al tavolo)  │         │
│         │              └────────┬─────────────────────┘         │
│         │                       │                                │
│         │                       ▼                                │
│         │              ┌──────────────────────────────┐         │
│         │              │  ORDERS (ticket immutabile)   │         │
│         │              │  - status, submitted_at       │         │
│         │              │  - parent_order_id (rettifica)│         │
│         │              └────────┬─────────────────────┘         │
│         │                       │                                │
│         │                       ▼                                │
│         │              ┌──────────────────────────────┐         │
│         │              │  ORDER_ITEMS (snapshot)       │         │
│         │              │  - name, price, options       │         │
│         │              └──────────────────────────────┘         │
│         │                                                        │
│         │              ┌──────────────────────────────────┐    │
│         └─────────────►│  PRODUCT_AVAILABILITY_OVERRIDES   │    │
│                        │  - available, auto_reset_at       │    │
│                        └──────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Letture chiave del modello

- **Tavolo** = endpoint fisico di distribuzione. Ha QR persistente.
- **Sessione cliente** = identità per un telefono. Vive 12h, segue il cliente tra tavoli.
- **Order group** = conto condiviso opzionale (più sessioni che ordinano insieme).
- **Ordine** = singolo "Invia" del cliente. Immutabile.
- **Ordine di rettifica** = nuovo ordine che storna parzialmente un ordine padre.
- **Disponibilità override** = stato "esaurito" per-sede, con scope di reset.

---

## 3. Sessione cliente e fusione tavolo

### 3.1 Lifecycle sessione

Una `customer_session` viene creata al primo scan del QR di un tavolo da parte di un telefono che non ha `customer_session_id` valido in localStorage.

```
Cliente scansiona QR
       │
       ▼
Frontend cerca customer_session_id in localStorage
       │
       ├─── Trovato e expires_at > now()
       │           │
       │           ▼
       │    UPDATE current_table_id (può cambiare)
       │    UPDATE last_activity_at
       │
       └─── Non trovato / scaduto
                   │
                   ▼
            INSERT customer_sessions
            Salva customer_session_id in localStorage
```

### 3.2 Fusione opzionale al secondo accesso (B+)

Quando un secondo telefono scansiona il QR di un tavolo dove esiste già almeno una sessione attiva, il sistema offre la scelta:

```
Sessioni attive sul tavolo = N (con N >= 1)
       │
       ▼
Mostra sheet non bloccante:
┌────────────────────────────────────┐
│  C'è già qualcuno al tavolo!       │
│                                     │
│  [ Ordina insieme ]  ← default     │
│  [ Ordina separatamente ]          │
└────────────────────────────────────┘
       │
       ├─── "Insieme" → assegna order_group_id esistente
       │
       └─── "Separatamente" → ordini con order_group_id = NULL
```

**Rationale**: il caso d'uso ristorazione italiana (famiglie, coppie, gruppi) prevede conto unico. Il default visivamente prominente è "insieme". Il secondo cliente sceglie consapevolmente.

### 3.3 Modello dati sessione

```sql
customer_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id         uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  current_table_id    uuid REFERENCES tables(id) ON DELETE SET NULL,
  order_group_id      uuid REFERENCES order_groups(id) ON DELETE SET NULL,
  customer_name       text,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at    timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_sessions_tenant_activity ON customer_sessions(tenant_id, activity_id);
CREATE INDEX idx_customer_sessions_table ON customer_sessions(current_table_id) WHERE current_table_id IS NOT NULL;
CREATE INDEX idx_customer_sessions_expires ON customer_sessions(expires_at);
CREATE INDEX idx_customer_sessions_group ON customer_sessions(order_group_id) WHERE order_group_id IS NOT NULL;
```

### 3.4 Order groups

```sql
order_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  table_id        uuid NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_groups_tenant_activity ON order_groups(tenant_id, activity_id);
CREATE INDEX idx_order_groups_table ON order_groups(table_id);
CREATE INDEX idx_order_groups_open ON order_groups(table_id, status) WHERE status = 'open';
```

**Regole**:

- Un `order_group` esiste sempre con almeno una sessione (il primo cliente lo crea implicitamente).
- Più sessioni possono puntare allo stesso `order_group_id`.
- Quando admin "chiude il tavolo" → `order_groups.status = 'closed'`, `closed_at = now()`.
- Un nuovo cliente che scansiona dopo chiusura crea un nuovo `order_group`.

### 3.5 Trasferimento tra tavoli

Caso: cliente al tavolo T5 viene spostato dal cameriere al tavolo T8.

```
Cliente scansiona QR T8 (ha già customer_session_id)
       │
       ▼
UPDATE customer_sessions SET
  current_table_id = T8,
  order_group_id = NULL  -- la sessione perde il group del tavolo precedente
WHERE id = customer_session_id
```

Gli ordini già inviati restano sul tavolo originale (immutabilità). Se hai ordini ancora `submitted/acknowledged` sul T5, l'admin li vede ancora là e li gestisce. Una colonna calcolata in dashboard mostra "Cliente migrato → ora al T8" per evitare confusione.

---

## 4. Schema database

### 4.1 Tables

```sql
tables (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id       uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  label             text NOT NULL,
  qr_token          uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  seats             smallint CHECK (seats > 0),
  zone              text,
  maintenance_mode  boolean NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, label) WHERE deleted_at IS NULL
);

CREATE INDEX idx_tables_tenant_activity ON tables(tenant_id, activity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tables_qr_token ON tables(qr_token) WHERE deleted_at IS NULL;
CREATE INDEX idx_tables_zone ON tables(activity_id, zone) WHERE deleted_at IS NULL;
```

**Note**:

- `qr_token` è uuid generato server-side, mai esposto in URL admin (solo in URL pubblico cliente).
- `maintenance_mode = true` blocca la creazione di nuove sessioni su quel tavolo (errore "Tavolo non disponibile").
- `deleted_at` per soft-delete. Pattern A (blocca se ordini aperti) vs Pattern B (consenti se nessun ordine aperto) gestito a livello service/UI.

### 4.2 Orders

```sql
orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id            uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  table_id               uuid NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
  customer_session_id    uuid NOT NULL REFERENCES customer_sessions(id) ON DELETE RESTRICT,
  order_group_id         uuid REFERENCES order_groups(id) ON DELETE SET NULL,
  parent_order_id        uuid REFERENCES orders(id) ON DELETE RESTRICT,
  is_rectification       boolean NOT NULL DEFAULT false,
  customer_name_snapshot text,
  status                 text NOT NULL CHECK (status IN ('submitted', 'acknowledged', 'delivered', 'cancelled')),
  version                int NOT NULL DEFAULT 1,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  acknowledged_at        timestamptz,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  cancelled_by           text CHECK (cancelled_by IN ('customer', 'admin') OR cancelled_by IS NULL),
  cancellation_reason    text,
  notes                  text,
  total_amount           numeric(10, 2) NOT NULL CHECK (total_amount >= 0),
  currency               char(3) NOT NULL DEFAULT 'EUR',
  resolved_schedule_id   uuid REFERENCES schedules(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_tenant_activity ON orders(tenant_id, activity_id);
CREATE INDEX idx_orders_table_status ON orders(table_id, status);
CREATE INDEX idx_orders_session ON orders(customer_session_id);
CREATE INDEX idx_orders_group ON orders(order_group_id) WHERE order_group_id IS NOT NULL;
CREATE INDEX idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
CREATE INDEX idx_orders_active ON orders(activity_id, status) WHERE status IN ('submitted', 'acknowledged');
CREATE INDEX idx_orders_submitted_at ON orders(submitted_at DESC);
```

**Note critiche**:

- `parent_order_id` + `is_rectification = true` per ordini di storno parziale (vedi §9).
- `version` per optimistic locking: ogni transizione di stato incrementa `version`. UPDATE include `WHERE version = X`.
- `total_amount` è snapshot. Per ordini di rettifica può essere negativo? **No**, vincolo `>= 0`. Lo storno è una riga separata con `is_rectification = true` e amount positivo che indica "quanto stornare".
- `resolved_schedule_id` per audit/debug. Non usato per logica.

### 4.3 Order items

```sql
order_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id             uuid NOT NULL,  -- FK debole, no cascade
  product_name_snapshot  text NOT NULL,
  unit_price_snapshot    numeric(10, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity               smallint NOT NULL CHECK (quantity > 0),
  line_total             numeric(10, 2) NOT NULL CHECK (line_total >= 0),
  options_snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_notes             text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

**`options_snapshot` schema** (jsonb):

```json
{
  "primary_option": {
    "group_id": "uuid",
    "group_name": "Taglia",
    "value_id": "uuid",
    "value_name": "Media"
  },
  "addons": [
    {
      "group_id": "uuid",
      "group_name": "Mozzarella extra",
      "value_id": "uuid",
      "value_name": "Sì",
      "price_delta": 1.50
    }
  ]
}
```

**Note di shape**:

- `primary_option` può essere `null` se il prodotto non ha gruppo `PRIMARY_PRICE` (es. caffè a prezzo unico).
- `addons` è sempre un array (vuoto se nessun addon selezionato).
- `price_delta` esiste **solo** dentro `addons[i]` e contiene il valore di `product_option_values.price_modifier` cristallizzato al momento del submit.
- Il prezzo finale dell'item vive nei campi separati `unit_price_snapshot` e `line_total` di `order_items`. `options_snapshot` è solo display/audit; **non** sommare manualmente i `price_delta` per calcolare il totale.

### 4.4 Product availability overrides

```sql
product_availability_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id       uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  available         boolean NOT NULL DEFAULT true,
  disabled_at       timestamptz,
  disabled_reason   text,
  auto_reset_at     timestamptz,  -- NULL = indeterminato, valore = quando il cron lo resetta
  disabled_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, product_id)
);

CREATE INDEX idx_pao_tenant_activity ON product_availability_overrides(tenant_id, activity_id);
CREATE INDEX idx_pao_unavailable ON product_availability_overrides(activity_id, product_id) WHERE available = false;
CREATE INDEX idx_pao_auto_reset ON product_availability_overrides(auto_reset_at) WHERE auto_reset_at IS NOT NULL;
```

**Logica**:

- Record assente per (activity_id, product_id) → prodotto disponibile (default).
- Record presente con `available = false` → prodotto NON disponibile in quella sede.
- Cron notturno: `UPDATE SET available = true WHERE auto_reset_at < now() AND auto_reset_at IS NOT NULL`.
- `auto_reset_at = NULL` → resta disabilitato finché admin non interviene manualmente.

### 4.5 Vista derivata: tavoli con stato

```sql
CREATE OR REPLACE VIEW v_tables_with_state
WITH (security_invoker = true)
AS
SELECT
  t.*,
  COUNT(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now())
    AS active_sessions_count,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('submitted', 'acknowledged'))
    AS pending_orders_count,
  COUNT(DISTINCT og.id) FILTER (WHERE og.status = 'open')
    AS open_groups_count,
  COALESCE(
    SUM(o.total_amount) FILTER (
      WHERE o.status IN ('submitted', 'acknowledged', 'delivered')
        AND o.is_rectification = false
    )
    -
    SUM(o.total_amount) FILTER (
      WHERE o.status IN ('submitted', 'acknowledged', 'delivered')
        AND o.is_rectification = true
    ),
    0
  ) AS current_total
FROM tables t
LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
LEFT JOIN order_groups og ON og.table_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id;
```

**Uso**: la dashboard admin legge da questa view, non da `tables` direttamente. Il "tavolo occupato" è `active_sessions_count > 0 OR pending_orders_count > 0`.

**`current_total` e rettifiche**: le rettifiche (`orders.parent_order_id IS NOT NULL` e `orders.is_rectification = true`, vedi §9.2) sono ordini Postgres separati con `total_amount > 0` che compensano un ordine padre già consegnato. Una `SUM(total_amount)` ingenua le sommerebbe gonfiando il conto. La view splitta quindi le righe per `is_rectification` e sottrae la somma delle rettifiche dalla somma degli ordini padre — il risultato è il totale netto effettivamente da pagare. Riferimento implementativo: migration `20260519180000_create_v_tables_with_state.sql`.

---

## 5. RLS e sicurezza

### 5.1 Pattern tenant-scoped standard

Tutte le tabelle seguono il pattern già consolidato:

```sql
ALTER TABLE <tabella> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabella>_tenant_select" ON <tabella>
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "<tabella>_tenant_insert" ON <tabella>
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "<tabella>_tenant_update" ON <tabella>
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "<tabella>_tenant_delete" ON <tabella>
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT get_my_tenant_ids()));
```

**Tabelle che applicano questo pattern standard**:

- `tables`
- `order_groups`
- `product_availability_overrides`

### 5.2 Pattern accesso cliente anon (JWT custom)

`orders`, `order_items`, `customer_sessions` devono essere accessibili a client anon **solo per le proprie sessioni**.

Approccio: **pattern "bring-your-own-JWT"** ufficialmente supportato da Supabase. Una Edge Function firma un JWT con la chiave di firma del progetto, includendo un claim custom `customer_session_id`. Il client lo passa come `accessToken` al supabase-js. PostgREST verifica firma + scadenza prima ancora di accedere al DB.

**Helper function** (creata in task 1.3):

```sql
CREATE OR REPLACE FUNCTION get_jwt_customer_session_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'customer_session_id',
    ''
  )::uuid;
$$;
```

**Firma e claim del JWT custom**:

- **Secret**: env var `CUSTOMER_JWT_SECRET`. Il **valore** deve essere copia esatta del JWT Secret di progetto (dashboard Supabase → Settings → API → JWT Settings) — la stessa chiave che Supabase Auth usa per i suoi token. Questo permette a PostgREST di accettare i JWT custom come token Supabase validi; firmati con qualsiasi altra chiave vengono rigettati. Il **nome** della variabile NON può essere `SUPABASE_JWT_SECRET` perché Supabase riserva il prefisso `SUPABASE_` per env vars auto-iniettate (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) e blocca la creazione di secret custom con quel prefisso. Setup operativo: `supabase secrets set CUSTOMER_JWT_SECRET="<valore>"` oppure dashboard Settings → Edge Functions → Secrets.
- **Algoritmo**: HS256 (corrisponde alla configurazione del progetto).
- **Ruolo**: claim `role: "anon"`. Questo fa sì che PostgREST switchi la sessione PostgreSQL al ruolo `anon`, attivando le policy `TO anon`. NON usare `role: "authenticated"`: confliggerebbe con le policy admin tenant-scoped che già esistono.
- **Claim standard obbligatori**: `sub` (sessionId), `iss` (project ref Supabase), `iat`, `exp` (now + 12h), `aud: "authenticated"`.
- **Claim custom**: `customer_session_id` (uuid).

Esempio payload:

```json
{
  "role": "anon",
  "sub": "f47a4c10-58cc-4372-a567-0e02b2c3d479",
  "iss": "https://lxeawrpjfphgdspueiag.supabase.co/auth/v1",
  "iat": 1716120000,
  "exp": 1716163200,
  "aud": "authenticated",
  "customer_session_id": "f47a4c10-58cc-4372-a567-0e02b2c3d479"
}
```

**Lifecycle JWT**:

1. Client scansiona QR → chiama Edge Function `resolve-table` con `qr_token`.
2. Edge Function valida il token, crea/recupera la `customer_session`, **firma JWT con `CUSTOMER_JWT_SECRET`** + claim standard + claim `customer_session_id`, lo ritorna.
3. Client salva il JWT in localStorage insieme al `customer_session_id`.
4. Tutte le chiamate successive (subscribe Realtime, query SELECT) usano questo JWT come `accessToken` nel supabase-js.
5. Le mutations (submit, cancel) passano da Edge Function dedicate (NON via supabase-js diretto) — vedi §14 e §9.

**Policy anon che verranno create nel task 1.7**:

```sql
-- customer_sessions: cliente vede solo la propria sessione
CREATE POLICY "Customer select own session" ON customer_sessions
  FOR SELECT TO anon
  USING (id = (SELECT public.get_jwt_customer_session_id()));

-- customer_sessions: cliente può aggiornare il proprio nome
-- (il client farà solo update({customer_name: ...}); le altre colonne sono
-- gestite via Edge Function service_role)
CREATE POLICY "Customer update own session" ON customer_sessions
  FOR UPDATE TO anon
  USING (id = (SELECT public.get_jwt_customer_session_id()))
  WITH CHECK (id = (SELECT public.get_jwt_customer_session_id()));

-- orders: cliente vede SOLO propri ordini
CREATE POLICY "Customer select own orders" ON orders
  FOR SELECT TO anon
  USING (customer_session_id = (SELECT public.get_jwt_customer_session_id()));

-- order_items: cliente vede SOLO item dei propri ordini (via JOIN)
CREATE POLICY "Customer select own order items" ON order_items
  FOR SELECT TO anon
  USING (order_id IN (
    SELECT id FROM orders
    WHERE customer_session_id = (SELECT public.get_jwt_customer_session_id())
  ));
```

**Tabelle SENZA policy anon (mai, by design)**:

- `tables`: accesso pubblico solo via RPC `resolve_table_by_token` SECURITY DEFINER (task 1.9).
- `order_groups`: admin-only. Il cliente non vede direttamente i group; vede solo i propri ordini, che hanno `order_group_id` come riferimento.
- `product_availability_overrides`: admin-only. Le disponibilità sono applicate server-side dal resolver nelle Edge Functions pubbliche (`resolve-public-catalog`, `submit-order`).

**Tutte le mutation client passano da Edge Functions** (con `service_role`, bypass RLS):

- INSERT orders + order_items → Edge Function `submit-order`
- UPDATE orders.status → Edge Function `cancel-order` (customer) o `acknowledge-order`/`deliver-order`/`cancel-order-admin` (admin)
- INSERT/UPDATE customer_sessions (escluso customer_name) → Edge Function `resolve-table`

Nessuna policy INSERT/DELETE anon è necessaria. Le policy SELECT anon servono solo per: (a) read-only browsing del cliente, (b) Realtime subscriptions filtrate per `customer_session_id`.

### 5.3 Tavoli pubblici via RPC

Lookup di un tavolo via `qr_token` da parte di client non autenticato:

```sql
CREATE OR REPLACE FUNCTION resolve_table_by_token(p_token uuid)
RETURNS TABLE (
  table_id        uuid,
  tenant_id       uuid,
  activity_id     uuid,
  activity_slug   text,
  label           text,
  zone            text,
  maintenance_mode boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.activity_id,
    a.slug AS activity_slug,
    t.label,
    t.zone,
    t.maintenance_mode
  FROM tables t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.qr_token = p_token
    AND t.deleted_at IS NULL
    AND a.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_table_by_token TO anon, authenticated;
```

### 5.4 Rate limiting

- `submit-order`: 10/min per `customer_session_id`. Tracking via tabella `rate_limit_counters` (counter sliding window 60s) o memory store nell'edge function (più semplice, accetta reset al cold start).
- `resolve-table`: 30/min per IP. Previene enumerazione token.

---

## 6. Real-time

### 6.1 Admin: subscribe orders per activity

```typescript
// src/hooks/useOrdersRealtime.ts
const channel = supabase
  .channel(`orders:activity:${activityId}`)
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "orders",
      filter: `activity_id=eq.${activityId}`
    },
    handleOrderChange
  )
  .subscribe();
```

**Publication**: estendere `supabase_realtime` per includere `orders`, `order_items`, `customer_sessions`, `order_groups`.

**Fallback polling**: hook `useOrdersStream(activityId)` interno:

- Subscribe Realtime + interval polling 15s.
- Reconciliation tra eventi Realtime e snapshot polling (dedup).
- Indicatore stato (verde/giallo/rosso).

### 6.2 Cliente: subscribe propri ordini via JWT

```typescript
// Il supabase client del cliente è creato con il JWT custom come `accessToken`.
// Ogni richiesta (HTTP e WebSocket per Realtime) porta automaticamente il JWT.
const customerSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => customerJwt // letto da localStorage
});

const channel = customerSupabase
  .channel(`orders:session:${customerSessionId}`)
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "orders",
      filter: `customer_session_id=eq.${customerSessionId}`
    },
    handleMyOrderChange
  )
  .subscribe();
```

**Meccanismo di sicurezza Realtime**: Supabase Realtime applica automaticamente le RLS al broadcast degli eventi. Prima di inviare un cambio a un client subscriber, il server Realtime assume temporaneamente l'identità del client (basata sul suo JWT) ed esegue una verifica RLS interna: se la policy `Customer select own orders` valuta `false` per quel cambio, l'evento non viene inviato a quel client.

Implicazione pratica: anche se il filter `customer_session_id=eq.X` lato client venisse manomesso (es. dev tools), il cliente continuerebbe a ricevere SOLO gli ordini che la policy gli permette di vedere. **L'RLS è la difesa autoritativa, il filter è solo un'ottimizzazione di trasporto**.

### 6.3 Pubblicazione tabelle in publication

Migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders, order_items, customer_sessions, order_groups;
```

---

## 7. Resolver server-side e validazione submit

### 7.1 Reuso `scheduleResolver`

`submit-order` riusa `resolveActivityCatalogs(activityId)` per ottenere:

- Catalogo attivo
- Override visibilità
- Override prezzo
- Featured content

### 7.2 Pipeline validazione submit

```
Client invia: { table_id, items: [{product_id, quantity, options}], notes }
       │
       ▼
1. Verifica JWT custom → estrae customer_session_id
       │
       ▼
2. Verifica customer_session esiste, non scaduta, current_table_id = table_id
       │
       ▼
3. resolveActivityCatalogs(activity_id) → catalog risolto
       │
       ▼
4. Per ogni item:
   - product_id è nel catalog risolto?
   - product_id non è in product_availability_overrides con available=false?
   - options scelte sono valide per il product?
   - ricalcola unit_price da product + options (NON dal client)
       │
       ▼
5. Se TUTTO ok:
   - INSERT order (status=submitted, total ricalcolato)
   - INSERT order_items (snapshot completi)
   - Ritorna { order_id, status }
       │
       ▼
6. Se QUALCOSA non valido:
   - 409 Conflict con dettaglio: { invalid_items: [...], reason: "..." }
   - Client mostra modale "Il menu è cambiato, ricarica"
```

### 7.3 Codici errore standardizzati

| Code                       | Significato                       | HTTP |
| -------------------------- | --------------------------------- | ---- |
| `INVALID_JWT`              | JWT cliente non valido o scaduto  | 401  |
| `SESSION_EXPIRED`          | customer_session scaduta          | 401  |
| `TABLE_NOT_FOUND`          | qr_token non valido               | 404  |
| `TABLE_MAINTENANCE`        | tavolo in manutenzione            | 423  |
| `ACTIVITY_INACTIVE`        | sede non attiva                   | 403  |
| `PRODUCT_NOT_AVAILABLE`    | prodotto esaurito                 | 409  |
| `PRODUCT_NOT_IN_CATALOG`   | prodotto non nel catalogo risolto | 409  |
| `INVALID_OPTIONS`          | opzioni invalide                  | 400  |
| `RATE_LIMIT_EXCEEDED`      | troppi submit ravvicinati         | 429  |
| `ORDER_NOT_FOUND`          | ordine inesistente o non tuo      | 404  |
| `INVALID_STATE_TRANSITION` | transizione non permessa          | 409  |

---

## 8. Stati ordine e transizioni

### 8.1 Stati

| Stato          | Significato                            | Chi può causare ingresso                                                 |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `submitted`    | Cliente ha inviato, admin non ha visto | Cliente (submit-order)                                                   |
| `acknowledged` | Admin ha preso in carico               | Admin (acknowledge-order)                                                |
| `delivered`    | Consegnato al tavolo                   | Admin (deliver-order)                                                    |
| `cancelled`    | Annullato                              | Cliente (cancel-order, solo se submitted) o admin (cancel-order, sempre) |

### 8.2 Transizioni permesse

```
submitted ──[admin]──► acknowledged ──[admin]──► delivered
    │                       │
    │                       └──[admin]──► cancelled
    │
    ├──[cliente]──► cancelled  (solo se ancora submitted)
    │
    └──[admin]──► cancelled
```

### 8.3 Optimistic locking

Ogni transizione di stato è una UPDATE con `WHERE version = $current_version`. Se 0 righe modificate → 409 `INVALID_STATE_TRANSITION` con dettaglio.

```sql
UPDATE orders SET
  status = 'acknowledged',
  acknowledged_at = now(),
  version = version + 1,
  updated_at = now()
WHERE id = $order_id
  AND status = 'submitted'
  AND version = $expected_version;
```

---

## 9. Ticket di rettifica e cancellazione

### 9.1 Cancellazione totale

**Tutte le cancellazioni passano da Edge Function**, mai da `update()` diretto via supabase-js. Non esiste policy UPDATE anon su `orders` per cancellazioni: la coerenza dello stato e l'audit (chi, quando, perché) richiedono validazione server-side.

Edge Functions:

- **`cancel-order`** (customer): JWT custom richiesto. Estrae `customer_session_id` dal JWT, verifica che l'ordine appartenga alla sessione, verifica che `status = 'submitted'` (altrimenti errore `INVALID_STATE_TRANSITION`). UPDATE con `service_role` settando `status='cancelled', cancelled_at=now(), cancelled_by='customer', version=version+1`.
- **`cancel-order-admin`** (admin): JWT Supabase Auth standard. Verifica appartenenza tenant, accetta `reason` (obbligatorio). UPDATE permesso in qualsiasi stato non terminale.

L'ordine resta visibile nello storico ma non conta nel totale del tavolo (filtro `WHERE status != 'cancelled'` nei calcoli).

### 9.2 Rettifica parziale

Caso: admin vuole stornare 1 item su 3 da un ordine già `acknowledged`.

Edge Function `rectify-order`:

- Input: `parent_order_id`, `items_to_storno: [{order_item_id, quantity}]`, `reason`.
- Crea **nuovo ordine** con:
  - `parent_order_id = <originale>`
  - `is_rectification = true`
  - `status = 'delivered'` (la rettifica è già "consegnata" come operazione contabile)
  - `total_amount` = somma degli storni (positivo, indica "quanto sottrarre dal totale")
- INSERT `order_items` corrispondenti agli storni.

**Calcolo totale tavolo/group**: `SUM(amount WHERE is_rectification=false) - SUM(amount WHERE is_rectification=true)`.

**Nota UI MVP**: l'interfaccia per rettifica parziale può essere minimale ("storna intero item N") all'inizio. Lo schema è pronto per UI più sofisticata in fase 2.

---

## 10. Disponibilità prodotto con scope di reset

### 10.1 Scope di disabilitazione

L'admin disabilita un prodotto scegliendo tra:

| Scope UI                           | `auto_reset_at`      | Effetto                                      |
| ---------------------------------- | -------------------- | -------------------------------------------- |
| "Esaurito oggi"                    | `tomorrow 04:00 UTC` | Cron resetta automaticamente domattina       |
| "Disabilita a tempo indeterminato" | `NULL`               | Resta disabilitato finché admin non riattiva |

### 10.2 Reset notturno

Cron `daily_reset_availability` ogni giorno alle 04:00 UTC:

```sql
UPDATE product_availability_overrides
SET available = true,
    disabled_at = NULL,
    disabled_reason = NULL,
    auto_reset_at = NULL,
    updated_at = now()
WHERE auto_reset_at IS NOT NULL
  AND auto_reset_at <= now();
```

### 10.3 Quick action da dashboard ordini

Nel dettaglio di un ordine `acknowledged`, ogni item ha menu "..." con opzione "Segna prodotto esaurito oggi" → UPSERT in `product_availability_overrides` con scope giornaliero.

---

## 11. Tavoli: CRUD, QR, soft-delete

### 11.1 CRUD admin

Posizione UI: tab "Tavoli" in `ActivityDetailPage` (`/business/:businessId/locations/:activityId/tables`).

Operazioni:

- **Crea singolo**: `label`, `seats` opzionale, `zone` opzionale.
- **Crea batch**: "Da T1 a T20, zona X, Y posti default". Validazione anti-duplicato.
- **Modifica**: `label`, `seats`, `zone`, `maintenance_mode`.
- **Soft-delete**: con verifica impatto (vedi §11.3).
- **Rigenera QR**: nuovo `qr_token`, vecchio QR muore.

### 11.2 Generazione QR

Edge Function `generate-table-qrs`:

- Input: `activity_id`, `table_ids?: uuid[]` (opzionale, default tutti).
- Output: PDF con grid 4x4 di QR (uno per pagina A4), pronto da stampare.
- Libreria QR: `qrcode` (NPM, leggera, supporta SVG).
- Libreria PDF: `pdf-lib` (già in stack).
- URL nel QR: `https://cataloglobe.com/<activity_slug>?t=<qr_token>`.

### 11.3 Soft-delete pattern

**Pattern A** (blocca con drawer impatti): se il tavolo ha ordini `submitted` o `acknowledged`, drawer mostra:

- "Questo tavolo ha N ordini ancora aperti. Completali prima di archiviare."
- Lista ordini con link al dettaglio.
- Nessun bottone delete.

**Pattern B** (consenti soft-delete): se nessun ordine aperto:

- Conferma "Archiviare il tavolo T12? Lo storico ordini resta accessibile."
- UPDATE `deleted_at = now()`.
- Tavolo non più visibile nella lista, QR non più funzionante.

### 11.4 Maintenance mode

`maintenance_mode = true`:

- Il QR continua a essere valido (`resolve_table_by_token` ritorna dati).
- MA `resolve-table` Edge Function risponde con `TABLE_MAINTENANCE`.
- Client mostra "Tavolo temporaneamente non disponibile, chiama il personale".

---

## 12. UI admin

### 12.1 Route

```
/business/:businessId/orders/:activityId        → OrdersActivityPage (default)
/business/:businessId/orders/:activityId?table=X → OrdersActivityPage con drawer aperto
/business/:businessId/locations/:activityId/tables → ActivityDetailPage tab Tavoli
```

### 12.2 OrdersActivityPage

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Sede Via Roma                    [🟢 Real-time OK]  │
│ ⚠️ 3 ordini da prendere in carico                            │
├─────────────────────────────────────────────────────────────┤
│ Filtri: [Da prendere] [In preparazione] [Tutti] [Per zona]  │
├─────────────────────────────────────────────────────────────┤
│ ┌────────────────────┐ ┌────────────────────┐              │
│ │ T12  Sala interna  │ │ T5   Dehor         │              │
│ │ 3 clienti          │ │ 2 clienti          │              │
│ │ 5 ordini · €87.50  │ │ 2 ordini · €34.00  │              │
│ │ Più vecchio: 8 min │ │ Più vecchio: 2 min │              │
│ │ [Apri dettaglio]   │ │ [Apri dettaglio]   │              │
│ └────────────────────┘ └────────────────────┘              │
├─────────────────────────────────────────────────────────────┤
│ Tavoli a riposo ▼                                            │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 Drawer dettaglio tavolo

```
┌─ Drawer (lg, 720px) ─────────────────────────────────────┐
│ Tavolo T12 · Sala interna                       ✕        │
│ Totale corrente: €87.50      [Chiudi tavolo]             │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ 🔵 Sessione A · Marco (alle 19:30)                       │
│                                                           │
│   ┌─ Ordine #1247 ──────────────[submitted · 8 min]──┐  │
│   │ 1× Pizza Margherita     €8.00                     │  │
│   │ 1× Spritz Aperol         €5.00                    │  │
│   │ Note: senza cipolla                               │  │
│   │ Totale: €13.00                                    │  │
│   │ [Prendi in carico] [Annulla]                      │  │
│   └───────────────────────────────────────────────────┘  │
│                                                           │
│   ┌─ Ordine #1252 ──────────[acknowledged · 5 min]───┐  │
│   │ 1× Tiramisù              €5.00                    │  │
│   │ [Segna consegnato] [Annulla con motivo]           │  │
│   └───────────────────────────────────────────────────┘  │
│                                                           │
│ 🟢 Sessione B · (senza nome, alle 19:45)                 │
│   ...                                                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 12.4 Notifiche admin

- **Suono**: file audio `~1s` (es. "ding"). Configurabile in settings activity (mute, volume).
- **Badge contatore**: sul tab del browser `(3) CataloGlobe`.
- **Flash visuale**: card del tavolo fa fade-in arancione per 2s al nuovo `submitted`.
- **Toast in-app**: "Nuovo ordine al Tavolo 12".
- **Wake lock opzionale** per tablet: `navigator.wakeLock.request('screen')` al mount della pagina ordini.
- **Page Visibility API**: al ritorno foreground, forza polling immediato + reconciliation eventi mancati.

---

## 13. UI cliente

### 13.1 Flusso

```
Cliente scansiona QR
       │
       ▼
GET /<slug>?t=<qr_token>
       │
       ▼
PublicCollectionPage:
  - resolveTableAndSession({qr_token}) → JWT + customer_session_id + table info
  - Salva in localStorage
  - Se altre sessioni attive sul tavolo: mostra sheet fusione (B+)
  - Carica catalogo via resolve-public-catalog
       │
       ▼
Cliente naviga menu, aggiunge a carrello (state locale React)
       │
       ▼
Click "Invia ordine":
  - PublicSheet con riepilogo, note opzionali, conferma
  - POST /submit-order con JWT
  - 200 OK → reset carrello, apre schermata "I miei ordini"
  - 409 → modale "Menu aggiornato, ricarica"
```

### 13.2 Carrello

- Stato React locale (non server-side).
- Persistito in localStorage chiave `cart:<customer_session_id>`.
- Drawer/sheet "Carrello" accessibile da bottone floating con badge contatore.
- Item: prodotto + variante + opzioni + quantità + note.
- Modifica/rimozione singolo item finché non inviato.

### 13.3 Schermata "I miei ordini"

PublicSheet accessibile da bottone floating persistente (basso-destra mobile, header desktop) con badge contatore ordini attivi.

Mostra:

- Bottone "Aggiungi nome" in alto se `customer_name IS NULL`.
- Lista ordini propri (dal più recente).
- Per ogni ordine: stato (badge + icona), items, totale, timestamp.
- Azioni contestuali:
  - `submitted`: [Annulla ordine] (chiama cancel-order).
  - `acknowledged`: 🍳 "In preparazione. Chiama il personale per modifiche."
  - `delivered`: ✅ "Consegnato. Buon appetito!"
  - `cancelled`: ❌ "Annullato" + motivo se admin.

### 13.4 Real-time

Hook `useMyOrdersRealtime(jwtToken, customerSessionId)`:

- Crea client Supabase con `accessToken: jwtToken`.
- Subscribe canale `orders:session:<id>` con filter su `customer_session_id`.
- Dedup eventi.

---

## 14. Edge Functions: contratti

| Funzione                      | Auth                  | Input                                                    | Output                                                                                              |
| ----------------------------- | --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `resolve-table`               | anon                  | `{ qr_token, existing_customer_session_id? }`            | `{ jwt, customer_session_id, table, activity, existing_sessions_count, suggested_order_group_id? }` |
| `submit-order`                | customer JWT          | `{ items, notes?, join_order_group?: boolean }`          | `{ order_id, status, total }` or `{ error_code, invalid_items? }`                                   |
| `cancel-order` (customer)     | customer JWT          | `{ order_id }`                                           | `{ order_id, status }`                                                                              |
| `acknowledge-order`           | authenticated (admin) | `{ order_id, expected_version }`                         | `{ order_id, status, version }`                                                                     |
| `deliver-order`               | authenticated (admin) | `{ order_id, expected_version }`                         | `{ order_id, status, version }`                                                                     |
| `cancel-order-admin`          | authenticated (admin) | `{ order_id, expected_version, reason }`                 | `{ order_id, status, version }`                                                                     |
| `rectify-order`               | authenticated (admin) | `{ parent_order_id, items_to_storno, reason }`           | `{ rectification_order_id }`                                                                        |
| `close-table`                 | authenticated (admin) | `{ table_id }`                                           | `{ table_id, closed_orders_count, closed_groups_count }`                                            |
| `generate-table-qrs`          | authenticated (admin) | `{ activity_id, table_ids? }`                            | PDF binary                                                                                          |
| `toggle-product-availability` | authenticated (admin) | `{ product_id, activity_id, available, scope, reason? }` | `{ override_id }`                                                                                   |

**Pattern shared**: utility `customerJwt.ts` (sign/verify), `validateOrderItems.ts` (riusa resolver), `rateLimit.ts`.

---

## 15. Cron jobs

| Nome                       | Frequenza              | Funzione                                                                            |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `daily_reset_availability` | `0 4 * * *` UTC        | Reset overrides con `auto_reset_at < now()`                                         |
| `expire_customer_sessions` | `0 * * * *` (ogni ora) | Mark sessioni con `expires_at < now()` come "scadute" (UPDATE solo flag, no delete) |
| `cleanup-old-sessions`     | `0 5 * * *` UTC        | DELETE sessioni scadute da > 30 giorni senza ordini collegati                       |

Tutti via `pg_cron` con SECRET come pattern `cleanup-draft-schedules`.

---

## 16. Rate limiting

Tutti gli endpoint client-facing applicano rate limiting all'ingresso. La policy è **fail-closed**: un errore dello storage di rate limit blocca la request (HTTP 500) invece di lasciarla passare.

### Implementazione

**Storage backend**: tabella PostgreSQL `public.rate_limit_buckets` (migration `20260520214121_create_rate_limit_buckets.sql`). Schema minimale:

```sql
rate_limit_buckets (
  bucket_key   text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

RLS abilitata senza policy → accessibile esclusivamente via `service_role`. Nessuna colonna `tenant_id`: il rate limiting deve funzionare per chiamanti anon prima che esista contesto tenant.

**Algoritmo**: fixed-window counter. Per ogni chiave (es. `"resolve-table:qr-token:<uuid>"`) il counter si incrementa atomicamente all'interno della finestra corrente e si resetta a 1 quando la finestra rolla. L'UPSERT atomico è incapsulato nella function:

```sql
public.increment_rate_limit(p_bucket_key text, p_window_start timestamptz) RETURNS int
```

(migration `20260520215107_create_increment_rate_limit_rpc.sql`). Una RPC è necessaria perché supabase-js `.upsert()` non esprime la `CASE WHEN` del branching window-rollover; raw SQL `INSERT ... ON CONFLICT DO UPDATE` invece sì, e ottiene atomicità per row-lock senza advisory lock.

**Helper TypeScript**: `supabase/functions/_shared/rateLimit.ts` espone:

```ts
checkRateLimit(supabase, { key, limit, windowSeconds }): Promise<void>
```

Throwa `RateLimitExceededError extends Error` quando `count > limit`. L'Edge Function chiamante traduce in HTTP 429 con header `Retry-After`.

**Cleanup**: cron job `cleanup_rate_limit_buckets` (definito nella migration della tabella) ogni ora ai minuti `:10`, esegue `DELETE FROM rate_limit_buckets WHERE updated_at < now() - interval '1 hour'`. Le finestre più larghe pensiamo di usare sono di pochi minuti; oltre 1h lo state è dead weight.

**Hardening REVOKE espliciti**: `increment_rate_limit` è `SECURITY DEFINER` e DEVE seguire il pattern documentato in `CLAUDE.md` → "Funzioni SQL → SECURITY DEFINER service-role-only". `REVOKE FROM PUBLIC` da solo NON basta su Supabase: il bootstrap di progetto include `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`, quindi i grant ai role nominati sopravvivono. Migration `20260520220349_harden_increment_rate_limit_grants.sql` chiude empiricamente il buco: dopo l'apply, un attacco simulato `SET LOCAL role anon; SELECT increment_rate_limit(...)` ritorna `permission denied for function`.

### Soglie per endpoint

| Endpoint                  | Chiave bucket                                            | Limit  | Window |
| ------------------------- | -------------------------------------------------------- | ------ | ------ |
| `resolve-table`           | `resolve-table:qr-token:<qr_token>`                      | 30     | 60s    |
| `submit-order`            | `submit-order:session:<customer_session_id>`             | 10     | 60s    |
| `cancel-order` (customer) | `cancel-order:session:<customer_session_id>`             | 5      | 60s    |

Le soglie sono tunable nel codice dell'Edge Function senza migration: la tabella conserva solo il counter, mai i parametri del limit.

---

## 17. Constraint fuori MVP e porte aperte

### 17.1 Pagamenti (fase 2)

Quando aggiungeremo Stripe Connect:

- `orders.payment_status` (NULL | pending | succeeded | failed | refunded)
- `orders.stripe_payment_intent_id`
- Tabella `payments` separata per multi-payment per order (futuro)
- `order_groups.payment_mode` (single | split_by_session | split_by_item)
- Nessun cambio breaking ai modelli esistenti.

### 17.2 KDS (fase 3)

- Estensione enum `orders.status`: aggiunta `in_preparation`, `ready` tra `acknowledged` e `delivered`.
- Vista cucina: nuova route `/business/:businessId/kitchen/:activityId`.
- Possibili tag per "stazione" (cucina, bar, dolce) → nuova colonna `order_items.station` opzionale.

### 17.3 Stock counter (fase futura)

- `product_availability_overrides.stock_remaining` int nullable.
- Decremento atomico in `submit-order` con `UPDATE ... SET stock_remaining = stock_remaining - $qty WHERE stock_remaining >= $qty`.
- 0 = automaticamente unavailable.

### 17.4 Account cliente (fase futura)

- `customer_sessions.user_id` nullable, link a `auth.users`.
- Loyalty: tabella `customer_loyalty_points` legata a `user_id`.

### 17.5 Asporto / delivery (fase 4+)

- Estensione `tables` con `table_type: enum('dine_in', 'takeaway', 'delivery_pickup')`.
- O nuova tabella `delivery_orders` con campi indirizzo, slot consegna.

---

## 18. Glossario

| Termine                    | Significato                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **Tavolo**                 | Endpoint fisico con QR persistente, entità DB `tables`                                            |
| **Sessione cliente**       | Identità di un telefono per max 12h, entità `customer_sessions`                                   |
| **Order group**            | Conto condiviso (1+ sessioni che ordinano insieme), entità `order_groups`                         |
| **Ticket**                 | Sinonimo di "ordine" (un singolo invio), entità `orders`                                          |
| **Rettifica**              | Ordine `is_rectification=true` che storna item da `parent_order_id`                               |
| **Override disponibilità** | Stato "esaurito" per (sede, prodotto) con scope di reset                                          |
| **JWT custom**             | Token firmato server-side per autorizzare client anon (claim `customer_session_id`)               |
| **Resolver**               | `scheduleResolver.resolveActivityCatalogs(activityId)`                                            |
| **Snapshot**               | Dato cristallizzato al momento dell'invio ordine (nome, prezzo, opzioni)                          |
| **Optimistic locking**     | UPDATE con `WHERE version = $expected` per evitare race condition                                 |
| **Scope di reset**         | `auto_reset_at` su override disponibilità (NULL = indeterminato, valore = quando il cron resetta) |

---

## 19. Known limitations / Open issues

Lista di issue noti, accettati per ora, con possibili mitigazioni o note di follow-up. Aggiornata in v1.2 dopo i primi deploy della Fase 2.

### 19.1 Sessioni orfane su JWT sign failure

Nel flow di `resolve-table` la sequenza è: INSERT/UPDATE `customer_sessions` → sign JWT → return response. Se la firma JWT fallisce dopo che la sessione è stata creata (es. `CUSTOMER_JWT_SECRET` mal configurato o ruotato senza redeploy), la riga in `customer_sessions` resta persistita ma il client non riceve il JWT.

**Impatto**: data leftover (sessione "orfana" senza client che la usa). NON è un buco di sicurezza, NON è furto di sessione.

**Mitigazione attuale**: nessuna. La sessione orfana scade automaticamente dopo 12h via `expires_at`. Future invocazioni di `resolve-table` per lo stesso tavolo la rivedranno via `other_active_sessions_at_table` ma solo come "altri commensali", senza effetti collaterali.

**Mitigazione futura possibile**: avvolgere INSERT + JWT sign in una transaction Postgres, OPPURE firmare JWT prima dell'INSERT (generando UUID lato server e passandolo come id forzato). Entrambe complicano il codice senza valore proporzionato, dato che il problema si verifica solo in setup misconfiguration (l'happy path non lo trigger). Non prioritario.

### 19.2 `product_availability_overrides` non wired nel public catalog

La tabella `product_availability_overrides` (§4.4) viene letta da `validateOrderItems` per rigettare ordini su prodotti unavailable, ma **non** viene letta da `resolve-public-catalog` per il rendering pubblico. Conseguenza: un cliente può aggiungere al carrello un prodotto che il backoffice ha disabilitato e scoprire l'unavailability solo al submit (rigetto totale con codice `UNAVAILABLE_PRODUCTS`).

**Mitigazione futura** (Fase 4 UI public): aggiornare `resolve-public-catalog` per filtrare o grigiare i prodotti disabilitati nel catalogo. Marcato come `// SYNC` comment in `validateOrderItems.ts`.

### 19.3 Product-level price override su prodotti senza PRIMARY_PRICE

`validateOrderItems` replica fedelmente il comportamento di `resolveActivityCatalogs.ts` (~riga 1060): l'override product-level di `schedule_price_overrides` (con `option_value_id IS NULL`) viene applicato SOLO a prodotti che hanno un gruppo `PRIMARY_PRICE`. Prodotti senza `PRIMARY_PRICE` (es. caffè a prezzo unico) usano `products.base_price` ignorando l'override.

**Impatto**: una feature tipo "applica sconto 10% sul caffè durante happy hour" non funziona se il caffè non ha varianti.

**Decisione corrente**: replica fedele del comportamento esistente per non far divergere submit-time da render-time. Se domani la logica viene riconsiderata come bug, il fix va applicato in ENTRAMBI i posti (`resolveActivityCatalogs.ts` E `validateOrderItems.ts`), come già segnalato dai commenti `// ⚠️ SYNC`.

---

## Appendice A: ordine di implementazione consigliato

Fase 1 — Foundations DB (~3 giorni):

1. Migration `tables` + RLS + indexes + view `v_tables_with_state`
2. Migration `customer_sessions` + RLS
3. Migration `order_groups` + RLS
4. Migration `orders` + RLS (admin) + indexes
5. Migration `order_items` + RLS + indexes
6. Migration `product_availability_overrides` + RLS + indexes
7. Migration helper functions: `get_jwt_customer_session_id`, `resolve_table_by_token`
8. Migration RLS policies anon su `orders`, `order_items`, `customer_sessions`
9. Migration publication Realtime
10. Migration pg_cron jobs

Fase 2 — Shared utilities + Edge Functions (~6 giorni):

- `_shared/customerJwt.ts`
- `_shared/validateOrderItems.ts`
- `_shared/rateLimit.ts`
- Edge Functions: `resolve-table`, `submit-order`, `cancel-order`, `acknowledge-order`, `deliver-order`, `cancel-order-admin`, `rectify-order`, `close-table`, `toggle-product-availability`, `generate-table-qrs`

Fase 3 — Service layer + types (~2 giorni):

- `src/services/supabase/tables.ts`
- `src/services/supabase/orders.ts`
- `src/services/supabase/customerSessions.ts`
- `src/services/supabase/productAvailability.ts`
- Types e helpers

Fase 4 — UI admin (~7 giorni):

- Tab Tavoli in ActivityDetailPage + CRUD drawer
- Stampa QR (download PDF)
- OrdersActivityPage (vista live)
- Drawer dettaglio tavolo
- Toggle disponibilità rapido
- Notifiche audio/badge/flash

Fase 5 — UI cliente (~5 giorni):

- Routing `/:slug?t=<token>` + resolveTableAndSession
- Sheet fusione tavolo (B+)
- Carrello pubblico (state + sheet)
- Schermata "I miei ordini" con realtime
- Bottone "aggiungi nome"

Fase 6 — QA + iterazione (~5-7 giorni):

- Test E2E con Playwright
- Test concorrenza (submit simultaneo, optimistic locking)
- Test mobile reale (iOS Safari, Android Chrome)
- Tuning UX in base a feedback
- Security review (`/security-review`)

**Totale: ~30 giorni dev singolo full-time.**
