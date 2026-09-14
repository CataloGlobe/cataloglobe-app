# BLOCCO 2 · FASE 2.1 — Schema della tavolata

**Crei le migration e ti fermi.** Non eseguirle: `db push` lo faccio io.
Nessun commit, nessun `git add`. Il working tree ha lavoro in corso di sessioni
parallele sulla stampa delle comande: non toccarlo, non metterlo in stage.

## Contesto

Si introduce la **tavolata** (`seating`): un gruppo di persone che occupa uno o più
tavoli in una finestra di tempo. È l'unità operativa di sala, e deve esistere anche
dove il locale non usa gli ordini da QR — quindi è un'entità propria, non una
generalizzazione di `order_groups`.

Rapporti con ciò che esiste:

- `reservation_tables` resta **il piano**: l'assegnazione decisa prima del servizio.
  Non si tocca in questa fase.
- `seating_tables` è **il fatto**: i tavoli realmente occupati.
- `order_groups` diventa il conto *di una tavolata*. In questa fase prende solo la
  colonna, senza backfill e senza cambiare comportamento.
- `orders.table_id` resta obbligatorio e non si tocca: la comanda in cucina vuole il
  tavolo anche dentro una tavolata unita.

Questa fase è **solo schema**. Nessun trigger di assegnazione, nessuna RPC, nessuna
modifica al comportamento esistente, nessun backfill.

## Prima di scrivere

Leggi come modello `supabase/migrations/20260531150545_create_reservations.sql` e
`20260907120200_create_reservation_tables.sql`: struttura del file, `BEGIN`/`COMMIT`,
ordine delle sezioni, stile dei commenti, forma delle policy.

Sul vincolo "un file = un comando": vale per le migration che mescolano
`CREATE FUNCTION` con `GRANT`/`REVOKE`, che falliscono con 42601. Le migration di
creazione tabella del progetto sono transazionali e contengono tabella, indici,
trigger, permessi e RLS in un solo file. **Segui quel pattern**, non la lettura
letterale. Qui non ci sono funzioni, quindi non serve splittare.

## I quattro file

### 1. `create_seatings.sql`

Tabella `public.seatings`:

- `id`, `tenant_id` (FK tenants, CASCADE), `activity_id` (FK activities, CASCADE)
- `party_size int NULL` — ignoto finché l'host non lo dichiara; non forzarlo
- `status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))`
  — **valori in inglese**, come ogni altro stato del progetto; l'italiano sta nella UI
- `opened_at timestamptz NOT NULL DEFAULT now()`
- `closed_at timestamptz NULL`
- `closed_reason text NULL CHECK (closed_reason IN ('operator','auto') OR closed_reason IS NULL)`
  — una tavolata chiusa dall'operatore e una chiusa dal sistema a fine giornata non
  sono lo stesso dato
- `opened_by_user_id uuid NULL DEFAULT auth.uid()` — NULL quando la apre il cliente
  scansionando un QR, come `reservations.created_by_user_id`
- `notes text NULL`
- `created_at`, `updated_at` + trigger `set_updated_at`

Indici: `(tenant_id, activity_id)`; parziale su `(activity_id, status) WHERE status = 'open'`
— è la query calda, "quali tavolate sono aperte in questa sede adesso".

Permessi: due nuovi id `seatings.read` e `seatings.manage`, scope `activity`,
categoria `operations`. **Mappali sui ruoli esattamente come `orders.read` e
`orders.manage`** — leggi la mappatura esistente in `role_permissions` e replicala,
non indovinarla.

RLS: abilitata, quattro policy, `has_permission('seatings.read'|'seatings.manage', activity_id)`.

### 2. `create_seating_tables.sql`

Ponte `public.seating_tables`: `id`, `tenant_id`, `activity_id`, `seating_id`
(FK seatings, CASCADE), `table_id` (FK tables), `assigned_at`, `created_at`,
`updated_at`.

- UNIQUE su `(seating_id, table_id)`.
- Un tavolo non può stare in due tavolate aperte contemporaneamente, ma **non
  esprimerlo come vincolo DB**: l'invariante del progetto è che la doppia occupazione
  si mostra, non si impedisce. Un indice che la renda interrogabile sì, un `UNIQUE`
  che la blocchi no.
- FK su `tables` con lo stesso `ON DELETE` usato da `reservation_tables`: guarda quale
  e replicalo, la ponte deve conservare lo storico.
- RLS come sopra, con `seatings.read`/`seatings.manage`.

### 3. `create_seating_reservations.sql`

Ponte `public.seating_reservations`: `id`, `tenant_id`, `activity_id`, `seating_id`,
`reservation_id`, `created_at`.

Molti-a-molti di proposito: due prenotazioni distinte possono formare una sola
tavolata (due coppie che si conoscono, un tavolone). Un `reservation_id` singolo su
`seatings` costerebbe una migration dolorosa dopo.

UNIQUE su `(seating_id, reservation_id)`. RLS come sopra.

### 4. `order_groups_add_seating_id.sql`

`ALTER TABLE public.order_groups ADD COLUMN IF NOT EXISTS seating_id uuid NULL
REFERENCES public.seatings(id) ON DELETE SET NULL;` più un indice su `seating_id`.

NULL per tutte le righe esistenti e per ora nessuno lo scrive: il comportamento
attuale non cambia di una virgola. `table_id` resta NOT NULL e non si tocca in questa
fase.

## Vincoli

- Migration nuove, mai modificare quelle esistenti.
- `tenant_id UUID NOT NULL` su ogni tabella nuova, RLS abilitata, quattro policy.
- `DROP POLICY` sempre con `IF EXISTS`.
- Nessun `any` e nessun tipo TypeScript in questa fase: è solo SQL.
- Non rigenerare `database.types.ts` — è in drift per sessioni parallele, lo allineo io.

## Chiusura

Elenca i file creati con una riga a testa su cosa fa ciascuno, e **fermati**.
Non eseguire `db push`, non applicare via MCP, non proporre la fase successiva.
Rileggo le migration prima di applicarle.
