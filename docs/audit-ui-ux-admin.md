# Audit UI/UX — Pannello admin CataloGlobe

**Fase 1 — sola mappatura.** Nessuna proposta di redesign, nessuna modifica al codice.
Branch `staging`, letto il 11/09/2026. Perimetro: `/business/:businessId/*`, `/workspace/*`, `/business/:businessId/setup`, `/admin/*`.
Fonte: 912 file `.ts`/`.tsx`, 125 `.module.scss` nel perimetro admin (~24.000 righe SCSS).

Ogni sezione è divisa in **FATTI** (cosa c'è) e **OSSERVAZIONI** (cosa si nota, con la prova).
Le osservazioni sono numerate (`N1`, `C1`, `P1`, `T1`) per poterle richiamare nella fase 2.

> **Nota sul metodo.** L'audit è fatto sul codice, non sull'app in esecuzione: `staging.cataloglobe.com` è dietro Vercel Deployment Protection e non è stato raggiungibile in questa sessione. Tutto ciò che segue è verificato su file e riga. Le osservazioni che richiedono l'occhio (densità, gerarchia visiva, ritmo di scorrimento) non sono in questo documento e vanno aggiunte con una passata dal vivo.

---

# 1. Mappa della navigazione

## 1.1 FATTI — Le tre gerarchie

L'admin ha **tre livelli annidati**, con due layout e due sistemi di permessi separati:

| Livello | Oggetto DB | Nome in UI | Layout | Route | Provider |
|---|---|---|---|---|---|
| Account | `auth.users` | *Workspace* | `WorkspaceLayout` | `/workspace/*` | nessuno (usa `workspaceRole.ts`) |
| Azienda | `tenants` | *Azienda* / *Attività* / *Tenant* | `MainLayout` | `/business/:businessId/*` | `TenantProvider` + `PermissionsProvider` |
| Sede | `activities` | *Sede* / *Attività* | `MainLayout` | `/business/:businessId/locations/:activityId` | idem |

Il passaggio fra azienda e azienda avviene da `HeaderTenantSwitcher` in navbar; fra sede e sede da `SedeScopeSelect`, anch'esso in navbar, ma **solo su 5 route** (`SEDE_NAVBAR_ROUTES` in `navbarBreadcrumbRoutes.ts:32-38`): Ordini, Prenotazioni, Programmazione, Recensioni, Analitiche.

Esistono inoltre due layout fuori da questa gerarchia:
- `AdminLayout` (`/admin/*`) — area di piattaforma, cross-tenant, gate `is_platform_admin()` (`AdminRoute.tsx`);
- `SetupWizardPage` (`/business/:businessId/setup`) — a schermo pieno, **senza sidebar, senza AppHeader, senza PageHeaderSlot**.

## 1.2 FATTI — Sidebar workspace

`WorkspaceSidebar.tsx:7-18` — 3 voci, **nessun gating**:

| Voce | Route | Contenuto |
|---|---|---|
| Attività | `/workspace` | Griglia delle aziende + inviti pendenti + sezione "Attività in eliminazione" |
| Abbonamento | `/workspace/billing` | Lista sola lettura di una riga per azienda, che linka a `/business/:id/subscription` |
| Impostazioni | `/workspace/settings` | Profilo utente, password, logout, eliminazione account |

## 1.3 FATTI — Sidebar business

`Sidebar.tsx:84-190` — 5 gruppi, 18 voci. **I titoli dei gruppi non sono renderizzati a schermo**: il markup (`Sidebar.tsx:270-283`) li usa solo come `aria-label` di `role="group"`, visivamente separati da un `groupDivider`.

| Gruppo | Voce | Route | Tab | Permesso sidebar | Piano |
|---|---|---|---|---|---|
| — | **Panoramica** | `/overview` | — | nessuno | — |
| Operatività | **Sedi** | `/locations` | 2 (`Sedi`, `Gruppi di sedi`) — solo se >1 sede | `activity.read` (any) | — |
| Operatività | └ dettaglio sede | `/locations/:activityId` | **7** | nessun gate di pagina | — |
| Operatività | **Ordini** | `/orders` | 3 (`Comande`, `Tavoli`, `Storico`) | `orders.read` (any) | `table_ordering` |
| Operatività | **Prenotazioni** | `/reservations` | 2 (`Da gestire`, `Agenda`) | `reservations.read` (any) | `table_reservation` |
| Operatività | **Programmazione** | `/scheduling` | **5** (`Layout`, `In evidenza`, `Prezzi`, `Disponibilità`, `Tutte`) | `scheduling.read` (any) | — |
| Operatività | └ dettaglio regola | `/scheduling/:ruleId` | — | — | — |
| Operatività | └ dettaglio regola featured | `/scheduling/featured/:ruleId` | — | — | — |
| Contenuti | **Menù** (`catalogLabel`) | `/catalogs` | — | `catalogs.read` (tenant) | — |
| Contenuti | └ catalog engine | `/catalogs/:id` | 2 (`Prodotti`, `Traduzioni`) | **nessuno** | — |
| Contenuti | **Prodotti** | `/products` | fino a 4 (`Prodotti`, `Gruppi Prodotti`, `Attributi`, `Ingredienti`) | `products.read` (tenant) | — |
| Contenuti | └ pagina prodotto | `/products/:productId` | 5 (`Scheda`, `Prezzi & Opzioni`, `Attributi`, `Traduzioni`, `Utilizzo`) | **nessuno** | — |
| Contenuti | **Contenuti in evidenza** | `/featured` | — | `featured.read` (any) | — |
| Contenuti | └ dettaglio | `/featured/:featuredId` | 2 (`Informazioni`, `Prodotti inclusi`) | sì | — |
| Contenuti | **Storie** | `/stories` | 2 (`Storie`, `Storia del brand`) | `stories.read` (any) | — |
| Contenuti | └ dettaglio storia | `/stories/:storyId` | — | sì | — |
| Contenuti | **Stili** | `/styles` | — | `styles.read` (tenant) | — |
| Contenuti | └ editor stile | `/styles/:styleId` | — (6 sezioni nel pannello) | **nessuno** | — |
| Contenuti | **Lingue** | `/languages` | — | `catalogs.read` *(proxy)* | — |
| Insight | **Analitiche** | `/analytics` | — (3 sezioni in scroll) | `analytics.read` (any) | sezioni per piano |
| Insight | **Recensioni** | `/reviews` | — | `reviews.read` (any) | — |
| Insight | **Clienti** | `/guests` | — | `guests.read` (any) | `table_reservation` |
| Sistema | **Team** | `/team` | 2 (`Membri`, `Inviti in attesa`) | `team.read` (tenant) | — |
| Sistema | **Abbonamento** | `/subscription` | — | `billing.read` (tenant) | — |
| Sistema | **Impostazioni** | `/settings` | — | **nessuno** | — |
| Sistema | **Assistenza** | `/support` | — | `support.read` (tenant) | — |
| Sistema | └ dettaglio ticket | `/support/:ticketId` | — | sì | — |

### Le 7 tab del dettaglio sede
`ActivityDetailPage.tsx:48-56` — in URL via `?tab=`, default `profile`:
`Profilo` · `Orari` · `Sala` · `Disponibilità` · `Ordinazioni` · `Prenotazioni` · `Impostazioni`.
Rimappatura legacy (`:59-65`): `info`/`media` → `profile`, `hours-services`/`access-control` → `settings`, `tables` → `sala`.

### Cosa c'è dentro le pagine più cariche

**Panoramica** (`OverviewPage.tsx`, 1073 righe) — 5 blocchi:
1. header azienda (logo, nome, badge verticale, "N sedi • N prodotti • N menù");
2. checklist di configurazione a 4 passi (solo owner/admin, solo se incompleta) + eventuale card "Configura con la procedura guidata";
3. pagine pubbliche con QR (solo se il setup è completo);
4. "Statistiche rapide" — 5 StatCard (`Sedi`, `Prodotti`, `Menù`, `Programmi`, `Contenuti in evidenza`);
5. "Azioni rapide" — 4 bottoni.

**Dettaglio sede** (`ActivityDetailPage` + 7 tab, ~4.000 righe complessive) — la pagina più densa del pannello: la tab `Profilo` ha 5 card e 4 drawer, `Prenotazioni` ha 889 righe con un accordion a 5 decisioni, `Impostazioni` ha URL pubblico, QR, export PDF, stato pubblicazione e zona distruttiva.

**Catalog engine** (`CatalogEngine.tsx`, 2387 righe) — split layout: albero categorie L1–L3 con drag&drop a sinistra, tabella prodotti della categoria selezionata a destra, 5 `SystemDrawer` inline, barra "modifiche non salvate".

**Programmazione** (`Programming.tsx`, 1787 righe) — 5 tab per `rule_type`, 2 viste (lista/calendario), 5 gruppi di stato nella lista (`In esecuzione`, `Programmate`, `Bozze`, `Disabilitate`, `Scadute`), simulatore in drawer con timeline a 48 slot, modale di aiuto con 5 contenuti.

## 1.4 FATTI — Pagine raggiungibili ma non in sidebar

| Route | Cosa è | Come si arriva |
|---|---|---|
| `/business/:businessId/setup` | Wizard guidato a 3 step (sede → menù → pubblicazione) | solo dalla card in Panoramica, solo owner/admin, solo se 0 sedi |
| `/business/:businessId/attributes` | `<Navigate to="../products?tab=attributes" replace />` | URL diretta |
| `/admin/*` | Area di piattaforma | voce "Area admin" nel menu utente |
| `/select-business` | `<Navigate to="/workspace" replace />` | URL legacy |
| `/onboarding/create-business` | `<Navigate to="/workspace" replace />`, marcato `@deprecated` | URL legacy |

## 1.5 FATTI — Domini senza pagina, cartelle senza route

- `src/pages/Dashboard/Attributes/` — contiene **solo 2 drawer**, nessun componente pagina. Il dominio vive come tab di Prodotti.
- `src/pages/Dashboard/Tables/` — contiene **solo 4 drawer**. La UI dei tavoli (4.122 righe) è in `src/components/Tables/` e appare come tab `Sala` della sede e tab `Tavoli` di Ordini.
- `src/pages/Dashboard/Settings/` — contiene **solo** `DeleteAccountDrawer.tsx`, consumato da `WorkspaceSettingsPage`.
- `src/pages/Operativita/` — contiene **una sola pagina** (il dettaglio sede). "Operatività" è solo un titolo di gruppo di sidebar, non una route.
- `src/pages/Onboarding/SelectBusiness.tsx` — 104 righe, **non montato in nessuna route**.
- `/admin/tenant` e `/admin/lead` — voci di sidebar `disabled: true`, nessuna route corrispondente.

Le pagine a livello azienda stanno in `src/pages/Business/` (`OverviewPage`, `TeamPage`, `SubscriptionPage`, `BusinessSettingsPage`, `SettingsLanguages`), mentre `src/pages/Dashboard/Businesses/` contiene **solo** la lista sedi. `CLAUDE.md` colloca queste aree altrove: la documentazione di progetto è disallineata dal codice.

## 1.6 FATTI — Dove vive il titolo di pagina

`PageHeaderSlot.tsx:17-19` dichiara: *"Il titolo/sottotitolo passati via `usePageHeader` vengono ignorati (vivono nel NavbarBreadcrumb post-refactor)"*. Il componente rende solo `leading` (sinistra) e `actions` (destra), e ritorna `null` se mancano entrambi (`:47`). `PageHeaderContext.tsx:162-168` marca `title`, `subtitle` e `titleAddon` come *"legacy — ignorato"*.

Il titolo visibile viene quindi da **tre mappe indipendenti**:

| Fonte | File | Serve a |
|---|---|---|
| `Sidebar` | `Sidebar.tsx:84-190` | voce di menu |
| `ROUTE_LABELS` | `navbarBreadcrumbRoutes.ts:49-65` | breadcrumb in navbar (= il titolo che l'utente legge) |
| `PAGE_TITLES` | `MainLayout.tsx:26-59` | `<title>` della scheda browser |

Il commento in cima a `navbarBreadcrumbRoutes.ts:4-6` registra il debito: *"NON sostituisce `PAGE_TITLES` in MainLayout … finché il cleanup finale del refactor non le unifica"*.

## OSSERVAZIONI — struttura e navigazione

**N1 — Il titolo di pagina dichiarato da 18 pagine non arriva mai all'utente.**
`usePageHeader` è chiamato da 32 pagine; 18 passano `title`, 14 passano anche un `subtitle` redatto. Nessuno dei due viene renderizzato (`PageHeaderSlot.tsx`, nessun riferimento a `title`/`subtitle`). Esempi di testi di orientamento scritti, manutenuti e invisibili: `"Gestisci l'albero delle categorie e i gruppi del tuo menù."` (`Catalogs.tsx:237`), `"Personalizza l'aspetto visivo e i colori del tuo catalogo."` (`Styles.tsx:207`), `"Seleziona un'attività per accedere alla sua dashboard"` (`WorkspacePage.tsx:66`), `"Gestisci i contenuti editoriali e aggregatori di prodotti."` (`Highlights.tsx:140`).

**N2 — Tre pagine non hanno alcun titolo visibile, in nessun punto della UI.**
`ROUTE_LABELS` non copre `stories`, `guests`, `support`: `resolveBusinessRoute` ritorna `key: null` e `NavbarBreadcrumb` rende `[]`. Le stesse tre non sono in `PAGE_TITLES`, quindi nemmeno la scheda del browser ha un nome. Su `/guests` l'unica etichetta esistente è la voce di sidebar `"Clienti"`.

**N3 — `PAGE_TITLES` e `ROUTE_LABELS` divergono anche dove coesistono.**
`analytics` → breadcrumb `"Analitiche"`, `<title>` `"Analytics"`. `featured` → `"Contenuti in evidenza"` vs `"In Evidenza"`. `catalogs` → sidebar `"Menù"`, breadcrumb `"Cataloghi"`, `<title>` `"Cataloghi"`: la scheda del browser dice "Cataloghi" mentre tutta la UI dice "Menù". Mancano da `PAGE_TITLES`: `orders`, `reservations`, `languages`, `guests`, `stories`, `support`.

**N4 — Su `/workspace` e `/workspace/billing` la banda contestuale è `null`.**
Entrambe passano solo `title`/`subtitle`, e `PageHeaderSlot.tsx:47` ritorna `null` senza `leading` né `actions`. Sono due pagine senza intestazione in-page.

**N5 — I titoli dei gruppi di sidebar esistono solo per gli screen reader.**
`Operatività`, `Contenuti`, `Insight`, `Sistema` e le loro icone sono costruiti in `buildGroups` ma il markup li usa solo come `aria-label`. Un utente vedente vede 18 voci separate da tre righe, senza sapere che i gruppi hanno un nome — e sono proprio quei nomi a spiegare perché "Clienti" sta accanto a "Analitiche".

**N6 — "Impostazioni" è l'unica voce di sidebar senza gating, e porta a un muro.**
`Sidebar.tsx:169-174` non dichiara `permission`. Manager, staff e viewer la vedono, cliccano, e trovano `"Non hai accesso alle impostazioni"` (`BusinessSettingsPage.tsx:124`). Ogni altra voce del gruppo "Sistema" è nascosta quando il permesso manca.

**N7 — "Impostazioni" significa due cose diverse con la stessa etichetta e la stessa icona.**
Workspace → profilo utente, password, eliminazione account. Business → nome azienda, logo, eliminazione azienda. E dal workspace la card azienda offre una terza voce, `"Impostazioni attività"` (`BusinessCard.tsx:77`), che salta nella seconda.

**N8 — L'abbonamento si gestisce in due posti con due nomi.**
`/workspace/billing` ha `title: "Abbonamenti"` ed è di sola lettura (non lo dichiara); `/business/:id/subscription` ha `title: "Abbonamento"`. La voce di sidebar è `"Abbonamento"` in entrambi i contesti.

**N9 — Quattro pagine di dettaglio non hanno alcun gate di permesso o abbonamento.**
`CatalogEngine.tsx`, `ProductPage.tsx`, `StyleEditorPage.tsx` e le 7 tab di `ActivityDetailPage` non contengono `PageGate`, `canDoOn*` né `useSubscriptionGuard` (zero match). Le liste corrispondenti li hanno tutti. In `CatalogEngine` ogni azione distruttiva (elimina categoria, rimuovi prodotto, salva riordino) è offerta a chiunque raggiunga l'URL; in `ActivitySettingsTab.tsx:428-436` il bottone "Elimina" della sede non è dietro `canWrite`, mentre i controlli di pubblicazione lo sono.

**N10 — Il Setup guidato non ha gate di permesso.**
`SetupWizardPage.tsx:104-146` guarda solo se il tenant ha già una sede. Su un tenant a zero sedi, qualunque ruolo che digiti l'URL entra in un percorso che crea sede + catalogo + regola. Confronta con `Businesses.tsx:74-76`, dove la creazione sede è dietro `activities.create`.

**N11 — Le tab non hanno una politica uniforme fra URL e state.**
In URL: dettaglio sede, lista sedi, Ordini, Prenotazioni, pagina prodotto, dettaglio featured, Programmazione (`?type=`). Solo in state, non condivisibili né recuperabili col back: Team, Prodotti (lista), Storie, Catalog engine. Nel Catalog engine è in URL la *selezione di categoria* (`?categoryId=`) e non la tab: l'esatto contrario del resto dell'app.

**N12 — Anche il `viewMode` ha tre politiche.**
Programmazione lista/calendario: solo state, perso al reload. Sei toggle griglia/lista: `localStorage`, con **6 chiavi e 4 convenzioni di naming** (`businesses_view_mode`, `products_view_mode`, `guests_view_mode`, `cataloglobe_catalogs_view_mode`, `cataloglobe-styles-view-mode`, `featuredContents_viewMode`), e la logica di lettura/scrittura riscritta in ognuna delle sei pagine.

**N13 — La tab "Gruppi di sedi" appare e sparisce in base al numero di sedi.**
`Businesses.tsx:261`: con una sola sede la tab bar non viene renderizzata, ma `?tab=groups` viene comunque letto e la sezione gruppi renderizzata, con la CTA "Nuovo gruppo" attiva e nessun modo di tornare indietro dalla UI.

**N14 — La pagina Prodotti impila quattro domini di natura diversa nelle stesse tab.**
`Prodotti` (istanze) · `Gruppi Prodotti` (tassonomia) · `Attributi` (definizioni di schema) · `Ingredienti` (vocabolario condiviso). Cambiano insieme entità, CTA (`Crea prodotto` / `Crea gruppo` / `Nuovo attributo` / `Crea ingrediente`) e perfino il meccanismo di apertura del drawer (booleano per le prime due, contatore-trigger per le altre due). Inoltre la ricerca sta nell'header su tre tab e nel corpo sulla quarta (`ProductsAttributesTab` monta la propria `FilterBar`), quindi la barra si sposta cambiando tab.

**N15 — Le 7 tab della sede appartengono a tre categorie diverse.**
Identità/anagrafica (`Profilo`, `Orari`, `Impostazioni`) · interruttori di canale con prerequisiti (`Ordinazioni`, `Prenotazioni`) · mappatura risorse (`Sala`) · operatività quotidiana in realtime (`Disponibilità`). Il commento in cima al file lo dichiara aperto: *"`availability` … la sua destinazione è ancora aperta"* (`ActivityDetailPage.tsx:28-29`).

**N16 — Le due tab del Catalog engine non sono due viste dello stesso oggetto.**
`Prodotti` mostra i figli della categoria selezionata; `Traduzioni` mostra le traduzioni del **nome** della categoria (`fieldKey="name"`). Il bottone "+ Aggiungi prodotto" sparisce quando la seconda è attiva.

**N17 — "Disponibilità" è il nome di tre cose diverse in tre posti.**
Un tipo di regola in Programmazione (programmata, 2 stati: `Nascondi` / `Non disp.`), una tab della sede (manuale, realtime, 3 stati: `Visibile` / `Nascosto` / `Non disponibile`), e una colonna dentro il drawer di visibilità. Nulla in UI dice quale prevalga sull'altra; l'unico accenno è una nota dentro una modale opzionale (`RuleTypeHelpModal.tsx:250`).

**N18 — Ordini nega "Tutte le sedi" senza dirlo.**
`orders` è l'unico membro di `SEDE_SINGLE_SITE_ROUTES`. La stessa navbar offre "Tutte le sedi" su Prenotazioni, Programmazione, Recensioni e Analitiche; qui l'opzione sparisce e l'empty state dice solo `"Seleziona una sede"`. La scelta è persistita in `localStorage` **globale, non per tenant** (`useSedeScope.ts:11-14`).

**N19 — Le due tab di Prenotazioni hanno requisiti di scope incompatibili.**
`Da gestire` funziona con scope "tutte le sedi"; `Agenda` blocca con `"Scegli una sede"`. Cambiando tab con lo scope su "tutte", la pagina passa da una lista popolata a un empty state senza che la tab lo segnali.

**N20 — La tab "Tavoli" di Ordini è l'unica delle tre senza stato di fallback.**
`Orders.tsx:1023-1028` rende `TablesLiveView` solo se sede risolta, senza `else`. Senza sede la tab è una pagina bianca; le altre due hanno entrambe `"Seleziona una sede"`.

**N21 — "Attributi" è un dominio con una route che punta a una tab che nel verticale attivo non esiste.**
`/attributes` reindirizza a `../products?tab=attributes`, ma per `food_beverage` (default e unico macro attivo) `customAttributes: false` e `useFilteredProductTabs` rimuove silenziosamente il parametro, atterrando su "Prodotti". `PAGE_TITLES` contiene comunque ancora `attributes: 'Attributi'`.

**N22 — L'editor Stili esce dallo scaffolding di pagina.**
È l'unica pagina admin che non chiama `usePageHeader` (quindi nessuna banda contestuale), sostituisce lo scroll di pagina con `document.body.style.overflow = "hidden"` (`:82-96`), e mette Salva/Annulla in un footer sticky dentro il pannello laterale. Le altre due pagine di editing di pari livello (`ProductPage`, `StoryDetailPage`) mettono la stessa coppia di azioni nell'header, via `HeaderSaveAction`.

**N23 — Tre punti d'ingresso concorrenti alla creazione di un'azienda, due dei quali morti.**
`/onboarding/create-business` è un redirect deprecato; `SelectBusiness.tsx` non è montato; il flusso reale è il drawer `CreateBusinessWizard` da `/workspace`. Restano due file che descrivono un onboarding che non esiste più.

**N24 — Il tenant senza abbonamento è rimbalzato al workspace senza spiegazione in pagina.**
`MainLayout.tsx:193-195` redirige a `/workspace?resume=...` se manca `stripe_subscription_id`; `:206-213` redirige a `/subscription` se lo stato è `canceled`. L'unico indizio testuale è la pill "Da attivare" sulla card.

**N25 — Un drawer viene aperto con un evento globale del browser.**
`Businesses.tsx:324`: `window.dispatchEvent(new CustomEvent("open-group-drawer"))`, ascoltato in `ActivityGroupsSection.tsx:197`. È l'unico caso in tutto il pannello: ogni altro drawer passa da props.

**N26 — Nella stessa pagina convivono due fonti di verità sul ruolo.**
`Businesses.tsx` importa `workspaceRoleIsOwner`/`IsAdmin` (utility dichiarata per lo scope workspace *"dove non c'è PermissionsProvider"*) e li usa per il copy dei limiti, a tre righe da `canDoOnTenant`, dentro `PermissionsProvider`.

**N27 — Tre pagine leggono Supabase direttamente dal componente.**
`OverviewPage.tsx:499-503` (5 query in parallelo), `WorkspacePage.tsx`, `WorkspaceSettingsPage.tsx`. `CLAUDE.md` lo vieta esplicitamente; tutte le altre pagine passano dal service layer.

---

# 2. Mappa dei componenti ricorrenti

## 2.1 FATTI — Inventario, per numero di file che lo importano

62 cartelle in `src/components/ui/`. I primi per frequenza:

| File | Componente | Varianti principali |
|---|---|---|
| 233 | `Text` | `variant` ×10, `weight` ×4, `colorVariant` ×9 |
| 143 | `Button` + `IconButton` + `SplitButton` | `variant` ×6, `size` ×3 |
| 81 | famiglia `Input/*` | 67 `TextInput`, 10 `SearchInput`, 6 `NumberInput`, … |
| 39 | `EmptyState` | `variant` default/inline, `compact` |
| 32 | `DataTable` (+ `SortableDataTableRow`) | `selectable`, `onBulkDelete`, `rowWrapper`, `pageSize`… |
| 30 | `Select` | |
| 27 | `Skeleton` | statica o wrapper |
| 26 | `TableRowActions` / `SegmentedControl` | |
| 23 | `Switch` | |
| 21 | `Badge` | 5 varianti + `color` libero |
| 17 | `InlineBanner` | error/warning/info (**no success**) |
| 14 | `Tooltip` (11) + `InfoTooltip` (3) · `Tabs` · `StatusBadge` · `ConfirmDialog` | |
| 13 | `ToolbarSearch` · `FramedMedia` | |
| 10 | `ModalLayout` | |
| 8 | `Card` | radius 12px, padding 1.5rem, hover lift |
| 6 | `SectionCard` · `LoadingState` · `Loader` | SectionCard: radius 10px, no hover |
| 3 | `UnsavedChangesBar` | |
| 1 | `FilterBar` · `SedeScopeSelect` · `CollapsibleSection` · `UnsavedChangesDialog` | |
| **0** | `Drawer` · `Divider` · `RangeInput` · `ColorInput` · `PillGroupSingle` · `TranslationRow` | nessun import in tutto `src` |

Fuori da `ui/`: `SystemDrawer` (73 file) + `DrawerLayout` (71) sono, di fatto, il secondo componente più usato dell'app dopo `Text`/`Button`. `PageGate` è usato da 16 pagine.

## 2.2 FATTI — Aderenza reale dei pattern

**Drawer CRUD.** 84 call-site di `SystemDrawer`. `DrawerProvider` codifica le tre taglie documentate (`sm: 420 / md: 520 / lg: 720`) ma è usato da **un solo componente**: gli altri passano pixel a mano, con **12 larghezze distinte** in uso (400, 420, 480, 500, 520, 560, 640, 680, 720, 900, 920, 960).

**Delete.** 10 delete drawer di dominio + 2 dialog con conferma testuale + 14 `ConfirmDialog`. Nessuno dei 10 richiede di digitare il nome; la digitazione esiste solo per eliminare un'azienda (`confirmName === tenantName`) e un account (`"ELIMINA"`).

**Filtri.** `FilterBar` (search + toggle vista + slot filtri avanzati + slot chip attive) esiste, è completa, e ha **un solo consumatore**. Le altre 13 pagine con ricerca ricostruiscono la stessa combinazione a mano con `ToolbarSearch` + `SegmentedControl` + `compact.persistentIcons`.

**Tabelle.** `DataTable` in 28 file; accanto, 9 griglie di card custom, 5 componenti con `<table>` HTML crudo (4 in Analytics), un kanban custom, una timeline custom, un albero custom.

**Empty state.** `EmptyState` in 39 file; `DataTable` ne ha uno interno con default `"Nessun risultato"`. Oltre a quelli, **17 empty state sono testo nudo con una classe SCSS locale**, senza icona, descrizione né azione.

**Loading.** Dieci approcci distinti coesistono: `LoadingState` (6 file, di cui 5 sono il dominio Supporto), `AppLoader` (route guard, 6 messaggi hardcoded), `Loader` (7 punti), `Skeleton` (27 file, 17 dei quali in Analytics), `<Text colorVariant="muted">Caricamento…</Text>` inline, testo nudo in classe locale, `IconLoader2 className="animate-spin"` (classe Tailwind in un progetto senza Tailwind), `Loader2` + `.miniLoader`, `return null`, e 9 `@keyframes spin` definiti localmente.

**Salvataggio.** Cinque meccaniche: `UnsavedChangesBar` (3 file), `HeaderSaveAction` (3 pagine), footer sticky bespoke (`StyleEditorPage`), submit nel footer del drawer via `form=` (14 file), save-immediato sui toggle. In cinque pagine ne convivono più di una: `ProductPage` ha draft di pagina + drawer che scrivono nel draft + drawer che salvano da sé; `ActivityReservationsTab` ha una `UnsavedChangesBar`, due Switch a save-immediato e un `ConfigAccordionSection` con la propria barra.

**Toast.** 635 call-site: 405 error, 187 success, 29 info, 14 warning.

**Aiuto contestuale.** `InfoTooltip` in 3 file (editor stile ×2, `BusinessCreateCard`); la prop `tooltip` dei campi in altri; l'attributo `title=` nativo in 12 punti — che su touch non compare mai.

## 2.3 FATTI — Token e SCSS

`_theme.scss` definisce **30 custom property**: superficie/testo, brand, skeleton, `--control-height: 38px`, e tre rampe (`warning`, `red`, `green`). **Non esiste nessuna famiglia per spacing, radius, shadow, z-index, tipografia.**

Conseguenza misurata nel perimetro admin (125 file, 23.969 righe):

| Metrica | Valore |
|---|---|
| `px` letterali | **3.986** |
| colori hex letterali | **1.620** |
| `box-shadow` distinti in `src` | **155** |
| `border-radius` distinti in `src/pages` | 16 valori |
| `font-size` distinti in `src/pages` | 25 valori, incluse 5 mezze-pixel (`12.5px` ×17, `14.5px` ×13, `13.5px` ×7, `11.5px` ×7) |
| doppia notazione per la stessa spaziatura | `gap: 8px` ×181 vs `0.5rem` ×54; `12px` ×150 vs `0.75rem` ×32; `16px` ×68 vs `1rem` ×44 |
| `style={{…}}` inline (vietato da CLAUDE.md) | **312**, di cui 23 dentro `src/components/ui` |

Inoltre: **≈125 custom property sono referenziate e mai definite in nessun file**. Le famiglie fantasma più estese sono `--color-*`, `--surface-*`, `--text-*`, `--radius-*`, `--spacing-*`, `--shadow-md`, `--primary`.

## OSSERVAZIONI — componenti e sistema

**C1 — I tre container di sezione in uso simultaneo hanno geometrie diverse.**
`Card` (8 file, tab Sede + Workspace + Team): radius 12px, padding 1.5rem, shadow `0 2px 6px`, hover lift. `SectionCard` (6 file, tab Prodotto + Storie): radius 10px, header 10px/16px, shadow `0 1px 2px`, nessun hover. `ConfigAccordionSection` (Operatività) è un terzo contenitore con la `UnsavedChangesBar` incorporata. Un utente che passa da `/locations/:id` a `/products/:id` vede tre schede-sezione con raggio e ombra diversi.

**C2 — Due componenti `SplitButton` distinti, entrambi vivi, con API e altezza diverse.**
`ui/Button/SplitButton.tsx` (usato dal Catalog engine) hardcoda `#4f46e5` sull'hover e non usa `--control-height`; `ui/SplitButton/SplitButton.tsx` (usato da Prodotti e Programmazione) sì. I bottoni della banda del Catalog engine non condividono né altezza né hover con quelli delle altre due pagine.

**C3 — I delete drawer hanno 5 larghezze, 3 label di conferma e 2 capitalizzazioni.**
Conferma: `"Elimina"` (×4) · `"Conferma Eliminazione"` con E maiuscola (×5) · `"Conferma eliminazione"` minuscola (×1). Header: `"Elimina storia"`/`"Elimina tavolo"`/`"Elimina gruppo"` in sentence case contro `"Elimina Stile"`/`"Elimina Attributo"`/`"Elimina Prodotto"` in Title Case.

**C4 — Sei implementazioni divergenti di `.warningBox`, tre delle quali hanno angoli retti in produzione.**
Gap, padding, radius e palette differiscono in tutti e sei; `CatalogDeleteDrawer` è **rosso** dove gli altri cinque sono ambra, senza nessuna nota che motivi la differenza; e `Products`, `Stories`, `Styles` usano `border-radius: var(--radius-md)` — token che non esiste, quindi la proprietà risolve a vuoto.

**C5 — Due file di delete drawer sono identici per 110 righe su 142.**
I blocchi `.pill*` di `CatalogDeleteDrawer.module.scss` e `StyleDeleteDrawer.module.scss` coincidono valore per valore, e con essi la mappa `{active:"Attiva", scheduled:"Programmata", expired:"Scaduta", disabled:"Disabilitata"}`, duplicata nei due `.tsx`.

**C6 — Cinque wrapper "locked" per lo stesso stato.**
`PageGate.module.scss` e `Reservations.module.scss` sono geometricamente identici; `TeamPage` è uguale senza padding; `Guests` ha solo padding, senza centratura; `Support` solo padding verticale. `PageGate` è adottato da 16 pagine, ma Team, Abbonamento, Impostazioni, Assistenza, Clienti e Prenotazioni lo ricostruiscono a mano.

**C7 — Sette testi diversi per "non hai accesso".**
`"Non hai accesso a questa sezione"` / `"…a questa funzione"` / `"…alle impostazioni"` / `"…alla gestione del team"` / `"…all'abbonamento"` / `"…alla rubrica clienti"` / `"…alle prenotazioni"`. Le descrizioni vanno da una frase generica a tre frasi che spiegano il modello di permessi. Le due pagine che **non** usano `PageGate` (Clienti, Prenotazioni) sono anche le due che raccontano il valore della funzione; le 16 che lo usano ricevono la frase generica `"Disponibile con il piano Pro."`.

**C8 — I titoli degli empty state hanno due grammatiche.**
Frase nominale senza punto nella maggioranza (`"Nessun tavolo"`, `"Nessuna variante"`); frase completa con punto finale nel campo `title` in almeno sei casi, fra cui tre titoli-frase consecutivi nella stessa tab `Utilizzo` del prodotto.

**C9 — Cinque liste su nove non distinguono "vuoto" da "nessun risultato".**
Cataloghi, Prodotti, Contenuti in evidenza, Clienti e Tavoli discriminano i due casi con copy dedicato; Stili e Recensioni mostrano lo stesso testo in entrambi (su Stili l'unica uscita da una ricerca infruttuosa è `"Crea stile"`; su Recensioni un tenant senza nessuna recensione legge `"Prova a modificare i filtri."`).

**C10 — La stessa frase di caricamento esiste in quattro punteggiature.**
`"Caricamento..."` ×12, `"Caricamento in corso..."` ×5, `"Caricamento…"` ×2, `"Caricamento in corso…"` ×1, `"Caricamento in corso"` ×1, `"Caricamento"` ×3. Nello stesso dominio: `"Caricamento stili in corso..."` e `"Caricamento stili…"`.

**C11 — Tre stringhe per lo stesso esito di eliminazione, dentro lo stesso dominio.**
`"Gruppo eliminato con successo."` · `"Gruppo eliminato."` · `"Gruppo eliminato"`. Il punto finale è presente in circa l'85% dei toast e assente nel resto senza criterio, tranne il dominio Tavoli che è interamente senza punto.

**C12 — Il messaggio di gate abbonamento è copiato letteralmente 17 volte.**
`"Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo."` in 9 file, senza nessuna costante condivisa; e in una variante aggiuntiva con l'articolo (`"L'abbonamento non è attivo…"`), con tre code diverse per ruolo.

**C13 — `--brand-primary` ha un valore che nessuno dei 179 hardcode replica.**
Il token vale `#6265f1`; `$brand-primary` in `_variables.scss` vale `#6366f1`; `DESIGN.md` dichiara `#6366f1`. Nei `.module.scss`: `#6366f1` letterale 179 volte, come fallback 166 volte, più `#4f46e5` ×3, `#2563eb` ×3 (valore dark usato come fallback light) e `#928e72` ×2 (un beige su un token indaco). I focus ring sono scritti `rgba(99,102,241,…)`, quindi non seguono il token.

**C14 — Lo stesso token ha fallback che non corrispondono al suo valore.**
`--border` vale `#e2e8f0`; i fallback in uso sono `#e2e8f0` ×80, `#e5e7eb` ×26, `#cbd5e1` ×20, `#374151` ×4. `Card.module.scss` e `TextInput.module.scss` — adiacenti in ogni form dell'app — dichiarano due bordi diversi per il medesimo token.

**C15 — In 26 punti `border-radius`, `gap` e `background` risolvono a vuoto.**
`--radius-sm/md/lg` non esistono: `var(--radius-md)` senza fallback in 8 punti; `--spacing-3/4` senza fallback in 6 punti di `Catalogs.module.scss` (gap e padding a zero); `--color-surface` senza fallback in 3 punti di `Styles.module.scss` (sfondo trasparente). `--text-muted` è usato 146 volte, 30 senza fallback, e `Tabs.module.scss:208` lo documenta: *«`var(--text-muted)` non è definita globalmente»*.

**C16 — Il componente più usato dell'app prende la famiglia tipografica da variabili che nell'admin non esistono.**
`Text.module.scss:5` (233 file) risolve `var(--preview-font-family, var(--pub-font-family, "Outfit", sans-serif))`: due token del tema **pubblico** per-tenant, non definiti nell'admin, con fallback su un font per cui non esiste nessun `@font-face` nel perimetro. `global.scss` imposta invece `body { font-family: Inter }`, e `DESIGN.md` dichiara Inter canonica.

**C17 — `uppercase` è vietato sui titoli di sezione e obbligatorio sulle intestazioni di tabella.**
`SectionCard.tsx:6` documenta *«sentence case — mai maiuscoletto»*, `CLAUDE.md` lo elenca fra i PROIBITI e `DESIGN.md` §6 vieta gli eyebrow maiuscoli. `DataTable.module.scss:54-59` applica `text-transform: uppercase; letter-spacing: 0.04em` a tutte le intestazioni di colonna (28 file). Le due regole convivono a pochi pixel di distanza ogni volta che un `DataTable` sta dentro una `SectionCard`.

**C18 — CRUD in modale centrata dove la regola dice drawer.**
`Businesses.tsx` elimina la sede con `ModalLayout` (e apre un secondo `ModalLayout` per il limite di sedi); Recensioni conferma l'eliminazione **inline nella riga**; Programmazione usa una modale nella lista e un `ConfirmDialog` nei due dettagli — con lo stesso titolo e lo stesso messaggio. La scelta drawer-vs-modale non segue il tipo di azione ma il dominio.

**C19 — Drawer che aprono drawer, fino a tre livelli, con il figlio più largo del padre.**
`TablesManagement` apre un `SystemDrawer` a 480 e, come pari, `TableZonesAndGroupsDrawer` a 520. `ActivityVisibilityIngredients` apre un `ConfirmDialog` centrato da dentro un `SystemDrawer` a 900. `FeaturedContentDetailPage` apre 4 drawer di sezione (520, 560, 560, 480) più un picker a 640.

**C20 — Due paradigmi di editing per due pagine di dettaglio equivalenti.**
`ProductPage` solleva il draft a livello pagina, con una sola azione Salva/Annulla nell'header e drawer che scrivono nel draft senza toccare il DB. `FeaturedContentDetailPage` non ha `isDirty` (zero occorrenze) e affida ogni sezione a un drawer che salva da sé: quattro larghezze, quattro salvataggi indipendenti.

**C21 — Lo stesso gesto ha tre contratti di persistenza.**
Riordino prodotti in una categoria: draft + barra "Hai modifiche non salvate", che nel frattempo **blocca** creazione, eliminazione e spostamento di categorie. Riordino storie: persiste a ogni drag. Riordino prodotti in un contenuto in evidenza: idem.

**C22 — `HeaderSaveAction`, usato da tre pagine di tre domini, vive dentro il dominio Storie.**
`ProductPage.tsx:24` importa da `@/pages/Dashboard/Stories/components/HeaderSaveAction`. Accanto c'è `headerSaveActionCompact.tsx`, il cui commento dichiara di valere per *"tutte le pagine che usano `HeaderSaveAction`"*.

**C23 — `EmptyState` non ha una variante per l'errore, e viene usato comunque per gli errori.**
`title="Errore"` + `description={error}` in almeno quattro punti, accanto a `InlineBanner variant="error"` (17 file) e ai toast `type:"error"` (405 call-site): tre canali per lo stesso esito, scelti caso per caso. `InlineBanner` non ha invece nessuna variante `success`.

**C24 — `DESIGN.md` contiene note di drift non più vere e non registra quelle attive.**
Documenta un hardcode di `Button.module.scss` che ora usa il token; dichiara `indigo-primary: #6366f1` mentre il token vale `#6265f1`; documenta `Drawer` come parte del sistema, mentre quel componente ha zero import; non menziona né i ~125 token inesistenti né le 12 larghezze di drawer.

---

# 3. Percorso utente

> Ricostruito dal codice: prerequisiti, guardie, redirect e stati vuoti. Non sostituisce una passata dal vivo.

## 3.1 FATTI — La catena di dipendenze per arrivare online

Perché la pagina pubblica di una sede mostri qualcosa servono **quattro oggetti in quattro pagine diverse**, in un ordine obbligato che il prodotto dichiara esplicitamente in un solo posto (la checklist della Panoramica, `OverviewPage.tsx:657-694`, con il sottotitolo *"Mancano N passaggi. Si fanno in quest'ordine: ognuno serve al successivo."*):

```
Sede pubblicata          /locations            → status "active"
   +
Prodotti                 /products             → almeno 1 prodotto
   +
Catalogo popolato        /catalogs/:id         → catalogo + categoria + prodotti associati
   +
Regola layout attiva     /scheduling/:ruleId   → target sede + catalog_id + style_id
   =
Pagina pubblica /:slug
```

Dipendenze di secondo livello, tutte verificate nel codice:

| Per fare questo | serve prima questo | e sta qui |
|---|---|---|
| Associare un prodotto a un catalogo | una **categoria** creata **e selezionata** | `CatalogEngine`, pannello destro assente senza `selectedCategory` |
| Attivare una regola `layout` | catalogo **e** stile | `ProgrammingRuleDetail.tsx:594` |
| Attivare una regola `price`/`visibility` | prodotti | `:576-582` |
| Attivare una regola `featured` | un contenuto in evidenza già creato | `ProgrammingRuleDetail.tsx:356` |
| Usare `targetMode: "all"` | il gruppo di sistema "Tutte le sedi" | `:500-511`, errore altrimenti |
| Tab "Disponibilità" della sede | una regola layout attiva che assegni un catalogo | `ActivityVisibilityContent.tsx:313-321` |
| Tab "Sala" | Ordinazioni QR **o** Prenotazioni attive | `ActivityDetailPage.tsx:268` |
| Tab "Ordinazioni" | sede pubblicata | `PrerequisitesRow`, 1 voce |
| Tab "Prenotazioni" | orari (tab 2) + capienza (tab 3) + ragione sociale (**pagina Abbonamento**) | `ActivityReservationsTab.tsx:388-416` |
| Ordinare dal tavolo | tavoli mappati + catalogo attivo risolto da una regola | `CreateOrderDrawer` |
| Rubrica Clienti | prenotazioni ricevute (si popola solo da quelle) | `Guests.tsx:97` + commento |
| Traduzioni | almeno una lingua attiva oltre l'italiano | `TranslationsTab.tsx:406` |
| Valorizzare un attributo su un prodotto | una definizione di attributo a livello azienda | `ProductAttributesDrawer.tsx:263-265` |
| Assegnare un gruppo a un prodotto | gruppi già creati altrove (tab di Prodotti) | `SchedaTab.tsx:216-247` |

## 3.2 FATTI — I quattro flussi, passo per passo

### A. Primo accesso
1. `/workspace` → card "Crea attività" → drawer `CreateBusinessWizard` a 4 step: `Informazioni attività` → `Piano e sedi` → `Dati di fatturazione` → `Riepilogo e pagamento`. Lo step 3 raccoglie ragione sociale, P.IVA e sede legale.
2. Dopo il pagamento, il business esiste con **0 sedi**. Aprendolo si atterra su `/overview`.
3. La Panoramica mostra la card "Configura con la procedura guidata" (`Sede, {catalogo} e pubblicazione in pochi minuti.`), seguita dal divider `"Oppure procedi un passo alla volta"` e dalla checklist a 4 passi.
4. Il wizard (`/setup`) crea sede → catalogo (import AI o manuale) → **e la regola di programmazione in automatico**, con nome fisso `"Menù principale"`, targetizzata sulla sola sede creata. Lo step 3 mostra il QR.
5. Se il menù è vuoto, lo step 3 cambia copy: `"Il tuo QR è pronto"` / `"Sede, menù e regola sono a posto: manca solo cosa mostrare dentro, cioè i piatti."` e la primaria diventa `"Aggiungi i primi piatti"`.

Il wizard è raggiungibile **solo** se il tenant ha 0 sedi: chi crea la prima sede a mano perde per sempre quel percorso, e il gate lo redirige a `/overview` (`SetupWizardPage.tsx:104-146`).

### B. Creare un prodotto e portarlo nel menù
1. `/products` → `"Crea prodotto"` → drawer a **4 campi**: `Nome` (obbligatorio), descrizione (con generazione AI), immagine, prezzo (unico o per formati). Nota di chiusura del form: *"Puoi aggiungere varianti, configurazioni e attributi dopo la creazione del prodotto."*
2. Toast: `"Prodotto creato. Completa prezzi e configurazioni quando vuoi."` con azione `"Configura ora"`.
3. Il prodotto ora esiste ma **non è in nessun catalogo**: nella lista compare con il badge `"Fuori menù"`, e un `Select` di mancanze appare nella toolbar solo se esistono prodotti incompleti.
4. Per portarlo nel menù: `/catalogs/:id` → selezionare una categoria nell'albero → `"+ Aggiungi prodotto"` → tab `Esistente` → cercarlo → `"Associa selezionati (N)"`. Il bottone non esiste se nessuna categoria è selezionata.
5. Per rifinirlo: `/products/:productId`, 5 tab. `Scheda` (immagine con framing, informazioni, note ≤10, allergeni, caratteristiche, ingredienti, abbinamenti) e `Prezzi & Opzioni` (prezzo, configurazioni, varianti).

### C. Creare un catalogo
1. `/catalogs` → `"Crea menù"` → **un solo campo**, `"Nome del Catalogo"`.
2. Si atterra su `/catalogs/:id` con l'albero vuoto: `"Nessuna categoria"` / `"Crea una categoria root per iniziare."`
3. Creata la categoria (2 campi: nome + `"Inserisci sotto"`), il pannello destro si attiva e permette di associare prodotti — o crearne di nuovi con uno `SplitButton` `"Crea e associa"` / `"Crea e configura"`.
4. Massimo 3 livelli di profondità. Il limite è comunicato con un toast **dopo** il tentativo (`"Non puoi creare categorie oltre il livello 3."`); il drawer avvisa preventivamente solo in modalità edit e solo se il filtro ha già scartato opzioni.
5. Con modifiche pendenti, creare/eliminare/spostare categorie è **bloccato**: `"Salva o annulla le modifiche prima di creare o eliminare categorie."`
6. Il catalogo non è visibile a nessuno finché una regola layout non lo assegna a una sede.

### D. Creare una regola di programmazione
1. `/scheduling` → si atterra sulla tab `Layout` (default). `"Nuova regola"` crea **immediatamente una bozza sul server** e naviga al dettaglio: non esiste creazione in-pagina.
2. Il dettaglio è un form a 2 colonne senza tab e **senza una riga di testo esplicativo**: `Target` (nome + 3 radio + multiselect condizionale), `Contenuti associati` (2 Select per `layout`; una tabella + drawer annidato per `visibility`; pill + righe di override per `price`), `Programmazione` (toggle "Sempre attiva" + 3 switch di progressive disclosure: periodo, orari, giorni).
3. Salvando con campi mancanti, la regola resta **bozza disabilitata** con un toast che enumera i campi: `"Regola salvata come bozza. Manca: sedi target, catalogo, stile"`. Se la bozza diventa completa si auto-attiva: `"Regola salvata e attivata."`
4. Lo Switch Attiva/Disattivata nell'header **salva subito**, fuori dal form.
5. La spiegazione di cosa sia una regola, di cosa sia una "finestra" e di come le regole competano fra loro sta in due posti: gli empty state per tipo, e una modale dietro il link `"Come funziona"`. Nessuno dei due è raggiungibile dalla pagina di dettaglio.

### E. Creare uno stile
1. `/styles` → `"Crea stile"` → 2 campi: `"Nome stile"` + `"Duplica da... (Opzionale)"`. Footer `"Crea e continua"`, poi si atterra sull'editor.
2. L'editor ha 6 sezioni scrollabili e ~19 controlli, **tutti con `InfoTooltip`** — è il dominio con l'aiuto contestuale più sistematico di tutto il pannello.
3. Gli stili di sistema sono read-only: l'unica via è `"Duplica e personalizza"`, che crea `"Copia di {nome}"`.
4. Ogni salvataggio crea una versione immutabile (`"Stile aggiornato (nuova versione creata)."`); se lo stile è in uso, un `ConfirmDialog` avverte che le modifiche sono immediate sulle sedi che lo usano.
5. Dalla pagina Stili **non si può assegnare uno stile a una sede**: serve una regola layout. Il legame stile→regola compare solo dentro quel dialog.

## OSSERVAZIONI — percorso utente

**P1 — L'unico posto che dichiara l'ordine dei passi è una card che scompare.**
La checklist della Panoramica è visibile solo a owner/admin e solo finché il setup è incompleto (`showSetupBlock = canSeeSetup && (loadingSetup || !setupComplete)`). Dopo il primo successo, la sequenza sede → prodotti → catalogo → regola non è documentata in nessun altro punto del prodotto. Chi aggiunge la **seconda** sede sei mesi dopo non ha più quella guida.

**P2 — Il wizard guidato è irripetibile e invisibile a chi non ne ha bisogno subito.**
Un solo gate (`hasAnyLocation`) lo chiude per sempre. Chi crea la prima sede da `/locations` senza passare dal wizard non vedrà mai il percorso guidato — e sarà anche l'utente che deve creare la regola di programmazione a mano, cioè l'unico passo che il wizard faceva in silenzio per lui.

**P3 — La regola di programmazione è il passo con il carico concettuale più alto, e il solo senza aiuto in pagina.**
Per attivarla serve capire: target (3 modalità), contenuto associato (che cambia forma per tipo), finestra temporale (periodo/orari/giorni combinabili), competizione fra regole. La pagina di dettaglio non ha né `InfoTooltip`, né helper di campo, né link a `"Come funziona"`. Per contrasto, il form del tavolo — l'oggetto più concreto del prodotto — ha un helper per ogni campo, ben scritto.

**P4 — Il sistema dichiara conflitti e suggerisce di cambiare la priorità, ma la priorità non è modificabile da nessuna UI.**
`Programming.tsx:736-787` costruisce suggerimenti con `actionLabel: "Modifica priorità"` e testi come *"Imposta priorità 2 oppure riduci il target"*. Il campo `priority` non esiste in nessuno dei due form di dettaglio (zero match); `components/PrioritySection.tsx`, l'unico controllo di priorità scritto, **non è importato da nessun file**. In più `getRuleSuggestions` non è mai chiamata nel render: è dead code che documenta una leva assente.

**P5 — L'ordinamento reale delle regole è un algoritmo a 4 livelli di cui l'utente controlla uno.**
`resolverSort`: sovrascritte → **specificità target** → **specificità temporale** → `created_at`. La specificità temporale è un punteggio interno (periodo = 2, fascia oraria = 1) mai nominato in UI; `created_at` è invisibile. L'unica leva esposta è il target.

**P6 — "Sovrascritta", "Mai applicata", "Escluse N sedi" sono verdetti senza percorso di risoluzione.**
I badge di riga hanno un tooltip che spiega cosa è successo (*"Un'altra regola più specifica è attiva per questa sede in questo momento"*) ma nessuna azione correttiva, e il dettaglio non ha la leva (P4).

**P7 — Tre prerequisiti su quattro stanno in una pagina diversa da quella che li chiede, e uno in un'altra area della sidebar.**
La capienza della sala è un prerequisito dichiarato da "Prenotazioni" ma vive in "Sala", **dentro una card che compare solo se le prenotazioni sono già attive** (`TablesManagement.tsx:648`). La ragione sociale è un prerequisito delle prenotazioni ma vive nei dati di fatturazione, e il bottone dice `"Vai ad Abbonamento"` — pagina che, dal suo canto, non annuncia di contenerla.

**P8 — Le tre tab con prerequisiti li trattano in tre modi diversi, nella stessa pagina.**
Ordinazioni: `PrerequisitesRow` con 1 voce. Prenotazioni: `PrerequisitesRow` con 3 voci, due verso altre tab e una verso un'altra pagina. Sala: nessun `PrerequisitesRow`, ma un empty state a tutta pagina con due CTA.

**P9 — Diversi empty state indicano la strada a parole invece di offrire un link.**
`"Le impostazioni di disponibilità saranno disponibili quando una regola di programmazione assegnerà un catalogo a questa sede."` (nessun link a `/scheduling`). `"Configura i tavoli dalla scheda Sala della sede."` (testo non cliccabile). `"Nessun contenuto in evidenza disponibile — creane uno dalla sezione Highlights"` (non un link, e "Highlights" non è il nome di nessuna voce di menu). `"Nessun gruppo presente. Creane uno dalla pagina Gruppi Prodotti."` (che è una tab, non una pagina).

**P10 — La tab "Prodotti inclusi" nomina la condizione che la sblocca ma non dove soddisfarla.**
`disabledTooltip="Seleziona il tipo Promo o Bundle"`; il tipo si cambia solo da un drawer aperto da un blocco dentro l'altra tab.

**P11 — Il link "vai al prodotto nel catalogo" passa un parametro che nessuno legge.**
`UsageTab.tsx:117` genera `?highlightProduct={id}`; grep su tutto `src`: quella è l'unica occorrenza. `CatalogEngine` legge solo `categoryId`, quindi l'utente atterra sul catalogo senza categoria selezionata e senza evidenziazione, davanti a `"Seleziona una categoria"`.

**P12 — Il modello mentale "crea → configura" è espresso con quattro grammatiche.**
`SplitButton` `"Crea e associa"` / `"Crea e configura"` (Catalog engine) · `"Crea e associa"` secco (Highlights) · `"Crea e continua"` (Stili) · `"Crea"` + nota nel form + toast con azione `"Configura ora"` (Prodotti).

**P13 — Il vincolo dei 3 livelli di categoria è comunicato solo dopo il tentativo.**
Toast alla pressione; l'avviso preventivo esiste solo in modalità edit e solo se il filtro ha già scartato delle opzioni. Nell'albero, l'azione "crea sotto-categoria" non espone il limite prima del click.

**P14 — Il drawer di cancellazione consiglia una funzione che esiste, con un nome diverso, tre livelli più in là.**
`OrderCancelDrawer.tsx:87`: *"Se l'ordine era già consegnato, considera la rettifica invece della cancellazione totale."* L'operazione esiste, ma in UI si chiama **`"Storna"`** e sta in `TableDetailDrawer` (`:955`), raggiungibile solo via Ordini → tab `Tavoli` → dettaglio tavolo → vista conto → bottone per riga d'ordine. Dalla card della comanda, dove il consiglio viene dato, non c'è nessun percorso. Lo stesso concetto ha tre nomi (`rettifica` nel consiglio, `Storna` nell'azione, `Rettificato`/`Storno` nello Storico) e nessuno dei tre è spiegato. `OrderRectifyDrawer.tsx` (286 righe) è invece davvero dead code: `OrderRectifyForm` è riusato direttamente dentro il drawer tavolo.

**P15 — Analitiche dichiara "Presto" per tre metriche i cui dati sono già raccolti.**
`"Non presentati"` — *"Disponibile quando il flusso registrerà lo stato"*; `"Tempi di permanenza"` — *"quando il flusso registrerà seduta e completamento"*; `"Utilizzo tavoli"` — *"quando le prenotazioni saranno assegnate a un tavolo"*. Ma Prenotazioni gestisce già `mark_no_show`/`undo_no_show`, apertura e chiusura seduta, e assegnazione tavoli.

**P16 — La Panoramica mostra a manager/staff/viewer una pagina svuotata senza dirlo.**
Per i ruoli activity-scoped spariscono checklist e blocco pagine pubbliche; restano header, "Statistiche rapide" e "Azioni rapide". Nessun testo spiega l'assenza, e le statistiche — conteggiate con query filtrate da RLS — possono mostrare `0` per mancanza di permesso, indistinguibile da "non configurato" (il codice lo dichiara a commento).

**P17 — Le "Azioni rapide" della Panoramica non sono gated.**
Quattro bottoni costruiti senza controllo sui permessi. Un viewer senza `products.read` non ha la voce "Prodotti" in sidebar ma ha qui un bottone che ci porta.

**P18 — Con piano base, lo stesso limite è comunicato in due modi.**
In sidebar, Ordini/Prenotazioni/Clienti portano un lucchetto e il tooltip `"{voce} · Pro"`. Nelle tab della sede, "Ordinazioni" e "Prenotazioni" sono navigabili e mostrano lo switch principale disabilitato con caption `"Disponibile con il piano Pro"`.

**P19 — Il catalogo è un contenitore di categorie, ma l'unico posto dove crearne una è dentro il catalogo.**
La sequenza reale è catalogo → categoria → prodotto-già-esistente. La checklist della Panoramica invece ordina prodotti **prima** del catalogo (`products` è il passo 2, `catalog` il passo 3), coerentemente con `"I prodotti vanno organizzati in un menù per essere mostrati ai clienti."` Le due sequenze non sono in conflitto, ma la pagina Prodotti non dice in nessun punto che un prodotto creato lì non è ancora visibile: lo dice solo il badge `"Fuori menù"`, che appare in lista.

---

# 4. Testi e microcopy

## 4.1 FATTI — Glossario: i termini del prodotto e se l'interfaccia li spiega

| Termine | Spiegato in UI? | Dove, o perché no |
|---|---|---|
| **sede** | **Sì** | `"È il locale che i clienti raggiungono con il QR."` (Panoramica) + empty state sedi |
| **catalogo / menù** | **Parziale** | empty state: `"Il menù è quello che i clienti vedono col QR"`. La relazione catalogo↔categorie↔prodotti non è mai spiegata |
| **regola di programmazione** | **Sì, molto bene — ma solo a lista vuota** | 5 empty state per tipo + modale `"Come funziona"`. Chi apre una regola esistente non incontra mai la spiegazione |
| **contenuto in evidenza** | **Sì** | empty state + modale featured. Il subtitle di pagina è invece opaco: `"Gestisci i contenuti editoriali e aggregatori di prodotti."` |
| **variante** | **Sì** | `"Le varianti hanno prezzo e descrizione propri. Si vedono come prodotti separati nel menu pubblico."` |
| **configurazione / gruppo opzioni** | **Sì** | `"Mostrano al cliente le possibili scelte del piatto — es. Cottura (al sangue / media / ben cotta)…"` |
| **visibilità tri-state** | **Sì nella modale, no dove si usa** | le due colonne `Nascosto`/`Non disponibile` sono spiegate nella modale di aiuto; nel drawer "Gestisci disponibilità" i tre stati non hanno nessuna spiegazione |
| **zona / gruppo di accostamento** | **Sì (funzionale)** | `"Aggiungi la prima zona per organizzare i tavoli."` / `"Crea un gruppo per accostare più tavoli fra loro."` |
| **seat** | **Sì (implicitamente)** | il termine tecnico non è mai esposto: sempre reso come "sedi" |
| **stile** | **Parziale** | subtitle + empty state. Il legame stile→regola compare solo nel dialog `"Stile in uso"` |
| **specificità** | **Parziale** | l'intro della modale dice *"vince quella più specifica"*, ma non cosa renda una regola più specifica. In UI appare solo abbreviata: `Spec: Sede specifica` |
| **priorità** | **No, e contraddittorio** | le card dicono `Massima/Alta/Standard/Minima precedenza` senza dire rispetto a cosa; i messaggi diagnostici parlano di priorità **numerica** (`"priorità 1"`) mentre l'editor espone 4 livelli nominali — e il controllo non è montato (P4) |
| **target** | **No** | le tre opzioni sono descritte, la parola no. `"target globale"` non corrisponde a nessuna label visibile |
| **override** | **No** | `"Prezzo override"` è una label di campo; mai definito |
| **categoria / livello 3** | **No** | solo helper operativi; il limite di profondità non è spiegato |
| **versione stile** | **No** | perché un salvataggio crei una versione, e cosa comporti, non è detto in nessun punto |
| **formato** | **No** | e la differenza formato ↔ variante ↔ configurazione non è spiegata da nessuna parte |
| **azienda / attività / tenant** | **No** | tre parole per lo stesso oggetto; e `attività` designa anche la sede |
| **gruppo di sedi** | **No** | `"Seleziona uno o più gruppi"`: a cosa serva raggruppare le sedi non è detto |
| **comanda / ordine** | **No** | i due termini si alternano senza distinzione dichiarata; `Storno` e `Rettificato` non sono spiegati |
| **catalogo globale** | **No** | introdotto in una sola frase (`ActivityAvailabilityTab.tsx:60`) e mai definito |
| **hero** | **No, ed è obsoleto** | slot rimosso dal prodotto, ancora elencato in Analytics |
| **piano Base / Founder** | **No** | cosa contiene Pro è detto solo funzione per funzione |

## OSSERVAZIONI — testi

**T1 — L'intera spiegazione della Programmazione è dietro un link opzionale.**
Le 5 voci di `HELP_CONTENT` e `EMPTY_STATE_COPY` sono l'unico posto dove regola, finestra, specificità e competizione sono definite — e appaiono solo a lista vuota o su click di `"Come funziona"`. Sono, fra l'altro, i testi migliori di tutto il pannello: la modale `visibility` spiega la differenza fra "nascosto" e "non disponibile" con due colonne e un esempio, e la modale `all` dice esplicitamente *"La competizione avviene solo fra regole dello stesso tipo."* Quel contenuto non raggiunge chi ne ha più bisogno: chi sta modificando una regola.

**T2 — Il testo espone i nomi interni del modello dati in 30+ punti.**
Fra i più visibili: `"I tuoi tenant"` (il primo controllo che un utente nuovo tocca, in navbar), `"La regola si applica a tutte le sedi del tenant"`, `"Tenant ID mancante"`, `"Errore: tenantId mancante."`, `"Utente non identificato (tenantId mancante)"`, `"Prezzo override"`, `"Override manuali attivi su prodotti collegati"`, `"In modalità window imposta almeno un periodo, giorni o fascia oraria."`, `"Gruppo di sistema 'Tutte le sedi' mancante."`, `"I prodotti originali non verranno cancellati dal tuo database."`, `"Già nel database"`, `"Membership non trovata."`, `"Dato non disponibile: ricaricare la pagina o verificare le migration della vista tavoli"`, `"Cerca per nome, tipo, target o id..."`.

**T3 — "attività" designa contemporaneamente l'azienda e la sede.**
Azienda: `"Le tue attività"`, `"Impostazioni attività"`, `"Nome attività"`, `"Crea attività"`, `"Eliminare definitivamente questa attività?"`. Sede: `"Nome attività"` (riga read-only della scheda sede), `"Presentazione attività"`, `"Attività pubblicata"`/`"Attività sospesa"`, `"Attività coinvolte"`, `"Applicata a: Tutte le attività"`. `CLAUDE.md` prescrive Tenant→"Azienda", Activity→"Sede": nessuno dei due termini è usato in modo univoco.

**T4 — Lo stesso oggetto ha tre nomi contemporaneamente: Menù / Cataloghi / Catalogo.**
Sidebar e header `"Menù"`; scheda browser `"Cataloghi"`; form `"Nome del Catalogo"`; **nello stesso drawer** header `"Elimina Menù"` e corpo `"Questo catalogo è utilizzato da N regole"`; select della regola `"Catalogo"`; description della tab `"Definiscono quale catalogo e stile mostrare"` contro la modale `"quale menù e quale stile"`; empty state Prodotti `"lo usi in ogni catalogo"` contro empty state Cataloghi che dice `"menù"`.

**T5 — Cinque stati ordine, tre vocabolari incompatibili.**

| DB | Kanban | Drawer ordine | Drawer tavolo | Storico |
|---|---|---|---|---|
| `submitted` | Nuove | Da prendere | Da confermare | — |
| `acknowledged` | In lavorazione | In corso | In preparazione | — |
| `ready` | Pronte | Pronto | Pronto | — |
| `delivered` | — | Consegnato | Servito | Servito |
| `cancelled` | — | Cancellato | Annullato | Annullato |

Il passaggio a "servito" ha quattro etichette (`"Consegna"`, `"Servita"`, `"Servito direttamente"`, badge `"Servito"`), tutte per la stessa chiamata. E `"Elimina comanda"` apre un drawer intitolato `"Cancella ordine"`, dove il bottone `"Annulla"` significa "non fare nulla" e `"Cancella ordine"` significa "procedi".

**T6 — "gruppo" è sovraccarico su cinque concetti, spesso con lo stesso bottone `"Crea gruppo"`.**
Gruppo di sedi · gruppo prodotto · gruppo opzioni (dentro "Configurazioni") · gruppo di accostamento tavoli · gruppo di sistema.

**T7 — "Configurazioni" è sovraccarico su tre concetti.**
Card del prodotto (gruppi-opzioni) · `"Configurazione sede"` (metodi di pagamento, servizi, tariffe) · toast `"Configurazione salvata"` (capienza sala).

**T8 — Testi che rimandano a sezioni con nomi che non esistono.**
`"creane uno dalla sezione Highlights"` → la sezione si chiama "Contenuti in evidenza". `"Apri in Piatti"` (×4 nel Catalog engine) → la sezione si chiama "Prodotti", e `productLabelPlural` è `"Prodotti"` per **tutti** i verticali, retail e hotel compresi. `"Creane uno dalla pagina Gruppi Prodotti"` → è una tab.

**T9 — Il toast delle bozze enumera nomi di campi che l'utente non ha mai visto.**
`"Regola salvata come bozza. Manca: sedi target, prodotti con override prezzo"`. In UI quei campi si chiamano `"Sedi selezionate"` e `"Prezzo override"`.

**T10 — L'aiuto contestuale è concentrato in un solo dominio.**
`InfoTooltip` è usato in 3 file: l'editor di stile (21 tooltip, ben scritti) e `BusinessCreateCard`. Programmazione, Prodotti, Cataloghi, Ordini e Sedi — dove vivono i concetti più astratti — non ne usano nessuno. L'alternativa in uso è l'attributo `title=` nativo (12 punti, fra cui due testi lunghi nella sezione contenuti della regola), che su touch non compare mai.

**T11 — L'inglese residuo si concentra dove il concetto è più difficile.**
`Layout` è il nome di un tipo di regola — l'unica label non italiana della navigazione — e in CataloGlobe "layout" sono anche le impostazioni dello stile. `Target` è il nome di una sezione e di una colonna. `Header` è l'unico titolo di sezione in inglese del pannello stile. Le 5 opzioni di navigazione sono tutte inglesi (`Pill`, `Soft`, `Outline`, `Tabs`, `Minimal`), e nella stessa serie convivono `Card`/`Highlight`/`Compatto` e `Soft`/`Media`/`Marcata`. Altrove: `Engagement`, `Funnel`, `Click`, `Redirect a Google`, `Hero`, `Owner`/`Admin`/`Manager`/`Staff`/`Viewer` (mentre le spiegazioni degli stessi ruoli dicono "proprietario", "amministratori"), `Founder`, `Promo`/`Bundle`, `Setup guidato`, `Gestisci su Stripe`, e il placeholder `"Es: Dark Theme, Summer Vibes..."`.

**T12 — Label ambigue o troncate.**
`"Limita selezione"` / `"Limita sel."` (nessun helper dice cosa limita) · `"Fino a quante?"` usato come label **e** come placeholder dello stesso campo · `"Comportamento"` come header di colonna · `"Spec:"` in una UI che altrove non abbrevia · `"Non disp."` dove altri 6 punti scrivono `"Non disponibile"` per intero · `"Nome interno"` senza placeholder né helper, contrapposto a `"Titolo pubblico"` senza dire dove ciascuno appaia · `"Formato"` con due significati (formato prezzo e proporzione immagine) · `"Attiva"` usata come stato, come verbo imperativo e come aggettivo.

**T13 — Cinque formule diverse per "campo vuoto" nella stessa pagina.**
`FeaturedContentDetailPage`: `"Nessun sottotitolo"`, `"Non impostato"`, `"Nessuna descrizione"`, `"Nessuna immagine caricata"`, `"Nessuna CTA configurata"`.

**T14 — Le CTA degli empty state non hanno una forma unica.**
`"Crea il primo {x}"` (4 pagine) · `"Aggiungi la prima sede"` · `"+ Crea la prima storia"` e `"+ Nuova richiesta"` con il `+` nel testo · `"Crea stile"`/`"Crea contenuto"` senza ordinale · `"Nuovo tavolo"`/`"Nuovo gruppo"`/`"Nuovo attributo"` · `"Passa a Pro"`.

**T15 — Title Case usato a macchia.**
`"Nuovo Prodotto"`, `"Modifica Prodotto"`, `"Nuova Variante"`, `"Conferma Eliminazione"`, `"Gruppi Prodotti"`, `"Nome del Catalogo"`, `"Aspetto Generale"`, `"Navigazione Sezioni"`, `"Elimina Stile"` — contro `"Nuovo tavolo"`, `"Nuova categoria"`, `"Nuova richiesta"`, `"Nome sede"`, `"Nome stile"`.

**T16 — Accenti mancanti in 12 stringhe visibili all'utente.**
`c'e'`, `piu'`, `e'` (×3), `gia` (×5), `puo` (×2), più un errore di accordo: `"Questo è una variante"`.

**T17 — Copy di configurazione per verticale in parte inerte.**
`copy.productSections.characteristics` vale `"Caratteristiche e Note"` per tutti i verticali e **non è letto da nessun consumer**: `SchedaTab.tsx:335` hardcoda `"Caratteristiche"`, e nella stessa colonna c'è una card separata `"Note prodotto"`. `categoryLabel: "Portata"` non appare in nessuna label. Per `food_beverage`, `placeholderExamples` è `""` con un commento che spiega che non verrà mai renderizzato.

**T18 — Il pannello stile read-only e quello editabile duplicano i tooltip a mano, e già divergono.**
`"Header espanso"` (editabile) vs `"Immagine copertina"` (read-only) per lo stesso campo; `"Aspetto card"` con le opzioni in ordine inverso; il read-only ha un tooltip accorciato su `"Densità contenuti"` e usa `Visibile/Nascosto` dove l'editor usa `Mostra/Nascondi`.

**T19 — La pagina admin "Incidenti" è l'unica che ha aggirato N1 duplicando il testo.**
Passa `title`/`subtitle` a `usePageHeader` (dove vengono ignorati) e li ripete nel corpo come `.heading`/`.subheading`.

---

# 5. Appendice — dead code che descrive funzioni assenti

Componenti completi, non importati da nessun file, che documentano capacità che il pannello non offre:

| File | Cosa suggerisce |
|---|---|
| `Programming/components/PrioritySection.tsx` | la priorità è modificabile (P4) |
| `Orders/OrderRectifyDrawer.tsx` | esiste un drawer di rettifica autonomo (il form è riusato dal drawer tavolo, il drawer no — P14) |
| `Orders/OrdersKpiBar.tsx` | esiste una barra KPI sugli ordini |
| `Analytics/components/AnalyticsFilters.tsx` | esistono filtri in pagina sulle analitiche |
| `ui/Drawer/Drawer.tsx` | esiste un drawer generico (`DESIGN.md` §5 lo documenta come parte del sistema) |
| `ui/Divider/Divider.tsx` | esiste un divisore (i divisori reali sono `border-bottom` locali) |
| `ui/Input/RangeInput`, `ui/Input/ColorInput`, `PillGroupSingle`, `TranslationRow` | — |
| `Onboarding/SelectBusiness.tsx` | esiste una schermata di selezione azienda (N23) |
| `PublicProductCard.tsx` | — |
| `Businesses/BusinessCard/BusinessCard.tsx` | omonimo del file effettivamente usato |
| `Businesses/BusinessSwitcher/`, `Businesses/CollectionItemsPanel/` | — |

Più due direttive morte in `ProductForm.tsx:1266`: ~820 righe di sezioni `"Prezzi"`, `"Organizzazione"` e `"Specifiche prodotto"` dietro `{false && (`, con UI di allergeni e ingredienti duplicata rispetto a quella viva in `SchedaTab.tsx`.

E una colonna che non mostra mai nulla: `CatalogEngine.tsx:1541-1551`, la cella `"Foto"` ignora la riga e rende sempre lo stesso segnaposto, occupando 78px in una tabella dove il prodotto ha un'immagine gestita e inquadrata altrove.

---

# Cosa manca a questa mappa

1. **La passata dal vivo.** Densità, gerarchia visiva, ritmo di scorrimento, comportamento reale della banda compatta (che si decide misurando lo spazio, non con un breakpoint), e il percorso di un utente nuovo su un tenant vuoto. Il tenant "REDESIGN" è pronto; serve l'accesso a staging.
2. **La pagina pubblica.** Fuori perimetro qui, ma è il risultato di tutto ciò che si configura nell'admin: il confronto fra quello che l'admin promette e quello che il cliente vede è materiale della fase 2.
3. **Il mobile.** Il pannello ha una sidebar collassabile, una banda compatta e una `PageHeaderCompactBar` costruita per progressive disclosure — tutto codice che questa lettura statica non può valutare.
