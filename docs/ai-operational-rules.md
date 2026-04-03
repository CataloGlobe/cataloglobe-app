# CataloGlobe — Regole Operative AI

Questo documento contiene istruzioni vincolanti per qualsiasi AI che opera su questo progetto.
Ogni regola ha precedenza sul comportamento di default dell'AI.
In caso di dubbio: seguire il pattern esistente nel codice.

---

## 1. Regole Architetturali

### 1.1 Service Layer

- OGNI interazione con il database DEVE passare da `src/services/supabase/`. MAI chiamare Supabase direttamente da un componente React.
- Il flusso obbligatorio è: `Componente → Service Function → Supabase Client → PostgreSQL (RLS)`.
- Ogni dominio ha il proprio file service. Non mescolare domini nello stesso file.
- Usare SEMPRE questa firma per le service function:

```
list*(tenantId: string): Promise<T[]>
get*(id: string, tenantId: string): Promise<T>
create*(tenantId: string, data: Partial<T>): Promise<T>
update*(id: string, tenantId: string, data: Partial<T>): Promise<T>
delete*(id: string, tenantId: string): Promise<void>
```

- Ogni service function DEVE ricevere `tenantId` come parametro esplicito.
- Gestire errori con questo pattern obbligatorio:

```ts
const { data, error } = await supabase.from("table").select("*").eq("tenant_id", tenantId);
if (error) {
  if (error.code === "PGRST116") throw new Error("Not found");
  if (error.code === "23503") throw new Error("Cannot delete — referenced by another record");
  if (error.code === "23505") throw new Error("Duplicate");
  throw error;
}
return data ?? [];
```

### 1.2 Tenant Isolation

- `tenant_id` proviene ESCLUSIVAMENTE da `useTenantId()` o `useTenant().selectedTenantId`.
- MAI derivare `tenant_id` da `auth.user.id`, da localStorage, o da qualsiasi altra fonte.
- OGNI write verso il database DEVE includere `tenant_id`.
- Non esistono dati cross-tenant accessibili dal frontend (unica eccezione: `allergens` che è una tabella di sistema).

### 1.3 Implementazione Nuove Feature

1. **Prima di scrivere codice**: cercare implementazioni simili esistenti nel repository.
2. **Seguire il pattern del dominio più simile**. Se stai aggiungendo una nuova entità, copia la struttura di `Products/` o `Catalogs/`.
3. **File structure obbligatoria per ogni dominio**:

```
NuovoDominio/
├── NuovoDominio.tsx                # Pagina lista (state + list + drawer open/close)
├── NuovoDominioPage.tsx            # Pagina dettaglio (se serve)
├── NuovoDominioCreateEditDrawer.tsx # Drawer crea/modifica
├── NuovoDominioDeleteDrawer.tsx    # Drawer conferma eliminazione
└── components/
    └── NuovoDominioForm.tsx        # Form riutilizzabile (NESSUNA logica drawer)
```

4. **Non creare nuovi provider context** a meno che non sia strettamente necessario. I provider esistenti sono: AuthProvider, TenantProvider, DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider.
5. **Non aggiungere librerie npm** senza esplicita richiesta. Verificare prima che il componente UI necessario non esista già in `src/components/ui/`.

### 1.4 Routing

- Tutte le route sono definite in `src/App.tsx`. Non creare router secondari.
- Le route business vanno sotto `/business/:businessId/`. Il `businessId` nell'URL determina il tenant attivo.
- Ogni nuova route business DEVE essere wrappata da `ProtectedRoute` + `TenantProvider` (già forniti dal layout padre `MainLayout`).
- Le route pubbliche (senza auth) vanno al root level (`/:slug`).
- Non aggiungere route senza il guard corretto: `ProtectedRoute` per utenti autenticati, `GuestRoute` per pagine di login/signup.

---

## 2. Regole Frontend / UI

### 2.1 Layout

- **Non esiste top navbar**. La navigazione primaria è SOLO la sidebar sinistra.
- Non aggiungere header, toolbar o barre di navigazione orizzontali al layout globale.
- I tre layout disponibili sono:
  - `MainLayout` — area business (sidebar + DrawerProvider + Outlet)
  - `WorkspaceLayout` — area workspace (selezione tenant)
  - `SiteLayout` — pagine pubbliche minimal
- Non creare nuovi layout. Usare quelli esistenti.

### 2.2 Drawer Pattern (OBBLIGATORIO)

- TUTTE le operazioni create/edit/delete usano **drawer laterali destri**.
- MAI usare modali centrate per editing di entità.
- Lo stack drawer è SEMPRE:

```
SystemDrawer (primitiva: slide-in, portal, backdrop, ESC, focus trap)
  └── DrawerLayout (struttura: header, children, footer)
      └── DomainForm (form puro, collegato via attributo HTML `form`)
```

- Il bottone "Salva" va nel `footer` del `DrawerLayout`, collegato al form tramite `form="entity-form"`.
- Il form notifica lo stato di salvataggio via callback `onSavingChange`.
- Dimensioni drawer standard: `sm: 420px`, `md: 520px` (default), `lg: 720px`.
- Props obbligatorie per ogni drawer:

```ts
type EntityDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  entityData: Entity | null;
  onSuccess: (saved?: Entity) => void;
  tenantId: string;
};
```

- Flusso post-success obbligatorio: `onSuccess()` → parent ricarica dati → drawer si chiude → toast di conferma.

### 2.3 Costruzione Nuove Pagine

Ogni pagina DEVE seguire questo pattern:

```tsx
// 1. Data loading
const [items, setItems] = useState<Entity[]>([]);
const [isLoading, setIsLoading] = useState(true);

const loadData = useCallback(async () => {
  try {
    setIsLoading(true);
    const data = await listEntities(tenantId);
    setItems(data);
  } catch {
    showToast({ message: "Errore nel caricamento", type: "error" });
  } finally {
    setIsLoading(false);
  }
}, [tenantId, showToast]);

useEffect(() => { loadData(); }, [loadData]);

// 2. Drawer state
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
const [mode, setMode] = useState<"create" | "edit">("create");
const [selected, setSelected] = useState<Entity | null>(null);

// 3. Handlers
const handleCreate = () => { setMode("create"); setSelected(null); setIsDrawerOpen(true); };
const handleEdit = (item: Entity) => { setMode("edit"); setSelected(item); setIsDrawerOpen(true); };
const handleClose = () => { setIsDrawerOpen(false); setSelected(null); };
const handleSuccess = async () => { await loadData(); handleClose(); showToast({ message: "Salvato", type: "success" }); };
```

Struttura JSX obbligatoria:

```tsx
<PageHeader title="..." breadcrumbs={[...]} actions={<Button onClick={handleCreate}>Crea</Button>} />
<FilterBar ... />
<DataTable rows={items} columns={columns} />
<EntityCreateEditDrawer open={isDrawerOpen} onClose={handleClose} mode={mode} entityData={selected} onSuccess={handleSuccess} tenantId={tenantId} />
<EntityDeleteDrawer ... />
```

### 2.4 Componenti UI Esistenti

Prima di creare QUALSIASI nuovo componente UI, verificare che non esista in `src/components/ui/`. I seguenti sono GIA' disponibili:

**Input:** TextInput, Textarea, SearchInput, NumberInput, DateInput, TimeInput, ColorInput, RangeInput, FileInput, Select, RadioGroup, SegmentedControl, CheckboxInput, Switch

**Display:** Button (primary|secondary|outline|ghost|danger, sm|md|lg), Text (title-lg/md/sm, subtitle, body-lg/body/body-sm, caption, button), Badge, Pill, PillGroup, Card, Divider

**Data:** DataTable (sort, pagination, density), Tabs/Tab, Breadcrumb

**Feedback:** Toast (via useToast), Loader, AppLoader, Skeleton, EmptyState, ConfirmDialog, Tooltip

**Layout:** PageHeader, FilterBar, SystemDrawer, DrawerLayout, ModalLayout, DropdownMenu

### 2.5 Lingua e Terminologia

- TUTTA l'interfaccia utente e' in **italiano**.
- Label, placeholder, messaggi toast, testi di conferma: SEMPRE in italiano.
- Mapping terminologico obbligatorio:
  - Tenant → "Azienda" / "Brand" (MAI dire "tenant" nell'UI)
  - Activity → "Sede" / "Attivita'"
  - `owner_user_id` → MAI esposto nell'UI
  - Schedule → "Regola di programmazione"
  - Featured Content → "Contenuto in evidenza"

### 2.6 Stili

- Usare SCSS Modules (`.module.scss`) per ogni componente.
- Non usare CSS inline tranne che per valori dinamici (es. CSS custom properties da stili).
- Le variabili globali di tema sono in `src/styles/_theme.scss`. Usare le CSS custom properties definite li'.
- Non creare nuove variabili SCSS globali senza necessita'.

---

## 3. Regole Data Model

### 3.1 Estensione Schema

- OGNI modifica allo schema DEVE avvenire tramite una nuova migration in `supabase/migrations/`.
- MAI modificare migration files esistenti.
- Formato nome file: `YYYYMMDDHHMMSS_descrizione_breve.sql`.
- Ogni nuova tabella tenant-scoped DEVE avere:
  - Colonna `tenant_id UUID NOT NULL REFERENCES tenants(id)`
  - RLS abilitato
  - Policy SELECT/INSERT/UPDATE/DELETE con `tenant_id = ANY(get_my_tenant_ids())`

Pattern RLS obbligatorio:

```sql
ALTER TABLE nuova_tabella ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON nuova_tabella
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "tenant_insert" ON nuova_tabella
  FOR INSERT WITH CHECK (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "tenant_update" ON nuova_tabella
  FOR UPDATE USING (tenant_id = ANY(get_my_tenant_ids()))
  WITH CHECK (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "tenant_delete" ON nuova_tabella
  FOR DELETE USING (tenant_id = ANY(get_my_tenant_ids()));
```

### 3.2 Naming Convenzioni

- **Tabelle nel database**: nomi senza prefisso (es. `products`, `catalogs`). Il prefisso `v2_` appare solo nelle migration DDL per compatibilita' storica.
- **Query nei service files**: usare SEMPRE il nome senza prefisso. `supabase.from("products")`, MAI `supabase.from("v2_products")`.
- **Tipi TypeScript**: prefisso `V2` (es. `V2Product`, `V2Tenant`). Definiti in `src/types/`.
- Colonne: `snake_case`. Tabelle: `snake_case` plurale.
- Foreign key: `entita_id` (es. `product_id`, `tenant_id`, `catalog_id`).
- Self-reference: `parent_<entita>_id` (es. `parent_product_id`, `parent_category_id`).
- Join tables: `entita1_entita2` in ordine alfabetico o per gerarchia logica.

### 3.3 Relazioni

- Ogni relazione 1:N usa foreign key con `ON DELETE` appropriato (CASCADE per figli, RESTRICT per riferimenti).
- Le relazioni N:M usano tabelle ponte con `tenant_id` proprio.
- Self-reference per gerarchie: `parent_<entita>_id` nullable.
- Soft-delete: SOLO su `tenants` (via `deleted_at`). Le altre entita' usano hard delete.

### 3.4 Entita' Prodotto (Complessita' Specifica)

Il modello prodotto ha regole specifiche:
- `product_type`: `"simple"` | `"formats"` | `"configurable"`. Non aggiungere nuovi tipi senza esplicita richiesta.
- `variant_strategy`: `"manual"` | `"matrix"`. Le varianti sono prodotti figli (stessa tabella, `parent_product_id` valorizzato).
- Option groups: `group_kind` e' `"PRIMARY_PRICE"` (formati) o `"ADDON"` (extra). `pricing_mode` e' `"ABSOLUTE"` o `"DELTA"`.
- Attributi: `product_attribute_definitions.tenant_id = NULL` → attributo di piattaforma. `tenant_id` valorizzato → attributo custom del tenant.

---

## 4. Regole Integrazioni Esterne

### 4.1 Supabase Client

- Il client Supabase e' inizializzato in `src/services/supabase/client.ts`. Usare SOLO quell'istanza.
- Non creare istanze Supabase aggiuntive.
- Non usare `service_role` key nel frontend. MAI.
- Per storage upload, usare i pattern esistenti in `src/services/supabase/upload.ts`.

### 4.2 Edge Functions

- Le Edge Functions risiedono in `supabase/functions/`.
- Ogni function ha il proprio `index.ts` come entry point.
- Il codice condiviso tra functions va in `supabase/functions/_shared/`.
- Le functions attuali sono: `send-otp`, `verify-otp`, `status-otp`, `generate-menu-pdf`, `menu-ai-import`, `send-tenant-invite`, `delete-account`, `recover-account`, `purge-accounts`, `delete-tenant`, `restore-tenant`, `purge-tenant-now`, `delete-business`.
- Per creare una nuova Edge Function:
  1. Creare la directory `supabase/functions/<nome-funzione>/`
  2. Creare `index.ts` come entry point
  3. Registrare in `supabase/config.toml` con `verify_jwt = false` se necessario
  4. Il codice condiviso va in `_shared/`, non duplicato

### 4.3 Email (Resend)

- L'invio email avviene SOLO tramite Edge Functions, MAI dal frontend.
- Resend e' integrato nelle Edge Functions `send-otp` e `send-tenant-invite`.
- Per nuove email: creare o estendere una Edge Function, non aggiungere Resend al frontend.

### 4.4 Storage

- Upload immagini: usare `src/services/supabase/upload.ts`.
- Compressione immagini client-side: usare `src/utils/compressImage.ts`.
- Bucket separati per: prodotti, logo tenant, media attivita'.

---

## 5. Pattern Obbligatori

### 5.1 Service Layer Pattern

```
src/services/supabase/<dominio>.ts
```

- Un file per dominio (products, catalogs, activities, styles, ecc.).
- Ogni funzione riceve `tenantId` come primo o secondo parametro.
- Le funzioni `list*` ritornano `Promise<T[]>` (array vuoto se nessun risultato, MAI null).
- Le funzioni `get*` lanciano errore se non trovano (non ritornano null).
- Le funzioni `create*`/`update*` ritornano l'entita' salvata.
- Le funzioni `delete*` ritornano `Promise<void>`.

### 5.2 Page-Level State Pattern

Ogni pagina che mostra una lista di entita' DEVE implementare:
- `useState` per `items`, `isLoading`, `isDrawerOpen`, `mode`, `selected`
- `useCallback` per `loadData` con dipendenze `[tenantId, showToast]`
- `useEffect` che chiama `loadData` al mount
- Handler: `handleCreate`, `handleEdit`, `handleClose`, `handleSuccess`
- `handleSuccess` DEVE: ricaricare i dati, chiudere il drawer, mostrare toast

### 5.3 Form Pattern

- I form sono componenti separati dai drawer.
- Props obbligatorie: `formId`, `mode`, `entityData`, `tenantId`, `onSuccess`, `onSavingChange`.
- Il form usa `<form id={formId} onSubmit={handleSubmit}>`.
- Il submit button e' FUORI dal form, nel footer del DrawerLayout, collegato via `form={formId}`.
- Il form notifica lo stato saving: `useEffect(() => { onSavingChange?.(isSaving); }, [isSaving, onSavingChange]);`

### 5.4 Schedule Logic

- Tre tipi di regola: `"layout"`, `"price"`, `"visibility"`.
- Le regole hanno priorita' 1-10 (10 = massima).
- Risoluzione runtime: filtra abilitate → filtra per target → filtra per finestra temporale → ordina per priorita' → la piu' alta vince.
- Target: `applyToAll: true` OPPURE lista di `schedule_targets` (tipo "activity" o "group").
- Finestra temporale: `time_mode` ("always" o "window"), `days_of_week[]`, `time_from/to`, `start_at/end_at`.
- Il codice di risoluzione schedule e' in `src/services/supabase/scheduleResolver.ts` e duplicato in `supabase/functions/_shared/scheduleResolver.ts`. Modifiche DEVONO essere applicate a ENTRAMBI.

### 5.5 Style Versioning

- Gli stili usano versioning immutabile.
- `styles` punta a `current_version_id`.
- `style_versions` e' immutabile: ogni modifica crea una NUOVA versione.
- I cataloghi referenziano `active_style_version_id` (la versione, NON lo stile).
- Non modificare versioni esistenti. Creare sempre una nuova riga in `style_versions`.

### 5.6 Toast Notifications

```tsx
const { showToast } = useToast();
showToast({ message: "Messaggio", type: "success" }); // success | error | info | warning
```

- Usare SEMPRE `useToast()` per feedback utente.
- Tipo `"success"` per operazioni riuscite.
- Tipo `"error"` per fallimenti.
- Messaggi in italiano.

### 5.7 Import Aliases

Usare SEMPRE gli alias configurati:

```ts
import { ... } from "@/...";           // src/
import { ... } from "@components/..."; // src/components/
import { ... } from "@pages/...";      // src/pages/
import { ... } from "@context/...";    // src/context/
import { ... } from "@services/...";   // src/services/
import { ... } from "@types/...";      // src/types/
import { ... } from "@utils/...";      // src/utils/
import { ... } from "@layouts/...";    // src/layouts/
import { ... } from "@styles/...";     // src/styles/
```

MAI usare path relativi che risalgono piu' di un livello (`../../`). Usare gli alias.

---

## 6. Anti-Pattern da Evitare

### 6.1 PROIBITO — Sicurezza

- **MAI** modificare migration files esistenti.
- **MAI** rimuovere o indebolire policy RLS.
- **MAI** esporre chiavi `service_role` nel codice frontend.
- **MAI** bypassare la validazione tenant.
- **MAI** creare tabelle tenant-scoped senza RLS.
- **MAI** referenziare `v2_activity_schedules` (tabella ELIMINATA nella migration 20260302130000).

### 6.2 PROIBITO — Architettura

- **MAI** chiamare Supabase direttamente da un componente React. Passare SEMPRE dal service layer.
- **MAI** derivare `tenant_id` da `auth.user.id`.
- **MAI** creare nuovi provider context senza necessita' comprovata.
- **MAI** usare modali centrate per operazioni CRUD. Usare SEMPRE drawer laterali.
- **MAI** creare router secondari fuori da `App.tsx`.
- **MAI** aggiungere un top navbar o barra di navigazione orizzontale.
- **MAI** duplicare un componente UI che gia' esiste in `src/components/ui/`.
- **MAI** usare `any` come tipo TypeScript. Strict mode e' attivo.

### 6.3 PROIBITO — Database

- **MAI** usare il prefisso `v2_` nelle query dei service files. Le tabelle nel database NON hanno quel prefisso.
- **MAI** creare tabelle senza `tenant_id` (eccetto tabelle di sistema come `allergens`).
- **MAI** usare `ON DELETE CASCADE` su relazioni cross-dominio senza esplicita richiesta.
- **MAI** modificare la funzione `get_my_tenant_ids()` senza una review di sicurezza.

### 6.4 PROIBITO — Frontend

- **MAI** usare CSS inline per stili che dovrebbero essere in un `.module.scss`.
- **MAI** scrivere label, messaggi o testi dell'interfaccia in inglese. TUTTO e' in italiano.
- **MAI** esporre `owner_user_id` nell'interfaccia utente.
- **MAI** creare file di test senza che siano stati richiesti.
- **MAI** aggiungere librerie npm senza esplicita richiesta.
- **MAI** mettere il bottone submit dentro il tag `<form>` di un drawer. Va nel footer del DrawerLayout, collegato via attributo `form`.

### 6.5 PROIBITO — Pattern

- **MAI** ritornare `null` da una funzione `list*`. Ritornare SEMPRE un array vuoto `[]`.
- **MAI** usare `useEffect` senza `useCallback` per il data loading.
- **MAI** omettere `showToast` nei catch block del data loading.
- **MAI** dimenticare di ricaricare i dati dopo un'operazione CRUD riuscita (il flusso e': success → reload → close drawer → toast).
- **MAI** creare un form che gestisce anche la logica del drawer. Form e drawer DEVONO essere componenti separati.
- **MAI** modificare `scheduleResolver.ts` in una sola location. Esiste in DUE posti (`src/services/supabase/` e `supabase/functions/_shared/`) e DEVONO restare sincronizzati.

---

## Checklist Pre-Implementazione

Prima di scrivere qualsiasi codice:

- [ ] Ho cercato implementazioni simili nel repository?
- [ ] Sto seguendo il pattern del dominio piu' simile?
- [ ] Il `tenant_id` proviene da `useTenantId()`?
- [ ] Il service file esiste gia' o devo crearne uno nuovo?
- [ ] I componenti UI che mi servono esistono gia' in `src/components/ui/`?
- [ ] La nuova tabella ha RLS con `get_my_tenant_ids()`?
- [ ] I testi dell'interfaccia sono in italiano?
- [ ] Il drawer segue lo stack SystemDrawer → DrawerLayout → Form?
- [ ] La migration e' un file NUOVO, non una modifica a uno esistente?
