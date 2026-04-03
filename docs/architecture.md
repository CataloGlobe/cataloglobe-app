# CataloGlobe — Documentazione Tecnica Completa

## Indice

1. [Panoramica del Progetto](#1-panoramica-del-progetto)
2. [Stack Tecnologico](#2-stack-tecnologico)
3. [Architettura Generale](#3-architettura-generale)
4. [Struttura delle Cartelle](#4-struttura-delle-cartelle)
5. [Modello Dati](#5-modello-dati)
6. [Flussi Principali](#6-flussi-principali)
7. [Componenti UI](#7-componenti-ui)
8. [Pagine e Logica](#8-pagine-e-logica)
9. [Integrazioni Esterne](#9-integrazioni-esterne)
10. [Pattern Architetturali](#10-pattern-architetturali)
11. [Convenzioni e Regole](#11-convenzioni-e-regole)

---

## 1. Panoramica del Progetto

**CataloGlobe** è una piattaforma SaaS multi-tenant per la gestione di cataloghi digitali. Nasce per il settore ristorazione (menu digitali) ma supporta verticali multipli: hospitality, retail, generico.

**Concetti chiave:**
- **Tenant** (`tenants`) → azienda/brand. Un utente può possedere o essere membro di più tenant.
- **Activity** (`activities`) → sede fisica/filiale del tenant.
- **Entità di catalogo** (prodotti, cataloghi, stili, contenuti in evidenza) → sempre tenant-scoped.
- **Scheduling** → sistema di regole basato su tempo, priorità e target per controllare layout, prezzi e visibilità per sede.

**Visione architetturale:** CataloGlobe non è un semplice menu builder — è un **motore di distribuzione contenuti** dove il catalogo è il "programma", lo stile è il "tema", e le schedule sono l'"orchestratore" che decide cosa mostrare, dove e quando.

---

## 2. Stack Tecnologico

### Frontend
| Tecnologia | Versione | Ruolo |
|---|---|---|
| React | 19.1.1 | UI framework |
| TypeScript | 5.9.3 | Type safety (strict mode) |
| Vite | 7.1.7 | Build tool e dev server |
| React Router | v7.9.4 | Routing client-side |
| Framer Motion | 12.29.2 | Animazioni (drawer, transizioni) |
| SCSS Modules | sass-embedded 1.93.2 | Styling component-scoped |
| Lucide React | 0.552.0 | Iconografia principale |
| @tabler/icons-react | — | Iconografia secondaria |
| Recharts | 3.3.0 | Grafici (analytics) |
| @dnd-kit | — | Drag & drop (categorie, prodotti) |
| @radix-ui | — | Primitives (dropdown-menu, tooltip) |
| qrcode.react | — | Generazione QR code |

### Backend
| Tecnologia | Ruolo |
|---|---|
| Supabase | BaaS: PostgreSQL, Auth, Storage, Edge Functions, Realtime |
| PostgreSQL | Database con RLS (Row Level Security) |
| Supabase Edge Functions (Deno) | Serverless logic: OTP, PDF, inviti, account mgmt |
| Puppeteer | Generazione PDF lato server (Edge Function) |

### Testing
| Tecnologia | Ruolo |
|---|---|
| Vitest | 4.1.2 | Unit e integration test |

### Build & Dev
```bash
npm run dev          # Vite dev server (HMR)
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run test         # vitest run
npm run test:watch   # vitest watch mode
```

---

## 3. Architettura Generale

### 3.1 Provider Nesting (src/main.tsx)

```
<ThemeProvider>
  <TooltipProvider>
    <BrowserRouter>
      <AuthProvider>          ← Supabase Auth + OTP
        <ToastProvider>       ← Notifiche globali
          <App />             ← Route definitions
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
</ThemeProvider>
```

**Nota:** `TenantProvider` NON è globale — è applicato per-route solo su `/business/:businessId/*`.

### 3.2 Routing (src/App.tsx)

| Pattern | Layout | Guard | Descrizione |
|---|---|---|---|
| `/login`, `/sign-up`, `/check-email` | nessuno | `GuestRoute` | Autenticazione |
| `/verify-otp` | nessuno | `OtpRoute` | Verifica OTP post-login |
| `/reset-password` | nessuno | `RecoveryRoute` | Reset password |
| `/workspace/*` | `WorkspaceLayout` | `ProtectedRoute` | Area workspace (selezione tenant) |
| `/onboarding/create-business` | nessuno | `ProtectedRoute` | Onboarding nuovo business |
| `/business/:businessId/*` | `MainLayout` | `ProtectedRoute` + `TenantProvider` | Dashboard business |
| `/:slug` | nessuno | nessuno | Vista pubblica catalogo |
| `/` | nessuno | nessuno | Landing page |

**Route business** (`/business/:businessId/`):
- `overview` — Panoramica
- `locations`, `locations/:activityId` — Sedi
- `scheduling`, `scheduling/:ruleId` — Programmazione
- `catalogs`, `catalogs/:id` — Cataloghi (CatalogEngine)
- `products`, `products/:productId` — Prodotti
- `featured`, `featured/:featuredId` — Contenuti in evidenza
- `styles`, `styles/:styleId` — Stili
- `attributes` — Attributi
- `reviews` — Recensioni
- `analytics` — Analitiche
- `team` — Team
- `settings` — Impostazioni

### 3.3 Layouts

**MainLayout** (`src/layouts/MainLayout/`):
- Sidebar collassabile (260px → 90px desktop, modale su mobile) + `DrawerProvider` + `<Outlet />`
- Hamburger header su mobile

**WorkspaceLayout** (`src/layouts/WorkspaceLayout/`):
- Layout minimal per selezione tenant e impostazioni workspace

**SiteLayout** (`src/layouts/SiteLayout/`):
- Layout minimal per pagine pubbliche

### 3.4 Route Guards (src/components/Routes/)

| Guard | Condizione | Redirect |
|---|---|---|
| `ProtectedRoute` | `user` + `otpVerified` | → `/login` o `/verify-otp` |
| `GuestRoute` | NON autenticato (eccetto recovery) | → dashboard |
| `OtpRoute` | `user` presente, OTP non verificato | — |
| `RecoveryRoute` | Flag `passwordRecoveryFlow` in sessionStorage | — |

---

## 4. Struttura delle Cartelle

```
src/
├── App.tsx                          # Definizione di tutte le route
├── main.tsx                         # Entry point, provider nesting
│
├── components/
│   ├── ui/                          # 36+ primitives riutilizzabili
│   │   ├── Button/                  # primary|secondary|outline|ghost|danger
│   │   ├── Text/                    # title-lg/md/sm, subtitle, body-*, caption
│   │   ├── TextInput/               # Input testuale
│   │   ├── Textarea/                # Textarea
│   │   ├── SearchInput/             # Input di ricerca
│   │   ├── Select/                  # Select dropdown
│   │   ├── NumberInput/             # Input numerico
│   │   ├── DateInput/               # Input data
│   │   ├── TimeInput/               # Input orario
│   │   ├── ColorInput/              # Color picker
│   │   ├── RangeInput/              # Range slider
│   │   ├── FileInput/               # Upload file
│   │   ├── RadioGroup/              # Radio buttons
│   │   ├── SegmentedControl/        # Segmented toggle
│   │   ├── CheckboxInput/           # Checkbox
│   │   ├── Switch/                  # Toggle switch
│   │   ├── DataTable/               # Tabella con sort, pagination, density
│   │   ├── Tabs/                    # Tab navigation
│   │   ├── Card/                    # Card container
│   │   ├── Badge/                   # Badge inline
│   │   ├── Pill/, PillGroup/        # Pill tags
│   │   ├── Tooltip/                 # Tooltip (Radix-based)
│   │   ├── PageHeader/              # Titolo + breadcrumbs + azioni
│   │   ├── FilterBar/               # Barra filtri + search
│   │   ├── ConfirmDialog/           # Dialogo conferma
│   │   ├── Drawer/                  # Drawer alto livello
│   │   ├── EmptyState/              # Stato vuoto
│   │   ├── Divider/                 # Divider
│   │   ├── Breadcrumb/              # Breadcrumb
│   │   ├── Skeleton/                # Loading skeleton
│   │   ├── Loader/, AppLoader/      # Loading spinner
│   │   ├── DropdownMenu/            # Dropdown (Radix-based)
│   │   └── Toast/                   # Toast notification
│   │
│   ├── layout/
│   │   ├── Sidebar/                 # Navigazione laterale (gruppi, collapse)
│   │   └── SystemDrawer/            # Primitiva drawer: portal, backdrop, ESC, focus trap
│   │
│   ├── Routes/                      # Guard components (Protected, Guest, Otp, Recovery)
│   ├── Businesses/                  # Business/Activity UI components
│   ├── PublicCollectionView/        # Rendering catalogo pubblico
│   │   ├── CollectionView.tsx       # Hero + sezioni (categorie)
│   │   ├── PublicProductCard.tsx     # Card prodotto (no-image, compact, detailed)
│   │   └── ItemDetail.tsx           # Modal dettaglio prodotto
│   └── Products/                    # Componenti prodotto condivisi
│
├── context/
│   ├── AuthProvider.tsx             # Auth Supabase + OTP verification
│   ├── TenantProvider.tsx           # Selezione tenant da URL businessId
│   ├── useTenantId.ts              # Hook shortcut per selectedTenantId
│   ├── Drawer/                      # DrawerProvider globale
│   ├── Toast/                       # ToastProvider + useToast()
│   ├── Tooltip/                     # TooltipProvider
│   └── Theme/                       # ThemeProvider
│
├── pages/
│   ├── Auth/                        # Login, SignUp, VerifyOtp, CheckEmail, ResetPassword
│   ├── Workspace/                   # WorkspacePage, BillingPage, WorkspaceSettings
│   ├── Business/                    # OverviewPage, BusinessSettingsPage, TeamPage
│   ├── Onboarding/                  # CreateBusiness
│   ├── Home/                        # Landing page
│   ├── PublicCollectionPage/        # Pagina catalogo pubblico
│   └── Dashboard/
│       ├── Products/                # Prodotti (lista, dettaglio, drawer, tabs)
│       ├── Catalogs/                # Cataloghi + CatalogEngine
│       ├── Programming/             # Programmazione (schedule rules)
│       ├── Highlights/              # Contenuti in evidenza
│       ├── Styles/                  # Editor stili
│       ├── Attributes/              # Attributi prodotto
│       └── Businesses/              # Sedi/attività
│
├── layouts/
│   ├── MainLayout/                  # Business area (sidebar + drawer + outlet)
│   ├── WorkspaceLayout/             # Workspace area
│   └── SiteLayout/                  # Layout pubblico minimal
│
├── services/supabase/               # Layer di accesso dati (27 file)
│   ├── client.ts                    # Supabase client init
│   ├── auth.ts                      # Auth helpers
│   ├── products.ts                  # CRUD prodotti
│   ├── productVariants.ts           # Matrix/manual variants
│   ├── productOptions.ts            # Option groups/values
│   ├── catalogs.ts                  # CRUD cataloghi + categorie
│   ├── activities.ts                # CRUD sedi
│   ├── tenants.ts                   # Logo, info pubblica, soft-delete
│   ├── styles.ts                    # Stili + versioning
│   ├── featuredContents.ts          # Contenuti in evidenza + prodotti
│   ├── layoutScheduling.ts          # Schedule rules (layout/price/visibility)
│   ├── scheduleResolver.ts          # Risoluzione schedule attive
│   ├── schedulingNow.ts             # Helper "now" per scheduling
│   ├── attributes.ts                # Definizioni + valori attributi
│   ├── allergens.ts                 # Allergeni sistema + prodotto
│   ├── ingredients.ts               # Ingredienti
│   ├── productGroups.ts             # Gruppi prodotto
│   ├── activity-groups.ts           # Gruppi attività
│   ├── reviews.ts                   # Recensioni
│   ├── qrScans.ts                   # QR scan tracking
│   ├── activeCatalog.ts             # Catalogo attivo per attività
│   ├── resolveActivityCatalogs.ts   # Risoluzione cataloghi per attività
│   ├── resolveBusinessCollections.ts # Risoluzione collezioni business
│   ├── profile.ts                   # Profilo utente
│   ├── account.ts                   # Gestione account
│   ├── upload.ts                    # Upload file
│   └── activity-media.ts            # Media attività
│
├── types/                           # 18 file di tipi TypeScript
│   ├── tenant.ts                    # V2Tenant
│   ├── activity.ts                  # V2Activity
│   ├── product.ts                   # V2Product, product_type, variant_strategy
│   ├── catalog.ts                   # V2Catalog, V2CatalogCategory, V2CatalogCategoryProduct
│   ├── style.ts                     # V2Style, V2StyleVersion
│   ├── schedule.ts                  # LayoutRule, ScheduleTarget
│   ├── option.ts                    # V2ProductOptionGroup, V2ProductOptionValue
│   ├── attribute.ts                 # V2ProductAttributeDefinition, V2ProductAttributeValue
│   ├── variant.ts                   # VariantDimension, VariantMatrixConfig
│   ├── featuredContent.ts           # V2FeaturedContent
│   ├── auth.ts                      # Auth types
│   └── ...                          # Altri tipi
│
├── styles/
│   ├── global.scss                  # Reset, utilities globali
│   ├── _theme.scss                  # CSS custom properties (colori, spacing, radius)
│   ├── _typography.scss             # Scale tipografica
│   └── _variables.scss              # Variabili SCSS condivise
│
├── utils/                           # 15 file utility
│   ├── attributes.ts                # Helper attributi
│   ├── priceDisplay.ts              # Formattazione prezzi
│   ├── priceParser.ts               # Parsing prezzi
│   ├── variantCombinations.ts       # Generazione combinazioni varianti
│   ├── compressImage.ts             # Compressione immagini client-side
│   ├── businessSlug.ts              # Generazione slug business
│   ├── slugify.ts                   # Slugify generico
│   ├── getReadableTextColor.ts      # Contrasto colore testo
│   ├── pillColors.ts                # Colori per pill/badge
│   ├── ruleHelpers.ts               # Helper regole scheduling
│   ├── getDefaultPublicStyle.ts     # Stile pubblico default
│   ├── getEmptyCopy.ts              # Copie stato vuoto
│   ├── feedbackData.ts              # Dati feedback
│   ├── aiMenu.ts                    # AI menu import helpers
│   └── useProfile.ts                # Hook profilo utente
│
├── constants/                       # Costanti applicazione
├── config/                          # Configurazione app
├── features/
│   └── public/mock/                 # Mock data per sviluppo vista pubblica
└── tests/
    └── scheduling/                  # Test schedule resolver
```

---

## 5. Modello Dati

### 5.1 Diagramma Entità (34 tabelle)

```
auth.users
  ├── tenants (1:N via owner_user_id)              ← Azienda/Brand
  │     ├── tenant_memberships (1:N)                ← Membri del team
  │     ├── activities (1:N)                        ← Sedi/Filiali
  │     │     ├── activity_media (1:N)
  │     │     └── activity_group_members (N:M)
  │     ├── activity_groups (1:N)                   ← Gruppi di sedi
  │     │
  │     ├── products (1:N)                          ← Prodotti
  │     │     ├── products (self-ref via parent_product_id) ← Varianti
  │     │     ├── product_option_groups (1:N)        ← Gruppi opzione
  │     │     │     └── product_option_values (1:N)  ← Valori opzione
  │     │     ├── product_variant_dimensions (1:N)   ← Dimensioni matrice
  │     │     │     └── product_variant_dimension_values (1:N)
  │     │     ├── product_variant_assignments (1:N)  ← Assegnazioni variante
  │     │     │     └── product_variant_assignment_values (1:N)
  │     │     ├── product_allergens (N:M)
  │     │     ├── product_ingredients (N:M)
  │     │     ├── product_attribute_values (1:N)
  │     │     └── product_group_items (N:M)
  │     │
  │     ├── product_groups (1:N)                    ← Gruppi prodotto
  │     │
  │     ├── product_attribute_definitions (1:N)     ← Attributi (tenant_id nullable = piattaforma)
  │     │
  │     ├── catalogs (1:N)                          ← Cataloghi
  │     │     ├── catalog_categories (1:N, self-ref) ← Categorie (fino a 3 livelli)
  │     │     └── catalog_category_products (1:N)    ← Prodotti in categoria
  │     │
  │     ├── styles (1:N)                            ← Stili grafici
  │     │     └── style_versions (1:N)              ← Versioni immutabili
  │     │
  │     ├── featured_contents (1:N)                 ← Contenuti in evidenza
  │     │     └── featured_content_products (1:N)
  │     │
  │     └── schedules (1:N)                         ← Regole di programmazione
  │           ├── schedule_layout (1:1)             ← Layout rule payload
  │           ├── schedule_price_overrides (1:N)    ← Override prezzi
  │           ├── schedule_visibility_overrides (1:N) ← Override visibilità
  │           ├── schedule_featured_contents (1:N)  ← Contenuti evidenza schedulati
  │           └── schedule_targets (1:N)            ← Target (attività/gruppi) — NO RLS!
  │
  └── allergens (sistema, no tenant_id)             ← Allergeni di sistema
```

### 5.2 Entità Principali

#### Tenant
```ts
V2Tenant {
  id: string;
  owner_user_id: string;         // proprietario
  name: string;                  // nome azienda
  vertical_type: string;         // "generic" | "restaurant" | ...
  logo_url?: string;
  created_at: string;
  deleted_at?: string;           // soft-delete
  user_role?: "owner" | "admin" | "member"; // dal JOIN con memberships
}
```

#### Activity (Sede)
```ts
V2Activity {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;                  // URL-friendly, unique per tenant
  activity_type?: string;        // sottotipo opzionale
  address?: string;
  city?: string;
  cover_image?: string;
  description?: string;
  status: "active" | "inactive";
}
```

#### Product
```ts
V2Product {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  base_price?: number;
  image_url?: string;
  parent_product_id?: string;    // se valorizzato → è una variante
  product_type: "simple" | "formats" | "configurable";
  variant_strategy?: "manual" | "matrix";
  variants?: V2Product[];        // JOIN su figli
}
```

**Tipi prodotto:**
- `simple` — prodotto singolo senza varianti
- `formats` — prodotto con formati (es. pizza piccola/media/grande) → varianti con prezzo proprio
- `configurable` — prodotto con opzioni addon (es. extra mozzarella)

**Strategie varianti:**
- `manual` — varianti create manualmente come prodotti figli
- `matrix` — varianti generate automaticamente dal prodotto cartesiano delle dimensioni

#### Catalogo
```ts
V2Catalog {
  id: string;
  tenant_id: string;
  name: string;
}

V2CatalogCategory {
  id: string;
  tenant_id: string;
  catalog_id: string;
  parent_category_id?: string;   // fino a 3 livelli
  name: string;
  level: number;                 // 1, 2, o 3
  sort_order: number;
}

V2CatalogCategoryProduct {
  id: string;
  tenant_id: string;
  catalog_id: string;
  category_id: string;
  product_id: string;
  variant_product_id?: string;   // se associato una variante specifica
  sort_order: number;
}
```

#### Schedule (Regola di Programmazione)
```ts
LayoutRule {
  id: string;
  tenant_id: string;
  name: string;
  rule_type: "layout" | "price" | "visibility";
  target_type: string;
  target_id?: string;
  apply_to_all: boolean;         // applica a tutte le sedi
  visibility_mode?: "hide" | "disable";
  priority: number;              // 1-10
  enabled: boolean;
  time_mode: "always" | "window";
  days_of_week?: number[];       // 0-6 (dom-sab)
  time_from?: string;            // "HH:MM"
  time_to?: string;
  start_at?: string;             // ISO datetime
  end_at?: string;
  // Payload varia per rule_type:
  layout?: { style_id, catalog_id };
  priceOverrides?: [{ product_id, option_value_id, override_price, show_original_price }];
  visibilityOverrides?: [{ product_id, mode, visible }];
  targets?: [{ target_type: "activity" | "group", target_id }];
}
```

#### Stile
```ts
V2Style {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
  is_active: boolean;
  current_version_id?: string;
  current_version?: V2StyleVersion;
}

V2StyleVersion {
  id: string;
  tenant_id: string;
  style_id: string;
  version: number;
  config: Record<string, unknown>;  // JSON con token di stile
  created_at: string;
}
```
Le versioni sono **immutabili** — ogni modifica crea una nuova versione.

#### Option Groups & Values
```ts
V2ProductOptionGroup {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  max_selectable?: number;
  group_kind: "PRIMARY_PRICE" | "ADDON";
  pricing_mode: "ABSOLUTE" | "DELTA";
}

V2ProductOptionValue {
  id: string;
  tenant_id: string;
  option_group_id: string;
  name: string;
  price_modifier?: number;      // usato in DELTA mode
  absolute_price?: number;      // usato in ABSOLUTE mode
}
```

- `PRIMARY_PRICE` → formati/dimensioni del prodotto (es. S/M/L)
- `ADDON` → extra opzionali (es. ingredienti aggiuntivi)

#### Attributi
```ts
V2ProductAttributeDefinition {
  id: string;
  tenant_id?: string;            // NULL = attributo di piattaforma
  code: string;                  // unique per tenant (o globale)
  label: string;
  type: "text" | "number" | "boolean" | "select" | "multi_select";
  options?: string[];            // per select/multi_select
  is_required: boolean;
  vertical?: string;             // filtra per verticale
}

V2ProductAttributeValue {
  id: string;
  tenant_id: string;
  product_id: string;
  attribute_definition_id: string;
  value_text?: string;
  value_number?: number;
  value_boolean?: boolean;
  value_json?: unknown;
}
```

#### Variant Matrix
```ts
VariantDimension {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;                  // es. "Taglia", "Colore"
  sort_order: number;
  values: VariantDimensionValue[];
}

VariantDimensionValue {
  id: string;
  tenant_id: string;
  dimension_id: string;
  label: string;                 // es. "S", "M", "L"
  sort_order: number;
}

VariantAssignment {
  id: string;
  tenant_id: string;
  parent_product_id: string;
  variant_product_id: string;
  combination_key: string;       // es. "Taglia:S|Colore:Rosso"
}
```

---

## 6. Flussi Principali

### 6.1 Autenticazione

```
1. Utente → /login → email/password via Supabase Auth
2. Supabase Auth → session JWT con session_id custom
3. AuthProvider intercetta onAuthStateChange
4. AuthProvider verifica OTP: SELECT FROM otp_session_verifications WHERE session_id = ?
5. Se OTP non verificato → redirect /verify-otp
6. Se OTP verificato → otpVerified = true → accesso consentito
7. Password recovery: sessionStorage flag → RecoveryRoute → /reset-password
```

### 6.2 Selezione Tenant

```
1. ProtectedRoute verifica autenticazione
2. TenantProvider (su /business/:businessId) fetch tenant list da user_tenants_view
3. businessId dall'URL → selectedTenant derivato sincronamente
4. Se businessId non tra i tenant dell'utente → redirect /workspace
5. selectedTenantId disponibile via useTenant() o useTenantId()
6. Tutti i service call ricevono tenantId esplicitamente
```

### 6.3 Gestione Prodotto (CRUD)

```
1. Products.tsx carica lista → listBaseProductsWithVariants(tenantId)
2. Utente clicca "Crea" → ProductCreateEditDrawer (mode: "create")
3. ProductForm raccoglie: name, description, product_type, variant_strategy, base_price, image
4. Submit → createProduct(tenantId, data) → onSuccess → ricarica lista + toast
5. Click su prodotto → /products/:productId → ProductPage
6. ProductPage tabs:
   - Generale: nome, descrizione, immagine
   - Prezzi: base_price + PRIMARY_PRICE option groups
   - Varianti: lista varianti figli (solo per parent) + MatrixConfigDrawer
   - Configurazioni: ADDON option groups
   - Attributi: valori attributi per questo prodotto
   - Utilizzo: in quali cataloghi appare
```

### 6.4 CatalogEngine (Costruzione Catalogo)

```
1. CatalogEngine.tsx carica catalogo + categorie + prodotti
2. Vista split: albero categorie (sinistra) + prodotti nella categoria (destra)
3. Aggiunta categoria: inline create nella sidebar
4. Aggiunta prodotto: ProductPickerDrawer con search + filtri
5. Supporto variant selection: se prodotto ha varianti, utente sceglie quale variante associare
6. Drag-drop per riordino categorie e prodotti
7. Categorie supportano fino a 3 livelli di nesting (parent_category_id)
```

### 6.5 Scheduling (Programmazione)

```
1. Programming.tsx mostra lista regole con filtri (rule_type, search)
2. Crea regola → ProgrammingRuleDetail
3. Regola composta da:
   - Sezione scheduling: time_mode, days_of_week, time_from/to, start_at/end_at
   - Sezione priorità: 1-10
   - Sezione target: applyToAll OPPURE selezione attività/gruppi
   - Sezione contenuto: dipende da rule_type
     - layout → scelta stile + catalogo
     - price → override prezzi prodotti
     - visibility → override visibilità prodotti
4. Simulazione: pannello per testare regole a data/ora/attività specifica
5. Insight system: rileva conflitti, override, regole inutilizzate
```

### 6.6 Vista Pubblica

```
1. /:slug → PublicCollectionPage
2. resolveBusinessCollections(slug) → risolve attività da slug
3. scheduleResolver determina layout attivo (stile + catalogo) basato su:
   - Ora corrente, giorno della settimana
   - Attività target
   - Priorità regole
4. Rendering: CollectionView con hero + sezioni (categorie)
5. Ogni prodotto → PublicProductCard con CardTemplate variabile:
   - no-image: solo testo
   - compact: immagine piccola
   - detailed: immagine grande + descrizione
6. Click su card → ItemDetail modal con varianti, attributi, addons
7. Stile applicato via CSS custom properties mappate dai token dello stile attivo
```

---

## 7. Componenti UI

### 7.1 Libreria Primitives (src/components/ui/)

**Input:**
| Componente | Props chiave | Note |
|---|---|---|
| `TextInput` | label, value, onChange, error, placeholder | |
| `Textarea` | label, value, onChange, rows | |
| `SearchInput` | value, onChange, placeholder | Con icona search |
| `NumberInput` | label, value, onChange, min, max, step | |
| `DateInput` | label, value, onChange | |
| `TimeInput` | label, value, onChange | |
| `ColorInput` | label, value, onChange | Color picker |
| `RangeInput` | label, value, onChange, min, max | Slider |
| `FileInput` | label, onChange, accept | Upload |
| `Select` | label, value, onChange, options | Dropdown |
| `RadioGroup` | label, value, onChange, options | Radio buttons |
| `SegmentedControl` | value, onChange, options | Toggle segmentato |
| `CheckboxInput` | label, checked, onChange | |
| `Switch` | label, checked, onChange | Toggle |

**Display:**
| Componente | Props chiave | Note |
|---|---|---|
| `Button` | variant, size, loading, leftIcon, rightIcon, as | `primary\|secondary\|outline\|ghost\|danger`, `sm\|md\|lg` |
| `Text` | variant, as | `title-lg/md/sm\|subtitle\|body-lg/body/body-sm\|caption\|button` |
| `Badge` | variant, size | |
| `Pill` | label, onRemove | Tag rimovibile |
| `PillGroup` | pills, onRemove | Gruppo pill |
| `Card` | — | Container card |
| `Divider` | — | |

**Data:**
| Componente | Props chiave | Note |
|---|---|---|
| `DataTable` | rows, columns, onSort, pagination, selectable, density | Sortable, paginata, density-aware |
| `Tabs` | activeTab, onChange, children: Tab[] | |
| `Breadcrumb` | items | |

**Feedback:**
| Componente | Props chiave | Note |
|---|---|---|
| `Toast` | — | Via `useToast().showToast()` |
| `Loader` | size | Spinner |
| `AppLoader` | — | Loader full-page |
| `Skeleton` | — | Loading placeholder |
| `EmptyState` | title, description, action | Stato vuoto |
| `ConfirmDialog` | open, title, message, onConfirm, onCancel | Dialogo conferma |
| `Tooltip` | content, children | Radix-based |

**Layout:**
| Componente | Props chiave | Note |
|---|---|---|
| `PageHeader` | title, breadcrumbs, actions | Header pagina |
| `FilterBar` | search, filters, onSearch, onFilterChange | Barra filtri |
| `SystemDrawer` | open, onClose, width | Primitiva: portal, backdrop, ESC, focus trap |
| `DrawerLayout` | header, children, footer | Wrapper strutturale |
| `ModalLayout` | — | Layout modale |
| `DropdownMenu` | — | Radix-based |

### 7.2 Pattern Drawer

Tutti i flussi create/edit usano drawer laterali destri, MAI modali centrate.

```
Stack:
1. SystemDrawer         ← Primitiva (Framer Motion slide-in, portal, backdrop, ESC, focus trap)
2. DrawerLayout         ← Wrapper strutturale (header, children, footer)
3. Domain-specific      ← EntityCreateEditDrawer / EntityDeleteDrawer

Dimensioni standard:
- sm: 420px
- md: 520px (default)
- lg: 720px
```

**Pattern standard:**
```tsx
<SystemDrawer open={open} onClose={onClose} width={520}>
  <DrawerLayout
    header={<Text variant="title-sm">{mode === "create" ? "Crea" : "Modifica"}</Text>}
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annulla</Button>
        <Button variant="primary" type="submit" form="entity-form" loading={isSaving}>Salva</Button>
      </>
    }
  >
    <EntityForm formId="entity-form" mode={mode} data={data} onSuccess={onSuccess} onSavingChange={setIsSaving} />
  </DrawerLayout>
</SystemDrawer>
```

Il bottone submit è nel footer del DrawerLayout, collegato al form via attributo `form="entity-form"`. Il form notifica lo stato di salvataggio via callback `onSavingChange`.

### 7.3 Pattern Navigazione (Sidebar)

```
Gruppi sidebar:
─────────────────
(senza titolo)
  └── Panoramica

Operatività
  ├── Sedi
  └── Programmazione

Contenuti
  ├── Cataloghi
  ├── Prodotti
  ├── Contenuti in evidenza
  └── Stili

Insight
  ├── Analitiche
  └── Recensioni

Sistema
  ├── Team
  └── Impostazioni
```

---

## 8. Pagine e Logica

### 8.1 Products (`src/pages/Dashboard/Products/`)

**Products.tsx** — Lista prodotti
- Carica `listBaseProductsWithVariants(tenantId)` con metadata (formatsCount, configurationsCount, catalogsCount, fromPrice)
- Tabs: prodotti | gruppi | attributi
- DataTable con righe espandibili per mostrare varianti
- Azioni: crea, modifica, elimina, duplica
- Density: compact / extended
- Search + filtri

**ProductPage.tsx** — Dettaglio prodotto
- Tabs:
  - **Generale** (GeneralTab): nome, descrizione, immagine (upload + compress)
  - **Prezzi** (PricingTab): `base_price` + gruppi opzione `PRIMARY_PRICE`
  - **Varianti** (VariantsTab): lista varianti figli, crea variante, MatrixConfigDrawer (solo per parent)
  - **Configurazioni** (ConfigTab): gruppi opzione `ADDON` (obbligatorietà, max selezioni, valori con prezzi delta)
  - **Attributi** (AttributesTab): assegnazione valori attributi (piattaforma + tenant)
  - **Utilizzo**: in quali cataloghi il prodotto è presente

**MatrixConfigDrawer.tsx** — Configurazione matrice varianti
- Gestisce `product_variant_dimensions` e `product_variant_dimension_values`
- Preview delle combinazioni generate
- Funzione `generateMissingVariants()` crea prodotti figli mancanti

**Struttura file:**
```
Products/
├── Products.tsx                 # Lista + tabs (prodotti|gruppi|attributi)
├── ProductPage.tsx              # Dettaglio con tabs
├── ProductCreateEditDrawer.tsx  # Drawer crea/modifica
├── ProductDeleteDrawer.tsx      # Drawer conferma eliminazione
├── ProductAttributesDrawer.tsx  # Drawer assegnazione attributi
├── ProductsAttributesTab.tsx    # Tab attributi nella lista
├── ConfigTab.tsx                # Tab configurazioni (ADDON)
├── PricingTab.tsx               # Tab prezzi (PRIMARY_PRICE)
├── VariantsTab.tsx              # Tab varianti
├── AttributesTab.tsx            # Tab attributi in dettaglio
├── MatrixConfigDrawer.tsx       # Drawer matrice varianti
└── components/
    └── ProductForm.tsx          # Form riutilizzabile
```

### 8.2 CatalogEngine (`src/pages/Dashboard/Catalogs/`)

**CatalogEngine.tsx** — Editor catalogo
- Vista split: albero categorie (sinistra) + prodotti nella categoria selezionata (destra)
- Drag-drop reordering categorie (@dnd-kit)
- Categorie fino a 3 livelli (parent_category_id)
- Associazione prodotti via ProductPickerDrawer
- Supporto selezione varianti: quando un prodotto ha varianti, l'utente sceglie quale variante associare al catalogo
- `ConfigIntent`: `"associate"` (aggiunge al catalogo) | `"configure"` (modifica link prodotto-categoria)

### 8.3 Programming (`src/pages/Dashboard/Programming/`)

**Programming.tsx** — Lista regole
- Filtri per `rule_type` (layout, price, visibility)
- Search
- Pannello simulazione: testa regole a data/ora/attività specifica
- Insight system: rileva conflitti tra regole, override, regole inutilizzate
- Toggle enabled/disabled per regola

**ProgrammingRuleDetail.tsx** — Dettaglio/creazione regola
- Sezioni:
  - **SchedulingSection**: time_mode, days_of_week, time_from/to, start_at/end_at
  - **PrioritySection**: range 1-10
  - **AssociatedContentSection**: payload specifico per tipo regola
    - Layout: scelta stile + catalogo
    - Price: override prezzi per prodotto/opzione
    - Visibility: override visibilità per prodotto

### 8.4 Highlights (`src/pages/Dashboard/Highlights/`)

**ProductsManagerCard.tsx** — Gestione prodotti in evidenza
- Lista prodotti drag-drop sortabile
- ProductPickerList per aggiunta
- Campo nota per prodotto
- Save/cancel con change tracking

### 8.5 Styles (`src/pages/Dashboard/Styles/`)

**StylePreview.tsx** — Anteprima stile
- Rendering preview del catalogo con token stile applicati
- Token mappati a CSS custom properties

### 8.6 Attributes (`src/pages/Dashboard/Attributes/`)

- **AttributeCreateEditDrawer**: CRUD definizioni attributo
- **AttributeDeleteDrawer**: conferma eliminazione
- Supporto attributi piattaforma (tenant_id = NULL) vs tenant-specific

### 8.7 Public Collection (`src/pages/PublicCollectionPage/`)

**PublicCollectionPage.tsx** — Vista pubblica catalogo
- Risolve business da slug URL
- Schedule resolver determina layout attivo
- Rendering via CollectionView
- Nessuna autenticazione richiesta

**CollectionView.tsx** — Hero + sezioni categoria
- CardTemplate: no-image, compact, detailed
- CardLayout: list, grid
- Stile applicato via CSS variables da token

**ItemDetail.tsx** — Modal dettaglio prodotto pubblico
- Mostra varianti, attributi, addons
- Prezzi formattati
- Immagine prodotto

---

## 9. Integrazioni Esterne

### 9.1 Supabase

**Moduli utilizzati:**
- **Auth**: login email/password, OTP, password recovery, session management
- **Database (PostgreSQL)**: 34 tabelle con RLS, functions, triggers, views
- **Storage**: upload immagini (prodotti, logo tenant, media attività)
- **Edge Functions (Deno)**: 15 funzioni serverless
- **Realtime**: non utilizzato esplicitamente nel codice frontend

**Edge Functions:**
| Funzione | Scopo |
|---|---|
| `send-otp` | Invio codice OTP via email |
| `verify-otp` | Verifica codice OTP |
| `status-otp` | Stato verifica OTP sessione |
| `generate-menu-pdf` | Generazione PDF catalogo via Puppeteer |
| `menu-ai-import` | Import menu via AI (parsing testo) |
| `send-tenant-invite` | Invio invito team |
| `delete-account` | Soft-delete account utente |
| `recover-account` | Recupero account eliminato |
| `purge-accounts` | Eliminazione definitiva account |
| `delete-tenant` | Soft-delete tenant |
| `restore-tenant` | Ripristino tenant eliminato |
| `purge-tenant-now` | Eliminazione definitiva tenant |
| `delete-business` | Eliminazione business |

**Configurazione**: `supabase/config.toml` — tutte le funzioni con `verify_jwt = false`.

### 9.2 Resend (via Edge Functions)

Utilizzato per invio email (OTP, inviti team). Integrato nelle Edge Functions, non direttamente nel frontend.

### 9.3 Puppeteer

Utilizzato nella Edge Function `generate-menu-pdf` per generare PDF dei cataloghi server-side.

---

## 10. Pattern Architetturali

### 10.1 Service Layer Pattern
Ogni dominio ha un file service dedicato in `src/services/supabase/`. I componenti React NON chiamano mai Supabase direttamente.

```
Componente → Service Function → Supabase Client → PostgreSQL (RLS)
```

**Convenzione nomi:**
- `list*(tenantId)` → GET multipli
- `get*(id, tenantId)` → GET singolo
- `create*(tenantId, data)` → INSERT
- `update*(id, tenantId, data)` → UPDATE
- `delete*(id, tenantId)` → DELETE

### 10.2 Page-Level State Pattern

Tutte le pagine seguono lo stesso pattern:
```tsx
const [items, setItems] = useState<Entity[]>([]);
const [isLoading, setIsLoading] = useState(true);

const loadData = useCallback(async () => {
  try {
    setIsLoading(true);
    const data = await listEntities(tenantId);
    setItems(data);
  } catch {
    showToast({ message: "Errore", type: "error" });
  } finally {
    setIsLoading(false);
  }
}, [tenantId, showToast]);

useEffect(() => { loadData(); }, [loadData]);
```

### 10.3 Drawer-Based Editing
Tutte le operazioni CRUD usano drawer laterali, mai modali centrate. Il pattern è:
1. `SystemDrawer` (primitiva)
2. `DrawerLayout` (struttura)
3. `EntityDrawer` (dominio) contiene `EntityForm` collegato via `form` attribute

### 10.4 Multi-Tenant Isolation
- RLS su tutte le tabelle tenant-scoped
- `get_my_tenant_ids()` → SECURITY DEFINER function che ritorna gli ID tenant dell'utente
- `tenant_id` sempre passato esplicitamente, mai derivato da auth
- UI usa `useTenantId()` o `useTenant().selectedTenantId`

### 10.5 Immutable Style Versioning
Gli stili usano un pattern di versioning immutabile:
- `styles` → punta a `current_version_id`
- `style_versions` → immutabili, ogni modifica crea una nuova versione
- I cataloghi referenziano `active_style_version_id` (non lo stile direttamente)

### 10.6 Schedule Resolution
Le regole di scheduling vengono risolte runtime:
1. Filtra regole abilitate
2. Filtra per target (attività specifica o applyToAll)
3. Filtra per finestra temporale (giorno + ora)
4. Ordina per priorità
5. La regola con priorità più alta vince

### 10.7 Form-Drawer Decoupling
I form sono componenti separati dai drawer:
- `ProductForm` è riutilizzabile indipendentemente dal drawer
- Comunicazione form → drawer via callbacks (`onSuccess`, `onSavingChange`)
- Submit via attributo `form` HTML (bottone nel footer del drawer, form nel body)

### 10.8 Error Handling
```ts
const { data, error } = await supabase.from("table").select("*").eq("tenant_id", tenantId);
if (error) {
  if (error.code === "PGRST116") throw new Error("Not found");
  if (error.code === "23503") throw new Error("Cannot delete — referenced by another record");
  if (error.code === "23505") throw new Error("Duplicate");
  throw error;
}
```

---

## 11. Convenzioni e Regole

### 11.1 Naming

- **Tabelle DB**: prefisso `v2_` nelle migrazioni DDL, ma le **query nei service usano nomi SENZA prefisso** (`products`, non `v2_products`)
- **Tipi TypeScript**: prefisso `V2` (es. `V2Product`, `V2Tenant`)
- **Service functions**: `verb` + `Entity` (es. `listBaseProductsWithVariants`, `getProduct`, `createProduct`)
- **SCSS**: moduli `.module.scss` per scoping
- **Import alias**: `@/` → `src/`, `@components/`, `@pages/`, `@context/`, `@services/`, `@types/`, `@utils/`, `@layouts/`, `@styles/`

### 11.2 TypeScript

- **Strict mode**: nessun `any` permesso
- **noUnusedLocals + noUnusedParameters**: attivi
- **Module resolution**: `bundler` (ottimizzato per Vite)

### 11.3 UI/UX

- **Lingua**: italiano (tutte le label, messaggi, toast)
- **Nessun top navbar**: solo sidebar laterale
- **Editing**: sempre drawer laterali, mai modali centrate
- **Toast**: `useToast().showToast({ message, type: "success" | "error" | "info" | "warning" })`
- **Terminologia**:
  - Tenant → "Azienda" / "Brand"
  - Activity → "Sede" / "Attività"
  - `owner_user_id` → mai esposto in UI

### 11.4 Sicurezza

- RLS su tutte le tabelle tenant-scoped
- `tenant_id` sempre validato in ogni operazione
- Nessun `service_role` key nel frontend
- Migrazioni: mai modificare file esistenti, sempre creare nuovi
- `schedule_targets` ha un gap di sicurezza noto (no RLS, no tenant_id)

### 11.5 Architettura

- Cercare sempre implementazioni esistenti prima di creare nuove
- Seguire i pattern esistenti per dominio
- Preferire consistenza all'innovazione
- Cambiamenti minimi e focalizzati
- Non refactorizzare aree ampie senza richiesta esplicita

---

## Appendice: Stato Attuale e Gap Noti

| Area | Stato | Note |
|---|---|---|
| Prodotti CRUD | Completo | Include varianti, opzioni, attributi |
| Cataloghi + Engine | Completo | Categorie 3 livelli, drag-drop, variant selection |
| Scheduling | Completo | Layout, price, visibility rules con simulazione |
| Stili | Completo | Versioning immutabile, token CSS |
| Contenuti Evidenza | Completo | Drag-drop prodotti, note |
| Vista Pubblica | Completo | Schedule resolution, template cards |
| PDF Generation | Completo | Via Puppeteer Edge Function |
| Analytics | Non implementato | Pagina esiste, nessun dato |
| Recensioni | Non implementato | Pagina esiste, nessun dato |
| Caching pubblico | Non implementato | Nessun caching sulla vista pubblica |
| `schedule_targets` RLS | Gap sicurezza | No tenant_id, no RLS |
| AI Menu Import | Parziale | Edge Function esiste, integrazione UI limitata |
