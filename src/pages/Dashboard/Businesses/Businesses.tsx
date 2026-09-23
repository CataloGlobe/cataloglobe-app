import { useEffect, useMemo, useState, useCallback } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getActivities,
  type SeatLimitInfo,
} from "@/services/supabase/activities";
import { getActiveCatalogForActivities } from "@/services/supabase/activeCatalog";
import { getPlanByCode } from "@/services/supabase/plans";
import { listPlanPrices } from "@/services/supabase/planPrices";
import { getTenantBillingInterval } from "@/services/supabase/tenants";
import { nextSeatOffer } from "@/utils/pricing";
import { priceCentsFor, DEFAULT_BILLING_INTERVAL } from "@/utils/planPricing";
import type { Plan, PlanPrice, BillingInterval } from "@/types/plan";
import type { CatalogFetchStatus } from "@/utils/activeCatalogStatus";
import type {
  ActiveCatalogMeta,
  BusinessWithCapabilities,
} from "@/types/Businesses";

import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderAction, PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import {
  workspaceRoleIsOwner as isOwner,
  workspaceRoleIsAdmin as isAdmin,
} from "@/utils/workspaceRole";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { countPendingReservationsByActivity } from "@/services/supabase/reservations";
import { PageGate } from "@/components/PageGate/PageGate";

import { BusinessList } from "@/components/Businesses/BusinessList/BusinessList";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityGroupsSection } from "@/components/Businesses/ActivityGroupsSection/ActivityGroupsSection";

import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useCreateActivity } from "@/hooks/useCreateActivity";

import { LayoutGrid, List as ListIcon } from "lucide-react";
import styles from "./Businesses.module.scss";
import {
  BusinessLocationDrawer,
  type SeatLimitOffer,
} from "@/components/Businesses/BusinessLocationDrawer/BusinessLocationDrawer";
import { Button } from "@/components/ui";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DeleteActivityDialog } from "@/components/Businesses/DeleteActivityDialog/DeleteActivityDialog";

function formatDateIt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ==========================================
// COMPONENT
// ==========================================
export default function Businesses() {
  const tenantId = useTenantId();
  const { selectedTenant, userRole } = useTenant();
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canEdit } = useSubscriptionGuard();
  const { permissions } = usePermissions();
  const canCreate = permissions
    ? canDoOnTenant(permissions, "activities.create")
    : false;
  const canDelete = permissions
    ? canDoOnTenant(permissions, "activities.delete")
    : false;
  const canManageGroups = permissions
    ? canDoOnTenant(permissions, "activity_groups.write")
    : false;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Piano + prezzi del tenant: servono solo per calcolare il blocco "offerta"
  // nel drawer di creazione quando il piano è al limite di sedi (vedi
  // `seatOffer` sotto). Stessa fonte di SubscriptionPage.tsx.
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [planPrices, setPlanPrices] = useState<PlanPrice[]>([]);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    DEFAULT_BILLING_INTERVAL,
  );

  // Role-aware copy for inactive subscription toast.
  const subscriptionInactiveMessage = useCallback(() => {
    if (isOwner(userRole))
      return "L'abbonamento non è attivo. Vai alla pagina abbonamento per riattivarlo.";
    if (isAdmin(userRole))
      return "L'abbonamento non è attivo. Solo il proprietario può riattivarlo.";
    return "L'abbonamento non è attivo. Contatta il proprietario.";
  }, [userRole]);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    (searchParams.get("tab") as "activities" | "groups") || "activities";

  // ======================================
  // STATE: lista dei business
  // ======================================
  const [businesses, setBusinesses] = useState<BusinessWithCapabilities[]>([]);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(true);
  const [activeCatalogsMap, setActiveCatalogsMap] = useState<
    Record<string, ActiveCatalogMeta>
  >({});
  // Esito, non flag: distingue "risolto senza catalogo attivo" da "non siamo
  // riusciti a risolvere". Prima il catch silenzioso li faceva finire entrambi
  // su "Nessun catalogo attivo".
  const [catalogsStatus, setCatalogsStatus] =
    useState<CatalogFetchStatus>("loading");


  // ======================================
  // STATE: Filtri e Vista
  // ======================================
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    const saved = localStorage.getItem("businesses_view_mode");
    return saved === "list" || saved === "grid" ? saved : "grid";
  });

  const handleViewChange = useCallback((v: "list" | "grid") => {
    setViewMode(v);
    localStorage.setItem("businesses_view_mode", v);
  }, []);

  // ======================================
  // FETCH BUSINESS
  // ======================================
  const refreshBusinesses = useCallback(async () => {
    if (!tenantId) return;

    setIsLoadingBusinesses(true);

    try {
      const data = await getActivities(tenantId);
      setBusinesses(data as BusinessWithCapabilities[]);

      // Batch fetch catalogo attivo in parallelo, non bloccante per la lista
      if (data.length > 0) {
        setCatalogsStatus("loading");
        getActiveCatalogForActivities(
          tenantId,
          data.map((b) => b.id)
        )
          .then((map) => {
            setActiveCatalogsMap(map);
            setCatalogsStatus("ready");
          })
          .catch((error) => {
            console.error("[Businesses] active catalogs failed:", error);
            setActiveCatalogsMap({});
            setCatalogsStatus("error");
          });
      } else {
        setCatalogsStatus("ready");
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setIsLoadingBusinesses(false);
    }
  }, [tenantId]);

  useEffect(() => {
    refreshBusinesses();
  }, [refreshBusinesses]);

  // «N da gestire» sulla card della sede (§48.1/3). Un di più: se la conta
  // fallisce la pagina resta com'è, senza segnale. Senza permesso di lettura
  // delle prenotazioni in nessuna sede la domanda non parte.
  const [pendingReservationsMap, setPendingReservationsMap] = useState<Record<string, number>>({});
  const canReadReservations = permissions ? canDoOnAnyActivity(permissions, "reservations.read") : false;
  useEffect(() => {
    if (!tenantId || !canReadReservations) {
      setPendingReservationsMap({});
      return;
    }
    let alive = true;
    countPendingReservationsByActivity(tenantId)
      .then((map) => {
        if (alive) setPendingReservationsMap(map);
      })
      .catch((error) => {
        console.error("[Businesses] pending reservations count failed:", error);
        if (alive) setPendingReservationsMap({});
      });
    return () => {
      alive = false;
    };
  }, [tenantId, canReadReservations]);

  useEffect(() => {
    if (!selectedTenant?.plan || !tenantId) return;
    getPlanByCode(selectedTenant.plan)
      .then(setCurrentPlan)
      .catch((err) => {
        console.error("[Businesses] plan lookup failed:", err);
        setCurrentPlan(null);
      });
    getTenantBillingInterval(tenantId)
      .then((interval) => setBillingInterval(interval ?? DEFAULT_BILLING_INTERVAL))
      .catch((err) =>
        console.error("[Businesses] billing interval lookup failed:", err),
      );
    listPlanPrices()
      .then(setPlanPrices)
      .catch((err) => {
        console.error("[Businesses] plan prices list failed:", err);
        setPlanPrices([]);
      });
  }, [selectedTenant?.plan, tenantId]);

  // ======================================
  // CREAZIONE SEDE (logica nel hook, gate di pagina qui)
  // ======================================
  const guardSubscriptionActive = useCallback(() => {
    if (!canEdit) {
      showToast({ message: subscriptionInactiveMessage(), type: "error" });
      return false;
    }
    return true;
  }, [canEdit, showToast, subscriptionInactiveMessage]);

  // Rete di sicurezza: il drawer si apre già sull'offerta quando il limite è
  // noto; qui si arriva solo se il piano non era caricato al click. Stessa
  // frase dell'offerta, nessun redirect.
  const guardSeatLimit = useCallback(() => {
    if (selectedTenant && businesses.length >= selectedTenant.paid_seats) {
      const paidSeats = selectedTenant.paid_seats;
      showToast({
        message: `Hai usato tutte le ${paidSeats} sedi pagate. ${
          isOwner(userRole) || isAdmin(userRole)
            ? "Aggiungine una al piano da Abbonamento."
            : "Chiedi al proprietario di aggiungerne una al piano."
        }`,
        type: "error",
        duration: 4000,
      });
      return false;
    }
    return true;
  }, [selectedTenant, businesses.length, userRole, showToast]);

  // Offerta al posto del form quando le sedi pagate sono finite: `null`
  // finché il piano non è caricato o finché c'è margine. Il prezzo della
  // sede successiva viene da `nextSeatOffer`, la stessa fonte di Abbonamento.
  const seatOffer = useMemo<SeatLimitOffer | null>(() => {
    const paidSeats = selectedTenant?.paid_seats ?? 0;
    const usedSeats = businesses.length;
    if (usedSeats < paidSeats || !currentPlan) return null;

    const unitPriceCents = priceCentsFor(planPrices, currentPlan.code, billingInterval);
    const offer = nextSeatOffer(
      { ...currentPlan, unit_price_cents: unitPriceCents },
      paidSeats,
      usedSeats,
    );
    if (offer.kind === "free") return null;

    const renewal = selectedTenant?.current_period_end ?? null;
    return {
      offer,
      planName: currentPlan.name,
      paidSeats,
      interval: billingInterval,
      renewalDateLabel: renewal ? formatDateIt(renewal) : null,
    };
  }, [selectedTenant, businesses.length, currentPlan, planPrices, billingInterval]);

  const openPlanUpgradeFromOffer = useCallback(() => {
    setIsCreateOpen(false);
    navigate(`/business/${businessId}/subscription#modifica-piano`);
  }, [navigate, businessId]);

  // Safety net: la creazione è comunque respinta dal trigger DB se il limite
  // viene raggiunto nella finestra fra apertura del drawer e submit (altra
  // sede creata da un altro tab/utente). Il drawer resta form-first in quel
  // caso — il click su "Aggiungi sede" lo apre già sullo stato offerta se il
  // limite era già raggiunto (vedi `handleAddActivity`).
  const handleSeatLimitFromServer = useCallback(
    (info: SeatLimitInfo) => {
      showToast({
        message: `Limite sedi raggiunto: il piano copre ${info.paid} ${
          info.paid === 1 ? "sede" : "sedi"
        } (in uso ${info.used}).`,
        type: "error",
        duration: 4000,
      });
    },
    [showToast],
  );

  const closeCreateDrawer = useCallback(() => setIsCreateOpen(false), []);

  const {
    values: createForm,
    errors: createErrors,
    isCreating,
    slugState: createSlugState,
    setSlugState: setCreateSlugState,
    handleFieldChange: handleCreateFieldChange,
    handleCoverChange: handleCreateCoverChange,
    handlePickSlugSuggestion: handleCreatePickSlugSuggestion,
    handleSubmit: handleAdd,
    reset: resetCreateState,
  } = useCreateActivity({
    tenantId,
    activityType: selectedTenant?.vertical_type ?? null,
    canSubmit: guardSubscriptionActive,
    beforeCreate: guardSeatLimit,
    onNotify: showToast,
    onSeatLimit: handleSeatLimitFromServer,
    onSuccess: refreshBusinesses,
    onSettled: closeCreateDrawer,
  });

  // ======================================
  // HEADER BAND: leading (tab line) + actions (search + toggle + CTA)
  // ======================================
  type ActiveTab = "activities" | "groups";
  const handleTabChange = useCallback(
    (next: ActiveTab) => {
      setSearchParams((prev) => {
        prev.set("tab", next);
        return prev;
      });
    },
    [setSearchParams],
  );

  const leading = useMemo(() => {
    if (businesses.length <= 1) return undefined;
    return (
      <Tabs<ActiveTab>
        value={activeTab}
        onChange={handleTabChange}
        variant="line"
      >
        <Tabs.List>
          <Tabs.Tab value="activities">Sedi</Tabs.Tab>
          <Tabs.Tab value="groups">Gruppi di sedi</Tabs.Tab>
        </Tabs.List>
      </Tabs>
    );
  }, [activeTab, handleTabChange, businesses.length]);

  const handleAddActivity = useCallback(() => {
    if (!canEdit) {
      showToast({ message: subscriptionInactiveMessage(), type: "error" });
      return;
    }
    // Al/oltre il limite il drawer si apre comunque, ma su `seatOffer` (stato
    // offerta) invece del form — niente form destinato a fallire contro
    // `enforce_seat_limit`.
    setIsCreateOpen(true);
    setCreateSlugState({ type: "idle" });
  }, [canEdit, showToast, subscriptionInactiveMessage, setCreateSlugState]);

  // Richiesta «Nuovo gruppo» dalla testata alla sezione: un contatore che la
  // sezione osserva, al posto dell'evento DOM che c'era prima.
  const [groupCreateRequest, setGroupCreateRequest] = useState(0);

  const handleNewGroup = useCallback(() => {
    if (!canEdit) {
      showToast({ message: subscriptionInactiveMessage(), type: "error" });
      return;
    }
    setGroupCreateRequest((n) => n + 1);
  }, [canEdit, showToast, subscriptionInactiveMessage]);

  // La primaria cambia con la tab attiva: due azioni diverse, mai entrambe.
  // Dichiarata a dati una volta sola e consumata sia dalla toolbar comoda sia
  // da quella compatta — così non possono divergere.
  const ctaAction = useMemo<PageHeaderAction | undefined>(() => {
    if (activeTab === "activities") {
      return canCreate
        ? { label: "Aggiungi sede", onClick: handleAddActivity, disabled: !canEdit }
        : undefined;
    }
    return canManageGroups
      ? { label: "Nuovo gruppo", onClick: handleNewGroup, disabled: !canEdit }
      : undefined;
  }, [activeTab, canCreate, canManageGroups, canEdit, handleAddActivity, handleNewGroup]);

  const headerActions = useMemo(() => {
    const cta = ctaAction ? (
      <Button
        variant="primary"
        disabled={ctaAction.disabled}
        onClick={ctaAction.onClick}
        className={styles.toolbarCta}
      >
        {ctaAction.label}
      </Button>
    ) : null;

    return (
      <>
        <ToolbarSearch
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={
            activeTab === "activities" ? "Cerca sede..." : "Cerca gruppo..."
          }
        />
        {activeTab === "activities" && (
          <SegmentedControl<"list" | "grid">
            iconsOnly
            value={viewMode}
            onChange={handleViewChange}
            options={[
              {
                value: "grid",
                icon: <LayoutGrid size={16} />,
                label: "Vista griglia",
              },
              {
                value: "list",
                icon: <ListIcon size={16} />,
                label: "Vista lista",
              },
            ]}
          />
        )}
        {cta}
      </>
    );
  }, [activeTab, ctaAction, searchTerm, viewMode, handleViewChange]);

  // Le sezioni esistono solo se c'è davvero qualcosa fra cui navigare: con una
  // sola sede la tab bar non viene renderizzata nemmeno in comoda, e in compatto
  // il picker sparisce di conseguenza (la riga resta icone + CTA).
  const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
    sections: businesses.length > 1
      ? [
          { value: "activities", label: "Sedi" },
          { value: "groups", label: "Gruppi di sedi" }
        ]
      : undefined,
    activeSection: activeTab,
    onSectionChange: value => handleTabChange(value as ActiveTab),
    search: {
      value: searchTerm,
      onChange: setSearchTerm,
      placeholder: activeTab === "activities" ? "Cerca sede..." : "Cerca gruppo..."
    },
    // Il toggle vista esiste solo sull'elenco sedi: sui gruppi non c'è nemmeno
    // in comoda, quindi non lo si inventa qui.
    persistentIcons: activeTab === "activities"
      ? [
          viewMode === "list"
            ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewChange("grid") }
            : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewChange("list") }
        ]
      : undefined,
    primaryAction: ctaAction
  }), [
    businesses.length,
    activeTab,
    handleTabChange,
    searchTerm,
    viewMode,
    handleViewChange,
    ctaAction,
  ]);

  usePageHeader({
    leading,
    actions: headerActions,
    compact: headerCompact,
  });

  // ======================================
  // CALLBACK: delete business
  // ======================================
  const handleDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTargetId(null);
  }, []);

  // Il dialogo (condiviso con la scheda) elimina e avvisa; qui restano il
  // ricarico dell'elenco e il promemoria sulle sedi pagate, che solo il
  // proprietario può cambiare (coerente col gate di creazione).
  const handleDeleted = useCallback(
    async () => {
      closeDeleteModal();
      await refreshBusinesses();
      const remainingSeats = businesses.length - 1;
      if (
        selectedTenant &&
        isOwner(userRole) &&
        selectedTenant.paid_seats > remainingSeats
      ) {
        showToast({
          message: `Il piano copre ${selectedTenant.paid_seats} sedi, ora ne hai ${remainingSeats}.`,
          type: "info",
          duration: 6000,
          actionLabel: "Modifica piano",
          onAction: () => navigate(`/business/${businessId}/subscription`),
        });
      }
    },
    [
      closeDeleteModal,
      refreshBusinesses,
      businesses.length,
      selectedTenant,
      userRole,
      showToast,
      navigate,
      businessId,
    ],
  );

  // «Modifica» dall'elenco apre la scheda della sede: identità e copertina
  // vivono là (registro Sedi, chiusura 4), niente secondo form qui.
  const handleEditClick = useCallback(
    (business: BusinessWithCapabilities) => {
      navigate(`/business/${businessId}/locations/${business.id}/anagrafica`);
    },
    [navigate, businessId],
  );

  // ======================================
  // RENDER
  // ======================================
  const showInitialSkeleton = isLoadingBusinesses && businesses.length === 0;

  const deleteTarget = useMemo(() => {
    const found = businesses.find((b) => b.id === deleteTargetId);
    return found ? { id: found.id, name: found.name ?? "" } : null;
  }, [businesses, deleteTargetId]);

  // Filtro lista sedi sulla query della banda (name/slug/city/address).
  const filteredBusinesses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter((b) => {
      const name = b.name?.toLowerCase() ?? "";
      const slug = b.slug?.toLowerCase() ?? "";
      const city = b.city?.toLowerCase() ?? "";
      const address = b.address?.toLowerCase() ?? "";
      return (
        name.includes(q) ||
        slug.includes(q) ||
        city.includes(q) ||
        address.includes(q)
      );
    });
  }, [businesses, searchTerm]);

  // Discriminante dell'empty state: true se ALMENO un filtro che concorre a
  // `filteredBusinesses` è attivo. Oggi la sola sorgente è `searchTerm`; nuovi
  // filtri vanno aggiunti qui oltre che nel useMemo sopra, così il copy
  // "nessun risultato" non viene mai scambiato per "vuoto assoluto".
  const hasActiveFilter = searchTerm.trim().length > 0;

  return (
    <PageGate readPermission="activity.read">
      {() => (
        <section
          className={styles.businesses}
          aria-labelledby="businesses-title"
          data-view-mode={activeTab === "groups" ? "list" : viewMode}
        >
          {activeTab === "activities" ? (
            <>
              <BusinessLocationDrawer
                open={isCreateOpen}
                mode="create"
                tenantName={selectedTenant?.name}
                values={createForm}
                errors={createErrors}
                loading={isCreating}
                onFieldChange={handleCreateFieldChange}
                onCoverChange={handleCreateCoverChange}
                slugState={createSlugState}
                onPickSlugSuggestion={handleCreatePickSlugSuggestion}
                onSubmit={handleAdd}
                onClose={() => {
                  setIsCreateOpen(false);
                  setCreateSlugState({ type: "idle" });
                  resetCreateState();
                }}
                seatOffer={seatOffer}
                onOpenPlanDrawer={openPlanUpgradeFromOffer}
              />

              <BusinessList
                businesses={filteredBusinesses}
                isLoading={showInitialSkeleton}
                hasActiveFilter={hasActiveFilter}
                onClearFilters={() => setSearchTerm("")}
                viewMode={viewMode}
                onEdit={handleEditClick}
                onDelete={canDelete ? handleDelete : undefined}
                activeCatalogsMap={activeCatalogsMap}
                catalogsStatus={catalogsStatus}
                // «Gestisci» apre la pagina della sede (§19.5): il drawer da
                // 900 non esiste più.
                onManageAvailability={id =>
                  navigate(`/business/${businessId}/locations/${id}/disponibilita`)
                }
                onCreateClick={canCreate ? handleAddActivity : undefined}
                pendingReservationsMap={pendingReservationsMap}
              />

            </>
          ) : (
            <ActivityGroupsSection
              searchQuery={searchTerm}
              canWrite={canManageGroups}
              createRequest={groupCreateRequest}
            />
          )}

          <DeleteActivityDialog
            isOpen={deleteTarget !== null}
            activity={deleteTarget}
            businessId={businessId ?? ""}
            tenantId={tenantId ?? ""}
            onClose={closeDeleteModal}
            onDeleted={handleDeleted}
          />
        </section>
      )}
    </PageGate>
  );
}

