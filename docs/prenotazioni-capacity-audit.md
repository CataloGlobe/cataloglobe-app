# Prenotazioni — Audit Capacità & Disponibilità

**Tipo**: audit read-only.
**Scope**: mappare il dominio prenotazioni esistente per progettare (in giro successivo) la feature "capacità & disponibilità".
**Stato repo al momento dell'audit**: branch `staging`, working tree con sole modifiche pendenti su `respond-reservation/index.ts` (security hardening L2/L3, separate da questa feature).

---

## A. Modello dati prenotazioni

### A.1 Schema reale `public.reservations`

Migration di creazione: `supabase/migrations/20260531150545_create_reservations.sql:19-34`.

| Colonna | Tipo | Default | Note |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `tenant_id` | `uuid NOT NULL` | — | FK → `tenants.id` ON DELETE CASCADE |
| `activity_id` | `uuid NOT NULL` | — | FK → `activities.id` ON DELETE CASCADE |
| `reservation_date` | `date NOT NULL` | — | **wall-clock locale**, nessuna TZ |
| `reservation_time` | `time NOT NULL` | — | **wall-clock locale**, nessuna TZ |
| `party_size` | `int NOT NULL` | — | `CHECK (party_size > 0)`; Edge `submit-reservation` aggiunge tetto `≤ 50` solo lato function |
| `customer_name` | `text NOT NULL` | — | Edge cap `≤ 200` |
| `customer_email` | `text NOT NULL` | — | sempre obbligatoria (anche per inserimento manuale) |
| `customer_phone` | `text NOT NULL` | — | Edge cap `≤ 50` |
| `notes` | `text` | NULL | Edge cap `≤ 500` |
| `status` | `text NOT NULL` | `'pending'` | `CHECK status IN ('pending','confirmed','declined','cancelled')` |
| `source` | `text NOT NULL` | `'online'` | `CHECK source IN ('online','manual')` — aggiunto da `20260601132206_add_source_to_reservations.sql` |
| `created_at` | `timestamptz NOT NULL` | `now()` | — |
| `updated_at` | `timestamptz NOT NULL` | `now()` | trigger `reservations_set_updated_at` BEFORE UPDATE |

### A.2 Indici

- `idx_reservations_tenant (tenant_id)` → `20260531150545_create_reservations.sql:39-40`.
- `idx_reservations_activity_date (activity_id, reservation_date)` → `20260531150545_create_reservations.sql:42-43`.

**Nessun indice** su `(activity_id, reservation_date, reservation_time)`, su `status`, o composito che includa la finestra di overlap. Per il motore di capacità (query "tutte le prenotazioni non terminali di una sede attorno a una finestra ±durata") l'indice attuale è sufficiente per single-date, ma se serviranno query a cavallo di mezzanotte conviene un index opzionale `(activity_id, reservation_date, status) WHERE status IN ('pending','confirmed')`.

### A.3 RLS (activity-scoped)

`20260531150545_create_reservations.sql:103-124`:

- SELECT TO authenticated USING `has_permission('reservations.read', activity_id)`
- INSERT TO authenticated WITH CHECK `has_permission('reservations.manage', activity_id)`
- UPDATE TO authenticated USING+WITH CHECK `has_permission('reservations.manage', activity_id)`
- DELETE TO authenticated USING `has_permission('reservations.manage', activity_id)`

Seed permessi `reservations.read|manage`: owner+admin+manager+staff+viewer (read), owner+admin+manager+staff (manage). Niente `service_role` mai esposto.

### A.4 Realtime

`20260606120000_reservations_realtime.sql`: `public.reservations` in publication `supabase_realtime`. Hook admin: `src/pages/Dashboard/Reservations/hooks/useReservationsRealtime.ts`.

### A.5 Trigger

Solo `reservations_set_updated_at` (`20260531150545_create_reservations.sql:48-52`). Nessun trigger di business logic (no capacity check DB-side).

### A.6 Flag opt-in sede

`activities.enable_reservations boolean NOT NULL DEFAULT false` (`20260531150545_create_reservations.sql:57-58`). Switch master in `ActivitySettingsTab.tsx:1000-1009`.

### A.7 Email destinatari avvisi

`activities.reservation_notification_emails text[] NOT NULL DEFAULT '{}'` (`20260602140000_activities_reservation_notification_emails.sql:13-14`). Fallback su owner del tenant lato Edge.

---

## B. Orari di apertura — esistono, struttura, verdict

### B.1 Tabella `activity_hours`

Creata in `20260403100000_add_vertical_type_constraint.sql:40-52`, evoluta da:

- `20260416160000_multi_slot_hours.sql` → multi-slot per giorno (`slot_index 0..9`), UNIQUE `(activity_id, day_of_week, slot_index)`, `hours_public` spostato su `activities`.
- `20260419100000_activity_hours_overnight.sql` → flag `closes_next_day boolean` per orari oltremezzanotte (es. cocktail bar).

Schema corrente:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | FK tenants |
| `activity_id` | uuid NOT NULL | FK activities |
| `day_of_week` | smallint NOT NULL | **0..6 = Lunedì..Domenica** (Monday-based, vedi `availability.ts:38-40 mondayWeekday`) |
| `slot_index` | smallint NOT NULL DEFAULT 0 | 0..9, `UNIQUE(activity_id, day_of_week, slot_index)` |
| `opens_at` | time NULL | |
| `closes_at` | time NULL | |
| `is_closed` | boolean NOT NULL DEFAULT false | |
| `closes_next_day` | boolean NOT NULL DEFAULT false | |
| `created_at`/`updated_at` | timestamptz | |

CHECK `activity_hours_time_coherence`: (is_closed=true → opens/closes NULL, closes_next_day=false) OR (is_closed=false → opens+closes NOT NULL, closes_at > opens_at OPPURE closes_next_day=true).

RLS post `20260528120000_rls_activity_scoped.sql`: read = `has_permission('activity.read', activity_id)`, write = `has_permission('activity_hours.write', activity_id)`.

### B.2 Tabella `activity_closures` (chiusure straordinarie)

`20260416141000_activity_closures.sql` + `20260417100000_activity_closures_v2.sql`:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `activity_id` | uuid NOT NULL | |
| `closure_date` | date NOT NULL | |
| `end_date` | date NULL | range inclusivo `closure_date..end_date`. `end_date IS NULL → singolo giorno` |
| `label` | text | etichetta libera ("Ferragosto", "Ristrutturazione") |
| `is_closed` | boolean NOT NULL DEFAULT true | |
| `slots` | jsonb NULL | array `[{opens_at,closes_at,closes_next_day}]` per orari speciali |
| `created_at`/`updated_at` | timestamptz | |

CHECK: `is_closed=true → slots NULL`. `is_closed=false → slots NOT NULL AND length>0`. `end_date NULL OR end_date > closure_date`. `end_date NULL OR is_closed=true` (i range possono SOLO chiudere, non possono avere orari speciali pluri-giorno).

UNIQUE `(activity_id, closure_date)`. Index `(activity_id, closure_date)`.

### B.3 Resolver disponibilità (form pubblico)

`src/pages/ReservationPage/availability.ts` (262 righe). API:

- `getDaySlots(isoDate, hours, closures): Slot[]` (`availability.ts:105-143`) — priorità: closure copre → sostituisce; altrimenti weekday hours. **Prepend overnight tail** dal giorno precedente se `closes_next_day=true`.
- `isTimeWithinSlots(time, slots)` (`availability.ts:175-189`) — match HH:MM.
- `availabilityErrors(date, time, hours, closures)` (`availability.ts:212-245`) — soft-validation Italiana.
- `slotsLabelForDate` (`availability.ts:250-261`) — label "Aperto 12:00–15:00, 19:00–23:00".
- Fallback free-form: se `hours.length === 0`, **nessun gate** (`availability.ts:218`).

### B.4 UI editing orari

Drawer dedicato: `ActivityHoursDrawer` (importato in `ActivitySettingsTab.tsx:35`). Sezione card: `ActivityHoursSection`. Servizio: `src/services/supabase/activityHours.ts`. Chiusure: `ActivityClosureCreateEditDrawer` + `ActivityClosureDeleteDrawer`. Banner in `ActivitySettingsTab.tsx:1010-1018` avverte se prenotazioni attive ma 0 fasce configurate.

### B.5 Verdict: eredita oppure dedicato?

**Verdict: EREDITA**, con un solo punto di estensione opzionale ("fasce di servizio prenotabili").

Motivi:
1. **`activity_hours` copre già**: per-giorno, multi-slot, overnight, chiusure straordinarie, e ha un resolver client maturo (`availability.ts`) usato nel form pubblico (`ReservationForm.tsx:43-46`).
2. La spec target dice esplicitamente che "turni fissi = caso particolare della finestra continua" → la maggior parte dei ristoranti usa già `activity_hours` per separare pranzo/cena (multi-slot esistente).
3. Edge `resolve-public-catalog` espone già `opening_hours` + `upcoming_closures` al form pubblico quando `enable_reservations=true` (`resolve-public-catalog/index.ts:401-421`).

**Estensione minima necessaria** per la spec target:
- Aggiungere su `activity_hours` un flag `accepts_reservations boolean NOT NULL DEFAULT true` *opzionale* — permette di avere la sede aperta in una fascia (es. mattina caffè) senza accettare prenotazioni in quella fascia. Se non lo aggiungiamo, l'invariante "prenotabile = aperto" è accettabile per V1.
- Per la **modalità `turni`** non serve nuova tabella: si rappresentano come slot puntuali in una nuova tabella `activity_reservation_shifts` *oppure* come metadato JSONB su `activities` (vedi sezione H per il trade-off). Una tabella dedicata è preferibile per query "lista turni del giorno" e per validazione DB.

**Riserva**: se in futuro servisse un orario di prenotazione *diverso* dall'orario di apertura (es. cucina chiude 30 min prima della chiusura locale), allora servirà una mini-tabella dedicata. Per V1 si può forzare l'invariante "ultimo orario prenotabile = `closes_at - durata`".

---

## C. Config di sede

### C.1 Pattern UI

`src/pages/Operativita/Attivita/tabs/ActivitySettingsTab.tsx` (1322 righe). Struttura:
- Row 1: `ActivityHoursSection` + `ActivityClosuresSection` (con drawer di edit per ciascuno).
- Row 2: Card "Accesso pubblico" (URL/QR/PDF) + Card "Configurazione sede" (3 accordion: pagamenti, servizi, tariffe — pattern draft+UnsavedChangesBar di codebase).
- Row 2b: toggle "Ordinazioni dal tavolo" (full width).
- Row 2c: toggle "Prenotazioni" + email destinatari avvisi (`ActivitySettingsTab.tsx:990-1085`).
- Row 3: stato pubblicazione. Row 4: zona distruttiva.

Pattern UI per editing: drawer laterale destro (`SystemDrawer` → `DrawerLayout`) o accordion in-place per multi-field. Toggle binari (`*_public`, `enable_reservations`, `ordering_enabled`) sono save-immediato.

### C.2 Dove agganciare i nuovi campi capacità

**Posizione raccomandata**: nella Card "Prenotazioni" attuale (row 2c), espandendola post-toggle.

Pattern proposto (allineato con codebase):
- Accordion espandibile **"Capacità e disponibilità"** sotto il toggle, visibile solo quando `enable_reservations=true`.
- Sotto-form con: capienza, durata, modalità disponibilità (turni|continua), modalità conferma (manuale|auto), overbooking_form (hard|soft).
- Quando `modalità=turni`, secondo blocco UI: lista turni per giorno settimana (riusa lo stesso pattern di `ActivityHoursDrawer` con multi-slot).
- Save via `updateActivity` (già esistente in `src/services/supabase/activities.ts`).

### C.3 Schema activities — dove vivono le colonne attuali

`activities` cresciuta nel tempo (storico migrazioni `20260223151000_v2_activities.sql` → onwards). Colonne rilevanti già presenti: `enable_reservations`, `reservation_notification_emails`, `ordering_enabled`, `hours_public`, `status`, `inactive_reason`. Nuove colonne capacità andranno nella stessa tabella (vedi sezione H).

---

## D. Selezione orario nel form pubblico

`src/pages/ReservationPage/ReservationForm.tsx` + `WhenSection.tsx` + `availability.ts`.

### D.1 Picker attuale

- `<input type="date">` con `min={todayIsoDate()}` (`ReservationForm.tsx:39`, `WhenSection.tsx:39-67`).
- `<input type="time" step={900}>` (= 15 min) con `disabled={!values.reservation_date}` (`WhenSection.tsx:73-78`). Snap su quarter al blur via `snapTimeToQuarter`.
- `PartySizePicker` per coperti (component dedicato, valori discreti).
- Hint sotto: "Aperto 12:00–15:00, 19:00–23:00" via `slotsLabel` (`WhenSection.tsx:120-125`).

### D.2 Validazioni

- Format (regex date/time) + future date (`validators.ts`).
- Apertura: `availabilityErrors(date, time, hours, closures)` (`ReservationForm.tsx:103-109`). Block submit se fallisce.
- Fallback **free-form**: se `hours.length === 0`, l'utente può scegliere QUALSIASI ora (no gate). Server lo accetta. Banner UI lato admin lo segnala (`ActivitySettingsTab.tsx:1010-1018`).

### D.3 Vincoli orari da dove arrivano

- `opening_hours` + `upcoming_closures` arrivano nel payload `resolve-public-catalog` (`resolve-public-catalog/index.ts:401-421`).
- Condizione fetch: `hours_public OR enable_reservations` (entrambi triggerano il fetch).
- Passati come props al form: `ReservationPage.tsx:218-219`.

### D.4 Cosa cambia in V1 capacità

- Se `modalità_disponibilità=continua`: time picker resta libero (15 min step), aggiungere gate "capacità a quell'orario+durata". Inline error/disabilita CTA.
- Se `modalità_disponibilità=turni`: time picker diventa **Select** con lista turni del giorno (filtrati per saturazione). 
- Mantenere fallback: se `hours.length === 0` → free-form invariato (ma niente check capacità: senza orari non si sa la durata effettiva).

---

## E. Aggregato ±90 min

### E.1 Posizione esatta

`src/pages/Dashboard/Reservations/ReservationDetailDrawer.tsx`:
- Costanti: righe 22-23 (`AGGREGATE_WINDOW_MINUTES = 90`, `MINUTES_PER_DAY = 1440`).
- Logica: `useMemo aggregate` righe **102-126**.
- Render UI: righe 296-319 (callout azzurro "Vicino a questo orario (±1h30)").

### E.2 Logica precisa

```ts
// Pseudocodice
const centerMinutes = timeToMinutes(reservation.reservation_time);
const dayByIso = { D-1: -1, D: 0, D+1: +1 };
const sameSlot = allReservations.filter(r => {
    if (r.id === reservation.id) return false;
    if (r.status !== "confirmed") return false;     // solo confirmed
    if (r.activity_id !== reservation.activity_id) return false;
    const dayDiff = dayByIso[r.reservation_date];
    if (dayDiff === undefined) return false;
    const offset = dayDiff * 1440 + (candMinutes - centerMinutes);
    return Math.abs(offset) <= 90;                  // ±90 minuti continui
});
return { count: sameSlot.length, totalCovers: sum(party_size) };
```

Punti chiave:
- **Solo `confirmed`** (esclude pending, declined, cancelled).
- **Stessa activity**.
- **Asse minuti continuo su D-1/D/D+1** → gestisce correttamente prenotazioni a cavallo della mezzanotte (es. 23:30 vs 00:30).
- Self-exclude.
- Calcolo sull'elenco già caricato lato client (`allReservations` = `effectiveReservations` con override ottimistici applicati).

### E.3 Come lega alla durata configurabile

Adattamento in V1:
- La finestra ±90 oggi è una **euristica visiva**. Sostituire con `±durata_minuti` (default 120) trasforma il callout in un proxy del motore di capacità.
- **Picco concorrente** non è calcolato qui: oggi è solo conteggio "righe vicine". Il vero motore di capacità deve calcolare il picco istantaneo nella finestra `[start, start+durata)` di ogni candidata (sweep-line o scan a passi di 15 min).
- Il callout admin può quindi diventare: "Picco previsto in finestra ±durata: X coperti / Y capienza" (verde/ambra/rosso). Riusa la stessa data source (`allReservations`).

---

## F. Service & edge functions

### F.1 Service layer `src/services/supabase/reservations.ts`

Funzioni (191 righe):
- `listReservations(tenantId)` (righe 29-39) — SELECT `*` con `.eq("tenant_id", ...)` + sort `(date asc, time asc)`. **Filtro per activity client-side** (`Reservations.tsx:219-227`). Per V1 capacità è sufficiente: il volume per tenant resta basso. Se diventa grande, aggiungere una `listReservationsForActivityAndWindow(activityId, fromIso, toIso, statuses[])`.
- `getReservation(id, tenantId)` (righe 45-63).
- `createReservation(tenantId, input)` (righe 95-119) — INSERT diretto con `status='confirmed', source='manual'` (admin manual entry).
- `updateReservation(id, tenantId, input)` (righe 129-158) — UPDATE solo dati, **non tocca `status`**.
- `submitReservation(input)` (righe 190-224) — invoke Edge `submit-reservation`.
- `respondReservation(reservationId, action)` (righe 252-291) — invoke Edge `respond-reservation`.

### F.2 Edge `submit-reservation`

`supabase/functions/submit-reservation/index.ts` (655 righe).

Responsabilità (in ordine):
1. CORS `*` + JSON body parse.
2. Field validation (formato date/time, party_size 1..50, email regex, note ≤500).
3. Rate limit dual-bucket: per-slug 15/min + per-IP 40/h (`submit-reservation/index.ts:15-18`).
4. Slug → activity resolve via service_role (`submit-reservation/index.ts:451-456`). `tenant_id` **mai** dal body.
5. Gate `status='active' AND enable_reservations=true`.
6. INSERT `reservations` con `status='pending', source='online'`.
7. Email cliente (receipt).
8. Email venue alert (per-site list o owner fallback) — `Promise.allSettled`.
9. **In-app notification fan-out** via `get_users_with_activity_permission('reservations.manage', activity_id)` → insert in `notifications`.

**Punto d'innesto capacità**: tra il punto 5 (gate enable_reservations) e il punto 6 (INSERT).

```
[gate enable_reservations] → [NUOVO: gate capacità + branch matrice intake] → [INSERT con status risolto] → [email + notif]
```

Status risolto in base alla matrice intake (vedi tabella in prompt utente):
- `auto + hard + sotto capienza` → `confirmed`, invia email conferma (riusa `respond-reservation` builder?).
- `auto + soft + sotto capienza` → `confirmed`.
- `auto + soft + sopra capienza` → `pending` (overbookabile).
- `manuale + qualsiasi` → `pending`.
- `hard + sopra capienza + manuale o auto` → 409 nuovo error_code es. `CAPACITY_FULL`.

### F.3 Edge `respond-reservation`

`supabase/functions/respond-reservation/index.ts` (377 righe post-hardening L2/L3 in corso).

Responsabilità:
- JWT bearer → user-scoped client.
- Body validate `reservation_id` (UUID) + `action` ∈ {confirm,decline,cancel}.
- SELECT-then-UPDATE sotto RLS (`reservations.manage`). Status precondition: `confirm/decline ← pending`, `cancel ← confirmed`.
- Email outcome customer.

**Punto d'innesto capacità**: NESSUNO necessario sul confirm manuale (admin override sempre permesso, invariante operatore). Eventuale calcolo "picco previsto" è solo informativo lato UI (E.3), non blocca la transition.

### F.4 Email auto-conferma

Oggi `submit-reservation` invia "receipt" (in attesa), `respond-reservation` invia "outcome" (confermata/rifiutata/annullata). Se introduciamo `status='confirmed'` da `submit-reservation` (modalità auto), il messaggio cliente deve essere "Prenotazione confermata" non "Richiesta ricevuta". Quindi `submit-reservation` deve poter usare il builder di outcome (o sopperire con un terzo builder). Refactor minore: estrarre i builder di body in `_shared/reservationEmails.ts`.

### F.5 Notifiche in-app

Helper SQL `get_users_with_activity_permission(text, uuid)` (riferimento esterno). Per le auto-conferme la notifica può cambiare label da "Nuova prenotazione" a "Prenotazione confermata (auto)" — invariante stesso fan-out.

---

## G. Separazione Tabelle/QR

Confermata. `src/components/Tables/` (TableDetailDrawer, TableZoneManagementDrawer, TablesLiveView, TablesManagement, ZoneSelectField) e `src/services/supabase/tables.ts` + `tableZones.ts` **non importano** né referenziano niente di `reservations.ts` / `reservation` (grep esplicito 0 match).

Il dominio "Tavoli" gestisce sessioni QR + ordini al tavolo (Epic Ordinazioni). Il dominio "Prenotazioni" gestisce richieste anticipate con `party_size` ma **nessun riferimento a `table_id`**. I "coperti" della prenotazione sono un numero astratto: non riservano un tavolo specifico. Per V1 questo è corretto e va lasciato così — l'assegnazione tavoli è esplicitamente fuori scope.

Edge case da annotare: se in futuro l'admin volesse "assegnare tavolo X" a una prenotazione confermata, si aggiunge `reservations.assigned_table_id uuid NULL REFERENCES tables(id)`. Per ora: nessuna intersezione.

---

## H. Delta proposto (solo proposta scritta)

### H.1 Schema

**Nuova migration `YYYYMMDDHHMMSS_reservations_capacity.sql`**:

```sql
-- 1. Activities: config capacità
ALTER TABLE public.activities
    ADD COLUMN reservation_capacity int NULL
        CHECK (reservation_capacity IS NULL OR reservation_capacity > 0),
    ADD COLUMN reservation_duration_minutes int NOT NULL DEFAULT 120
        CHECK (reservation_duration_minutes BETWEEN 15 AND 600),
    ADD COLUMN reservation_availability_mode text NOT NULL DEFAULT 'continua'
        CHECK (reservation_availability_mode IN ('turni','continua')),
    ADD COLUMN reservation_confirmation_mode text NOT NULL DEFAULT 'manuale'
        CHECK (reservation_confirmation_mode IN ('manuale','auto')),
    ADD COLUMN reservation_overbooking_form text NOT NULL DEFAULT 'hard'
        CHECK (reservation_overbooking_form IN ('hard','soft'));

-- 2. Constraint cross-column: auto richiede capacità impostata
ALTER TABLE public.activities
    ADD CONSTRAINT activities_auto_requires_capacity CHECK (
        reservation_confirmation_mode = 'manuale'
        OR reservation_capacity IS NOT NULL
    );

-- 3. (Solo se modalità turni) tabella turni prenotabili
CREATE TABLE public.reservation_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time time NOT NULL,
    -- nessun end_time: la durata viene dal campo activity-level
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (activity_id, day_of_week, start_time)
);

-- RLS: pattern identico a activity_hours
ALTER TABLE public.reservation_shifts ENABLE ROW LEVEL SECURITY;
-- read: has_permission('activity.read', activity_id)
-- write: has_permission('activity_hours.write', activity_id)  -- riusa permesso
-- (oppure introdurre 'reservation_shifts.write' se vogliamo gating dedicato)

-- 4. Index supporto motore capacità
CREATE INDEX idx_reservations_activity_date_active
    ON public.reservations (activity_id, reservation_date)
    WHERE status IN ('pending','confirmed');
```

Nota: lascio invariati `activity_hours` (gli orari di apertura sono già nel modello). Se in futuro serve un flag "questa fascia accetta prenotazioni" → `accepts_reservations bool DEFAULT true` su `activity_hours` in una migration successiva.

### H.2 Motore capacità (proposta)

Modulo `src/utils/reservationCapacity.ts` (puro, testabile):
- `windowOverlap(aStart, aEnd, bStart, bEnd): boolean` — interval intersect classico.
- `peakConcurrent(reservations, candidateStart, candidateEnd, durationMin): number` — sweep-line sugli eventi `(time, ±party_size)`.
- `canAccept(activity, reservations, candidate): { ok: boolean, peakAfter: number, reason?: 'over_capacity' }`.

Inputs: lista `reservations` non terminali (`status IN ('pending','confirmed')`) sulla stessa activity nella finestra `[candidateStart - durata, candidateStart + durata]` (basta caricare i ±durata).

Mirror lato Edge: stessa logica in `submit-reservation` (TypeScript condiviso o port deno-style; di solito si duplica come per `scheduleResolver.ts` con commento SYNC).

### H.3 UI

**Form pubblico** (`ReservationForm.tsx` + `WhenSection.tsx`):
- Aggiungere prop `availability: { mode, durationMin, capacity, shifts[] }` da `resolve-public-catalog` payload (estensione esistente).
- Time picker: branch su `mode`.
  - `continua`: input time invariato.
  - `turni`: Select con `shifts[]` del weekday corrispondente; ogni opzione mostra "disponibile" / "esaurito" calcolato lato server (`resolve-public-catalog` espone snapshot capacità per i prossimi 30 giorni? — vedi sezione I).
- Soft-validation aggiuntiva: "Posti non disponibili in questa fascia" se `overbooking_form='hard'`.

**Admin** (`ActivitySettingsTab.tsx:990-1085`):
- Espansione card "Prenotazioni" con accordion "Capacità e disponibilità" (pattern draft + UnsavedChangesBar).
- Quando `mode='turni'`: drawer dedicato "Gestisci turni" identico per pattern a `ActivityHoursDrawer`.

**Dashboard Prenotazioni** (`Reservations.tsx`, `ReservationDetailDrawer.tsx`):
- Sostituire `AGGREGATE_WINDOW_MINUTES=90` con la durata configurata della sede (fallback 90 se non impostata).
- Callout drawer evolve in "Picco previsto X/Y coperti" (verde/ambra/rosso).
- Pagina lista: opzionale, KPI "saturazione fasce oggi".

### H.4 Edge functions

`submit-reservation`:
- Step 5.5 (post-gate enable, pre-INSERT): fetch reservations finestra ±durata + shifts del weekday, calcolo `peakConcurrent`, branch matrice intake → `status` risolto + nuovo `error_code` `CAPACITY_FULL` (409) per ramo "hard + pieno".
- Refactor email builder in `_shared/reservationEmails.ts` (estrazione neutra) per riuso da auto-conferma.

`respond-reservation`: **invariato**. Admin override sempre permesso (invariante operatore).

`resolve-public-catalog`:
- Estendere payload `business` con `reservation_capacity, reservation_duration_minutes, reservation_availability_mode, reservation_overbooking_form`.
- Estendere con `reservation_shifts: { day_of_week, start_time }[]` quando `mode='turni'`.
- (Opzionale V1+) snapshot saturazione per i prossimi N giorni per UI "esaurito" pre-submit.

### H.5 Service layer

`src/services/supabase/reservations.ts`:
- Nuovo helper `listReservationsForActivityAround(activityId, tenantId, startIso, endIso, statuses[])` — usato dal motore capacità lato admin (drawer detail + KPI) e dal form auto-confirm logic se servirà mai lato client (in genere no: solo Edge).
- Nessuna firma break esistente.

### H.6 Tipi

`src/types/activity.ts` (aggiungere campi) + `src/types/reservation.ts` (invariato — schema reservations non cambia). Nuovo `src/types/reservation-shifts.ts` se introduciamo la tabella.

---

## I. Rischi, edge case, domande aperte

### I.1 Rischi

- **Race condition in INSERT auto-conferma**: due `submit-reservation` paralleli per la stessa finestra possono entrambe leggere `peak=K` e confermare entrambe, sforando capienza. Mitigazione:
  - Soft: accettabile per V1 (volumi bassi, overbooking marginale).
  - Hard: advisory lock per activity (`pg_try_advisory_xact_lock`) prima del recalcolo + INSERT in transazione. Costa una RPC custom.
- **DST cross-mezzanotte**: orari locali wall-clock, fasce `closes_next_day=true` già gestite dal resolver client. Per il motore capacità: il calcolo è in minuti relativi, immune.
- **Sync resolver duplicato**: oggi `availability.ts` (frontend) e nessun mirror server-side per le prenotazioni. Se introduciamo capacity gate in `submit-reservation`, serve mirror della disponibilità (turni/continua) lato Deno — stesso schema della duplicazione `scheduleResolver.ts` esistente.
- **Migration con CHECK cross-column** (`activities_auto_requires_capacity`): se tenant esistenti hanno `confirmation_mode='auto'` e `capacity NULL`, l'ALTER fallisce. Default `'manuale'` evita il problema; lo switch auto va gated UI-side ("imposta prima la capienza").

### I.2 Edge case

- **Free-form (no hours)**: oggi il form pubblico accetta qualsiasi orario se `hours.length === 0`. Per le prenotazioni con capacità: se anche capacity è NULL → free-form integrale (V0 attuale). Se capacity impostata ma niente hours → finestra implicita = giornata intera, motore capacità funziona ugualmente.
- **Edit lato admin**: `updateReservation` non cambia status, ma cambiare `party_size` o `reservation_time` su una `confirmed` può sforare capienza ex-post. V1: solo warning UI, nessun blocco (invariante operatore).
- **Cancellazioni + race**: una `cancelled` libera capienza ma `respond-reservation` non triggera ricalcolo "lista d'attesa". Promote pending→confirmed manuale dall'admin (no automation V1).
- **Multi-slot weekday con buco** (es. pranzo 12-15, cena 19-23): la finestra ±durata può attraversare il "buco" pomeridiano. Il motore capacità conta ugualmente prenotazioni adiacenti se cadono nella finestra: corretto (un tavolo occupato da una prenotazione 14:30 con durata 120 confligge con una 15:30, anche se la sede "chiude" dalle 15 alle 19).
- **Turni serrati con durata maggiore dell'intervallo**: se `mode='turni'` e l'admin definisce turni alle 19:00, 19:30, 20:00 ma `durata=120`, il motore vede sovrapposizione completa e satura tutto al primo turno. Comportamento corretto, ma UX confusa. Validare lato UI ("la durata supera l'intervallo tra i turni").

### I.3 Domande aperte (da chiarire con Lorenzo prima di costruire)

1. **Permesso scrittura turni**: riusiamo `activity_hours.write` o introduciamo `reservation_shifts.write` dedicato? Riuso più semplice; dedicato consente di delegare i turni a un ruolo senza esporre tutti gli orari di apertura.
2. **Capacità per turno**: V1 dice "capacità = activity-level". Confermare che non serve `reservation_shifts.capacity int` per V1 (es. "Sabato sera max 30 coperti, gli altri 50") — la spec esplicita lo elenca come fuori scope (✓).
3. **Snapshot saturazione lato `resolve-public-catalog`**: serve per UI "esaurito" pre-submit? Costo: una query aggregata per activity. Trade-off: utile per UX ma comporta cache invalidation più complessa.
4. **Email auto-conferma**: nuovo subject "Prenotazione confermata" già al `submit-reservation` step (a posto di "Richiesta ricevuta")? Suggerisco SÌ in modalità auto, NO in manuale.
5. **Ripristino in-app notification**: notifica "Nuova prenotazione" cambia a "Prenotazione confermata (auto)" in modalità auto? Stesso destinatario? Sì, stesso fan-out, label diversa.
6. **Manual create > capacità**: oggi `createReservation` (admin manual) bypassa capacità. Manteniamo invariato (invariante operatore) ma aggiungiamo warning UI client-side? Sì.
7. **Backfill `reservation_duration_minutes`**: default 120 va bene per tutti? Suggerisco SÌ, nessun input richiesto.

### I.4 Out-of-scope V1 (riepilogo)

Non progettare in dettaglio ma annotare per V1+:
- Override per data specifica (capacity custom in `activity_closures.slots` extension).
- Capacità per turno o per giorno.
- Auto-scadenza pending vecchie (cron job).
- Assegnazione tavoli (intersezione con `tables`/Epic Ordinazioni).
- Sostituire la euristica `±90` dell'admin con il "peak previsto" è in scope V1 (E.3); fare di più (timeline visuale per sede) è V1+.

---

## Riepilogo verdetti

- **B**: orari → **EREDITA** da `activity_hours` (multi-slot + overnight + closures già ricchi). Aggiunta solo opzionale `activity_hours.accepts_reservations` se si vuole sganciare "aperto" da "prenotabile". Per turni: tabella dedicata `reservation_shifts` semplice (no end_time, durata da activity).
- **C**: config in `activities` (5 nuove colonne) + accordion espandibile nella Card "Prenotazioni" di `ActivitySettingsTab` (`:990-1085`). Drawer dedicato per i turni (pattern `ActivityHoursDrawer`).
- **E**: la `AGGREGATE_WINDOW_MINUTES=90` in `ReservationDetailDrawer.tsx:22` resta come fallback, sostituita dalla `reservation_duration_minutes` configurata. Callout evolve in "picco / capienza".
- **F**: motore capacità si innesta in `submit-reservation` tra gate `enable_reservations` e INSERT. `respond-reservation` invariato (invariante operatore). Builder email da estrarre in `_shared/reservationEmails.ts` per riuso auto-conferma.
- **G**: separazione Tabelle/QR confermata, **0 import** cross-dominio.
- **A/I**: schema OK, indice `idx_reservations_activity_date_active WHERE status IN ('pending','confirmed')` consigliato. Rischio race su auto-confirm: per V1 advisory lock o accettare overbooking marginale.

**Non implementato nulla in questo giro. Pronto per discussione delle domande aperte (I.3) prima di scrivere migration e codice.**
