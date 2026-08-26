import { useEffect, useMemo, useState, useCallback } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getActivities,
  updateActivity,
  uploadActivityCover,
  deleteActivityAtomic,
  DeleteActivityError,
} from "@/services/supabase/activities";
import { getActiveCatalogForActivities } from "@/services/supabase/activeCatalog";
import type { CatalogFetchStatus } from "@/utils/activeCatalogStatus";
import type {
  ActiveCatalogMeta,
  BusinessWithCapabilities,
  BusinessFormValues,
  SlugInlineState,
} from "@/types/Businesses";

import Text from "@components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { usePageHeader } from "@/context/usePageHeader";
import {
  workspaceRoleIsOwner as isOwner,
  workspaceRoleIsAdmin as isAdmin,
} from "@/utils/workspaceRole";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

import { BusinessList } from "@/components/Businesses/BusinessList/BusinessList";
import { ActivityVisibilityDrawer } from "@/pages/Operativita/Attivita/components/ActivityVisibilityDrawer/ActivityVisibilityDrawer";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityGroupsSection } from "@/components/Businesses/ActivityGroupsSection/ActivityGroupsSection";

import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import {
  useCreateActivity,
  getSlugSuggestions,
  isReservedSlug,
  validateBusinessForm,
} from "@/hooks/useCreateActivity";

import { sanitizeSlugForSave } from "@/utils/slugify";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";

// Tipi importati da "@/types/Businesses"

import { LayoutGrid, List as ListIcon } from "lucide-react";
import styles from "./Businesses.module.scss";
import { BusinessLocationDrawer } from "@/components/Businesses/BusinessLocationDrawer/BusinessLocationDrawer";
import { Button } from "@/components/ui";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import ModalLayout, {
  ModalLayoutContent,
  ModalLayoutFooter,
  ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [seatLimitDialogOpen, setSeatLimitDialogOpen] = useState(false);

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

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BusinessFormValues | null>(null);
  const [editErrors, setEditErrors] = useState<
    Partial<Record<keyof BusinessFormValues, string>>
  >({});
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBusiness, setEditingBusiness] =
    useState<BusinessWithCapabilities | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ======================================
  // STATE: Drawer disponibilità prodotti
  // ======================================
  const [visibilityDrawerTarget, setVisibilityDrawerTarget] = useState<{
    activityId: string;
    activityName: string;
  } | null>(null);

  // ======================================
  // SLUGS
  // ======================================
  const [editSlugState, setEditSlugState] = useState<SlugInlineState>({
    type: "idle",
  });

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
        getActiveCatalogForActivities(data.map((b) => b.id))
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

  // Seat limit safety net (dialog at click should pre-empt this)
  const guardSeatLimit = useCallback(() => {
    if (selectedTenant && businesses.length >= selectedTenant.paid_seats) {
      const paidSeats = selectedTenant.paid_seats;
      const seatsLabel = paidSeats === 1 ? "una sede" : `${paidSeats} sedi`;
      if (isOwner(userRole)) {
        showToast({
          message: `Hai raggiunto il limite di sedi. Il tuo piano include ${seatsLabel}. Apri la pagina abbonamento per espandere.`,
          type: "error",
          duration: 4000,
        });
        navigate(`/business/${businessId}/subscription`);
      } else if (isAdmin(userRole)) {
        showToast({
          message: `Hai raggiunto il limite di sedi. Il piano include ${seatsLabel}. Solo il proprietario può espandere l'abbonamento.`,
          type: "error",
          duration: 4000,
        });
      } else {
        showToast({
          message: `Hai raggiunto il limite di sedi. Il piano include ${seatsLabel}. Contatta il proprietario.`,
          type: "error",
          duration: 4000,
        });
      }
      return false;
    }
    return true;
  }, [
    selectedTenant,
    businesses.length,
    userRole,
    showToast,
    navigate,
    businessId,
  ]);

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

  const headerActions = useMemo(() => {
    const cta =
      activeTab === "activities" ? (
        canCreate ? (
          <Button
            variant="primary"
            disabled={!canEdit}
            onClick={() => {
              if (!canEdit) {
                showToast({
                  message: subscriptionInactiveMessage(),
                  type: "error",
                });
                return;
              }
              if (
                selectedTenant &&
                businesses.length >= selectedTenant.paid_seats
              ) {
                setSeatLimitDialogOpen(true);
                return;
              }
              setIsCreateOpen(true);
              setCreateSlugState({ type: "idle" });
            }}
            className={styles.toolbarCta}
          >
            Aggiungi sede
          </Button>
        ) : null
      ) : canManageGroups ? (
        <Button
          variant="primary"
          disabled={!canEdit}
          onClick={() => {
            if (!canEdit) {
              showToast({
                message: subscriptionInactiveMessage(),
                type: "error",
              });
              return;
            }
            window.dispatchEvent(new CustomEvent("open-group-drawer"));
          }}
          className={styles.toolbarCta}
        >
          Nuovo gruppo
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
  }, [
    activeTab,
    canEdit,
    canCreate,
    canManageGroups,
    selectedTenant,
    businesses.length,
    showToast,
    subscriptionInactiveMessage,
    searchTerm,
    viewMode,
    handleViewChange,
    setCreateSlugState,
  ]);

  usePageHeader({
    leading,
    actions: headerActions,
    sticky: true,
  });

  // ======================================
  // CALLBACK: delete business
  // ======================================
  const handleDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
    setShowDeleteModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);

    try {
      const result = await deleteActivityAtomic(deleteTargetId);

      await refreshBusinesses();

      const disabled = result.affected_schedules_disabled ?? 0;
      const message =
        disabled === 1
          ? "Sede eliminata. 1 regola di programmazione è stata spostata in bozze perché senza target."
          : disabled > 1
            ? `Sede eliminata. ${disabled} regole di programmazione sono state spostate in bozze perché senza target.`
            : "Sede eliminata con successo.";
      const duration = disabled > 0 ? 4000 : 2500;

      showToast({ message, type: "success", duration });

      // Promemoria: se il piano copre più sedi di quante ne restano,
      // suggerisci all'owner di ridurre le sedi per pagare meno.
      // Solo l'owner può modificare l'abbonamento (coerente col create-gate).
      const remainingSeats = businesses.length - 1;
      if (
        selectedTenant &&
        isOwner(userRole) &&
        selectedTenant.paid_seats > remainingSeats
      ) {
        showToast({
          message: `Sede eliminata. Il piano copre ${selectedTenant.paid_seats} sedi, ora ne hai ${remainingSeats}.`,
          type: "info",
          duration: 6000,
          actionLabel: "Modifica piano",
          onAction: () => navigate(`/business/${businessId}/subscription`),
        });
      }
    } catch (e) {
      console.error("Errore durante l'eliminazione della sede:", e);
      let message = "Errore durante l'eliminazione della sede.";
      if (e instanceof DeleteActivityError) {
        if (e.code === "FK_VIOLATION") {
          // Safety net: dopo la migration analytics_events CASCADE,
          // questo branch resta per future FK NO ACTION non gestite.
          message =
            "Impossibile eliminare la sede: ci sono dati collegati che impediscono l'eliminazione. Contatta il supporto.";
        } else if (e.code === "INSUFFICIENT_PERMISSION") {
          message = "Non hai i permessi per eliminare questa sede.";
        } else if (e.code === "AUTH_EXPIRED") {
          message = "Sessione scaduta. Effettua di nuovo il login.";
        }
      }
      showToast({ message, type: "error", duration: 3500 });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteTargetId(null);
    }
  }, [
    deleteTargetId,
    refreshBusinesses,
    showToast,
    selectedTenant,
    userRole,
    businesses,
    navigate,
    businessId,
  ]);

  // ======================================
  // CALLBACK: navigazione lista
  // ======================================

  const handleOpenReviews = useCallback(
    (id: string) => navigate(`/business/${tenantId}/reviews?businessId=${id}`),
    [navigate, tenantId],
  );

  // ======================================
  // CALLBACK: edit business
  // ======================================
  const handleEditClick = useCallback(
    (business: BusinessWithCapabilities) => {
      if (!canEdit) {
        showToast({ message: subscriptionInactiveMessage(), type: "error" });
        return;
      }
      setEditingBusiness(business);
      setEditingId(business.id);
      setEditForm({
        name: business.name,
        city: business.city ?? "",
        address: business.address ?? "",
        street_number: business.street_number ?? "",
        postal_code: business.postal_code ?? "",
        province: business.province ?? "",
        slug: business.slug,
        coverPreview: business.cover_image ?? null,
      });
      setEditCoverFile(null);
      setIsEditOpen(true);
      setEditSlugState({ type: "idle" });
    },
    [canEdit, showToast, subscriptionInactiveMessage],
  );

  const handleEditFieldChange = useCallback(
    <K extends keyof BusinessFormValues>(
      field: K,
      value: BusinessFormValues[K],
    ) => {
      setEditForm((prev) => {
        if (!prev) return prev;
        if (field === "slug") {
          const next = value as string;

          if (
            editingBusiness &&
            sanitizeSlugForSave(next) !== editingBusiness.slug
          ) {
            setEditSlugState({ type: "warning" });
          } else {
            setEditSlugState({ type: "idle" });
          }

          return { ...prev, slug: next };
        }

        return { ...prev, [field]: value };
      });
    },
    [editingBusiness],
  );

  const handleEditCoverChange = useCallback((file: File | null) => {
    if (!file) {
      setEditCoverFile(null);
      setEditForm((prev) => (prev ? { ...prev, coverPreview: null } : prev));
      return;
    }

    setEditCoverFile(file);

    const url = URL.createObjectURL(file);
    setEditForm((prev) => (prev ? { ...prev, coverPreview: url } : prev));
  }, []);

  const handleSaveEdit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!editingId || !editForm || !editingBusiness) return;

      const errors = validateBusinessForm(editForm);
      setEditErrors(errors);

      if (Object.keys(errors).length > 0) {
        showToast({
          message: "Compila tutti i campi obbligatori.",
          type: "info",
          duration: 2000,
        });
        return;
      }

      // Slug pulizia
      const cleanedSlug = sanitizeSlugForSave(editForm.slug);

      if (isReservedSlug(cleanedSlug)) {
        setEditErrors((prev) => ({
          ...prev,
          slug: "Questo slug è riservato. Scegline un altro.",
        }));
        showToast({
          message: "Slug riservato: scegli un altro valore.",
          type: "error",
          duration: 2500,
        });
        return;
      }

      if (!cleanedSlug) {
        showToast({
          message: "Inserisci uno slug valido.",
          type: "info",
          duration: 2500,
        });
        return;
      }

      // Controllo unicità slug
      const slugAlreadyUsed = businesses.some(
        (b) => b.id !== editingId && b.slug === cleanedSlug,
      );

      if (slugAlreadyUsed) {
        const suggestions = await getSlugSuggestions(
          cleanedSlug,
          editForm?.city,
        );
        setEditSlugState({ type: "conflict", suggestions });
        return;
      }

      setIsEditing(true);

      try {
        await updateActivity(editingId, tenantId!, {
          name: editForm.name,
          city: editForm.city,
          address: editForm.address,
          street_number: editForm.street_number || null,
          postal_code: editForm.postal_code || null,
          province: editForm.province || null,
          slug: cleanedSlug,
        });

        if (editCoverFile) {
          const compressedCover = await compressImage(
            editCoverFile,
            COMPRESS_PROFILES.cover,
          );
          await uploadActivityCover(
            { id: editingId, slug: editForm.slug, tenant_id: tenantId! },
            compressedCover,
          );
        }

        // RESET
        setIsEditOpen(false);
        setEditingId(null);
        setEditingBusiness(null);
        setEditForm(null);
        setEditErrors({});
        setEditCoverFile(null);

        await refreshBusinesses();
      } catch (err) {
        console.error("Errore aggiornamento business:", err);
        showToast({
          message: "Errore durante l'aggiornamento.",
          type: "error",
          duration: 2500,
        });
      } finally {
        setIsEditing(false);
        setEditSlugState({ type: "idle" });
      }
    },
    [
      editingId,
      editForm,
      editCoverFile,
      editingBusiness,
      businesses,
      refreshBusinesses,
      showToast,
    ],
  );

  function BusinessCardSkeleton() {
    return (
      <div className={styles.skeletonCard}>
        {/* Top */}
        <div className={styles.skeletonTop}>
          <Skeleton width="80px" height="80px" radius="8px" />
          <div className={styles.skeletonInfo}>
            <Skeleton width="140px" height="16px" />
            <Skeleton width="90px" height="14px" />
            <Skeleton width="150px" height="14px" />
          </div>
          <Skeleton width="70px" height="70px" radius="8px" />
        </div>

        {/* Bottom actions */}
        <div className={styles.skeletonActions}>
          <Skeleton height="36px" radius="6px" />
          <Skeleton height="36px" radius="6px" />
          <Skeleton height="36px" radius="6px" />
          <Skeleton height="36px" radius="6px" />
        </div>
      </div>
    );
  }

  // ======================================
  // RENDER
  // ======================================
  const showInitialSkeleton = isLoadingBusinesses && businesses.length === 0;

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
              />

              <BusinessLocationDrawer
                open={isEditOpen}
                mode="edit"
                values={editForm}
                errors={editErrors}
                loading={isEditing}
                onFieldChange={handleEditFieldChange}
                onCoverChange={handleEditCoverChange}
                slugState={editSlugState}
                onPickSlugSuggestion={(slug) => {
                  setEditForm((prev) => (prev ? { ...prev, slug } : prev));
                  if (editingBusiness && slug !== editingBusiness.slug) {
                    setEditSlugState({ type: "warning" });
                  } else {
                    setEditSlugState({ type: "idle" });
                  }
                }}
                onSubmit={handleSaveEdit}
                onClose={() => {
                  setIsEditOpen(false);
                  setEditingId(null);
                  setEditingBusiness(null);
                  setEditForm(null);
                  setEditCoverFile(null);
                  setEditSlugState({ type: "idle" });
                  setEditErrors({});
                }}
              />

              {/* Lista attività */}
              {showInitialSkeleton ? (
                <>
                  <BusinessCardSkeleton />
                  <BusinessCardSkeleton />
                  <BusinessCardSkeleton />
                </>
              ) : (
                <>
                  <BusinessList
                    businesses={filteredBusinesses}
                    hasActiveFilter={hasActiveFilter}
                    viewMode={viewMode}
                    onEdit={handleEditClick}
                    onDelete={canDelete ? handleDelete : undefined}
                    onOpenReviews={handleOpenReviews}
                    activeCatalogsMap={activeCatalogsMap}
                    catalogsStatus={catalogsStatus}
                    onManageAvailability={(id, name) =>
                      setVisibilityDrawerTarget({
                        activityId: id,
                        activityName: name,
                      })
                    }
                    onCreateClick={
                      canCreate ? () => setIsCreateOpen(true) : undefined
                    }
                  />

                  <ActivityVisibilityDrawer
                    open={visibilityDrawerTarget !== null}
                    onClose={() => setVisibilityDrawerTarget(null)}
                    activityId={visibilityDrawerTarget?.activityId ?? ""}
                    activityName={visibilityDrawerTarget?.activityName ?? ""}
                  />
                </>
              )}
            </>
          ) : (
            <ActivityGroupsSection
              searchQuery={searchTerm}
              canWrite={canManageGroups}
            />
          )}

          <ModalLayout
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false);
              setDeleteTargetId(null);
            }}
            width="xs"
            height="fit"
          >
            <ModalLayoutHeader>
              <div className={styles.headerLeft}>
                <Text as="h2" variant="title-sm" weight={700}>
                  Elimina sede
                </Text>
              </div>
            </ModalLayoutHeader>

            <ModalLayoutContent>
              <Text variant="body">
                Sei sicuro di voler eliminare questa sede? L'operazione non è
                reversibile.
              </Text>
            </ModalLayoutContent>

            <ModalLayoutFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTargetId(null);
                }}
              >
                Annulla
              </Button>

              <Button variant="primary" onClick={confirmDelete}>
                {isDeleting ? "Eliminazione in corso..." : "Elimina"}
              </Button>
            </ModalLayoutFooter>
          </ModalLayout>

          <ModalLayout
            isOpen={seatLimitDialogOpen}
            onClose={() => setSeatLimitDialogOpen(false)}
            width="sm"
            height="fit"
          >
            <ModalLayoutHeader>
              <Text as="h2" variant="title-sm" weight={700}>
                Hai raggiunto il limite di sedi
              </Text>
            </ModalLayoutHeader>

            <ModalLayoutContent>
              <Text variant="body">
                {(() => {
                  const paidSeats = selectedTenant?.paid_seats ?? 0;
                  const seatsLabel =
                    paidSeats === 1 ? "una sede" : `${paidSeats} sedi`;
                  if (isOwner(userRole))
                    return `Il tuo piano include ${seatsLabel}. Per aggiungerne altre, espandi il piano dalla pagina abbonamento.`;
                  if (isAdmin(userRole))
                    return `Il piano include ${seatsLabel}. Solo il proprietario può espandere l'abbonamento.`;
                  return `Il piano include ${seatsLabel}. Contatta il proprietario per aggiungere altre sedi.`;
                })()}
              </Text>
            </ModalLayoutContent>

            <ModalLayoutFooter>
              {isOwner(userRole) ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setSeatLimitDialogOpen(false)}
                  >
                    Annulla
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSeatLimitDialogOpen(false);
                      navigate(`/business/${businessId}/subscription`);
                    }}
                  >
                    Apri abbonamento
                  </Button>
                </>
              ) : isAdmin(userRole) ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setSeatLimitDialogOpen(false)}
                  >
                    Chiudi
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSeatLimitDialogOpen(false);
                      navigate(`/business/${businessId}/subscription`);
                    }}
                  >
                    Apri abbonamento
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => setSeatLimitDialogOpen(false)}
                >
                  Ho capito
                </Button>
              )}
            </ModalLayoutFooter>
          </ModalLayout>
        </section>
      )}
    </PageGate>
  );
}
