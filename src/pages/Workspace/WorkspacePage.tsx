import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { getProfile } from "@/services/supabase/profile";
import { greeting } from "@/utils/crm/crmHome";
import Text from "@/components/ui/Text/Text";
import BusinessCard, { type BusinessCardSize } from "@/components/Businesses/BusinessCard";
import { CreateBusinessDrawer } from "@/components/Businesses/CreateBusinessDrawer";
import { CreateBusinessWizard } from "@/components/Businesses/CreateBusinessWizard/CreateBusinessWizard";
import { InviteModal, PendingInviteData } from "@/components/Businesses/InviteModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { DeleteTenantDialog } from "@/components/Businesses/DeleteTenantDialog";
import {
    leaveTenant,
    deleteTenantSoft,
    restoreTenant,
    getDeletedTenants,
    purgeTenantNow,
    getTenantFiscalProfile
} from "@/services/supabase/tenants";
import type { DeletedTenant } from "@/services/supabase/tenants";
import type { V2Tenant } from "@/types/tenant";
import { Button } from "@/components/ui/Button/Button";
import { listMyPendingInvites } from "@/services/supabase/team";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./WorkspacePage.module.scss";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import type { BusinessSubtype } from "@/constants/verticalTypes";

function countByTenant(rows: { tenant_id: string }[] | null): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
        counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    return counts;
}

interface LocationRow {
    tenant_id: string;
    cover_image: string | null;
    city: string | null;
}

/** Per attività: la prima copertina e la prima città fra le sedi (in ordine di creazione). */
function firstByTenant(rows: LocationRow[] | null, key: "cover_image" | "city"): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows ?? []) {
        const value = row[key];
        if (value && !out[row.tenant_id]) out[row.tenant_id] = value;
    }
    return out;
}

const PURGE_AFTER_DAYS = 30;

function formatDay(date: Date): string {
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

export default function WorkspacePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { showToast } = useToast();
    const resumeId = searchParams.get("resume");

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
    const [productCounts, setProductCounts] = useState<Record<string, number>>({});
    const [catalogCounts, setCatalogCounts] = useState<Record<string, number>>({});
    const [covers, setCovers] = useState<Record<string, string>>({});
    const [cities, setCities] = useState<Record<string, string>>({});
    const [firstName, setFirstName] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<{ id: string; name: string; logo_url?: string | null; business_subtype?: BusinessSubtype | null } | null>(null);
    const [pendingInvites, setPendingInvites] = useState<PendingInviteData[]>([]);
    const [activeInvite, setActiveInvite] = useState<PendingInviteData | null>(null);
    const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletedTenants, setDeletedTenants] = useState<DeletedTenant[]>([]);
    const [deletedSectionOpen, setDeletedSectionOpen] = useState(false);
    const [purgeTarget, setPurgeTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const shownNotificationIdsRef = useRef<Set<string>>(new Set());

    // T17 WS1: niente barra di pagina; il saluto col nome sta in pagina.
    useEffect(() => {
        if (!user?.id) return;
        const load = () =>
            getProfile(user.id)
                .then(p => setFirstName(p?.first_name ?? null))
                .catch(() => {});
        load();
        window.addEventListener("profile:updated", load);
        return () => window.removeEventListener("profile:updated", load);
    }, [user?.id]);

    useEffect(() => {
        if (!user) return;

        const fetchInvites = async () => {
            let rows;
            try {
                rows = await listMyPendingInvites();
            } catch {
                setPendingInvites([]);
                return;
            }

            setPendingInvites(
                rows.map(r => ({
                    id: r.membership_id,
                    invite_token: r.invite_token ?? "",
                    effective_role: r.effective_role,
                    tenant_id: r.tenant_id,
                    tenant_name: r.tenant_name,
                    inviter_email: r.inviter_email ?? null,
                    activity_names: r.activity_names ?? [],
                }))
            );
        };

        const fetchNotifications = async () => {
            const { data: notifications } = await supabase
                .from("notifications")
                .select("*")
                .is("read_at", null)
                .order("created_at", { ascending: false });

            if (!notifications || notifications.length === 0) return;

            notifications.forEach(n => {
                if (n.event_type === "ownership_received") {
                    if (shownNotificationIdsRef.current.has(n.id)) return;
                    shownNotificationIdsRef.current.add(n.id);
                    showToast({
                        type: "info",
                        message: `Sei diventato proprietario di ${(n.data as { tenant_name?: string })?.tenant_name ?? "un tenant"}`
                    });
                }
            });

            const ids = notifications.map(n => n.id);
            await supabase
                .from("notifications")
                .update({ read_at: new Date().toISOString() })
                .in("id", ids);
        };

        fetchInvites();
        fetchNotifications();
    }, [user?.id]);

    const loadTenants = async () => {
        if (!user) return;
        const [activeResult, deletedResult] = await Promise.all([
            supabase
                .from("user_tenants_view")
                .select(
                    "id, owner_user_id, name, vertical_type, business_subtype, created_at, user_role, logo_url, plan, subscription_status, trial_until, stripe_customer_id, stripe_subscription_id, paid_seats"
                )
                .order("created_at", { ascending: true }),
            getDeletedTenants().catch(() => [] as DeletedTenant[])
        ]);
        setTenants((activeResult.data as V2Tenant[]) ?? []);
        setDeletedTenants(deletedResult);
        setLoading(false);
    };

    useEffect(() => {
        loadTenants();
    }, [user?.id]);

    // Batch-fetch stats for all tenants in parallel
    useEffect(() => {
        if (tenants.length === 0) return;
        const ids = tenants.map(t => t.id);

        Promise.all([
            // Copertina e città vengono dalle sedi: `activities.cover_image` e
            // `city` esistono già, nessun dato nuovo (T17).
            supabase
                .from("activities")
                .select("tenant_id, cover_image, city")
                .in("tenant_id", ids)
                .order("created_at", { ascending: true }),
            supabase.from("products").select("tenant_id").in("tenant_id", ids),
            supabase.from("catalogs").select("tenant_id").in("tenant_id", ids)
        ]).then(([loc, prod, cat]) => {
            setLocationCounts(countByTenant(loc.data));
            setCovers(firstByTenant(loc.data as LocationRow[] | null, "cover_image"));
            setCities(firstByTenant(loc.data as LocationRow[] | null, "city"));
            setProductCounts(countByTenant(prod.data));
            setCatalogCounts(countByTenant(cat.data));
        });
    }, [tenants.length]);

    const handleSelect = (id: string) => {
        localStorage.setItem(STORAGE_KEY, id);
        // L'ingresso lo decide l'indice dell'azienda (D1): sede o Panoramica.
        navigate(`/business/${id}`);
    };

    const handleInviteAccepted = (tenantId: string) => {
        setActiveInvite(null);
        localStorage.setItem(STORAGE_KEY, tenantId);
        navigate(`/business/${tenantId}`);
    };

    const handleInviteDeclined = (inviteId: string) => {
        setActiveInvite(null);
        setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    };

    const handleLeaveRequest = (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;
        setLeaveTarget({ id, name: tenant.name });
    };

    const handleEditRequest = (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;
        setEditTarget({ id, name: tenant.name, logo_url: tenant.logo_url, business_subtype: tenant.business_subtype });
    };

    const handleEditSuccess = async () => {
        await loadTenants();
        showToast({ type: "success", message: "Attività aggiornata" });
    };

    const handleDeleteRequest = (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;
        setDeleteTarget({ id, name: tenant.name });
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        await deleteTenantSoft(deleteTarget.id);
        setDeleteTarget(null);
        await loadTenants();
        showToast({ type: "success", message: `"${deleteTarget.name}" spostata nell'area in eliminazione.` });
    };

    const handleActivate = (id: string) => {
        setSearchParams({ resume: id });
    };

    // resumeTenant must carry the fiscal/address columns, which user_tenants_view
    // does NOT expose. We hydrate them from the tenants table so the billing step
    // can be skipped (data present) or pre-filled (data partial) correctly.
    const [resumeTenant, setResumeTenant] = useState<V2Tenant | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!resumeId) {
            setResumeTenant(null);
            return;
        }
        const base = tenants.find(t => t.id === resumeId) ?? null;
        // Guard: ignore resume for tenants that are already activated (defensive
        // against manually-crafted URLs).
        if (!base || base.stripe_subscription_id) {
            setResumeTenant(null);
            return;
        }
        getTenantFiscalProfile(resumeId)
            .then(fiscal => {
                if (!cancelled) setResumeTenant({ ...base, ...fiscal });
            })
            .catch(() => {
                // Fallback: open with list data only (billing step shown empty).
                if (!cancelled) setResumeTenant(base);
            });
        return () => {
            cancelled = true;
        };
    }, [resumeId, tenants]);

    const closeResumeWizard = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("resume");
        setSearchParams(next, { replace: true });
    };

    const purgeDateOf = (deletedAt: string): Date => {
        const purgeDate = new Date(deletedAt);
        purgeDate.setDate(purgeDate.getDate() + PURGE_AFTER_DAYS);
        return purgeDate;
    };

    const getDaysLeft = (deletedAt: string): number =>
        Math.max(0, Math.ceil((purgeDateOf(deletedAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const handleRestore = async (tenantId: string) => {
        setRestoringId(tenantId);
        try {
            await restoreTenant(tenantId);
            await loadTenants();
        } catch (err) {
            showToast({
                type: "error",
                message: err instanceof Error ? err.message : "Errore durante il ripristino."
            });
        } finally {
            setRestoringId(null);
        }
    };

    const handlePurgeConfirm = async (): Promise<boolean> => {
        if (!purgeTarget) return false;
        setActionInProgressId(purgeTarget.id);
        try {
            await purgeTenantNow(purgeTarget.id);
            setDeletedTenants(prev => prev.filter(t => t.id !== purgeTarget.id));
            return true;
        } catch (err) {
            if (err instanceof Error && err.message.includes("Attività non trovata")) {
                await loadTenants();
            }
            showToast({
                type: "error",
                message: err instanceof Error ? err.message : "Errore durante l'eliminazione."
            });
            return false;
        } finally {
            setActionInProgressId(null);
        }
    };

    const handleLeaveConfirm = async (): Promise<boolean> => {
        if (!leaveTarget) return false;
        try {
            await leaveTenant(leaveTarget.id);
            setTenants(prev => prev.filter(t => t.id !== leaveTarget.id));
            return true;
        } catch {
            return false;
        }
    };

    if (loading) {
        return null;
    }

    // 1 attività: card grande; 2: affiancate; da 3: griglia compatta (WS1).
    const cardSize: BusinessCardSize = tenants.length === 1 ? "hero" : tenants.length === 2 ? "pair" : "compact";
    // Con molte attività (o molte eliminate) la sezione parte chiusa.
    const deletedCollapsible = tenants.length >= 3 || deletedTenants.length > 2;
    const deletedOpen = !deletedCollapsible || deletedSectionOpen;

    return (
        <div className={styles.page}>
            {/* T17 WS1: colonna centrata, saluto grande su fondo indigo leggero,
                «+ Nuova attività» accanto. */}
            <div className={styles.container}>
                <div className={styles.hello}>
                    <Text as="h1" variant="display" className={styles.helloTitle}>
                        {firstName ? `${greeting(new Date())}, ${firstName}` : greeting(new Date())}
                    </Text>
                    <Button
                        variant="secondary"
                        leftIcon={<Plus size={16} aria-hidden />}
                        onClick={() => setDrawerOpen(true)}
                        className={styles.helloAction}
                    >
                        Nuova attività
                    </Button>
                </div>

                {pendingInvites.length > 0 && (
                    <div className={styles.pendingSection}>
                        <Text variant="body" weight={600}>
                            {pendingInvites.length === 1
                                ? "Hai un invito in attesa"
                                : `Hai ${pendingInvites.length} inviti in attesa`}
                        </Text>
                        <div className={styles.pendingList}>
                            {pendingInvites.map(invite => (
                                <div key={invite.id} className={styles.pendingCard}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Sei stato invitato a partecipare a{" "}
                                        <strong>{invite.tenant_name}</strong>
                                        {invite.inviter_email && (
                                            <>
                                                {" "}
                                                da <strong>{invite.inviter_email}</strong>
                                            </>
                                        )}
                                    </Text>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setActiveInvite(invite)}
                                    >
                                        Visualizza invito
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {tenants.length === 0 ? (
                    <div className={styles.empty}>
                        <Text variant="body" colorVariant="muted">
                            Non hai ancora un&apos;attività. Creane una per iniziare.
                        </Text>
                        <Button variant="primary" leftIcon={<Plus size={16} aria-hidden />} onClick={() => setDrawerOpen(true)}>
                            Nuova attività
                        </Button>
                    </div>
                ) : (
                    <div className={`${styles.grid} ${styles[`grid-${cardSize}`]}`}>
                        {tenants.map(tenant => (
                            <BusinessCard
                                key={tenant.id}
                                tenant={tenant}
                                size={cardSize}
                                stats={{
                                    locations: locationCounts[tenant.id] ?? 0,
                                    catalogs: catalogCounts[tenant.id] ?? 0,
                                    products: productCounts[tenant.id] ?? 0
                                }}
                                coverUrl={covers[tenant.id] ?? null}
                                city={cities[tenant.id] ?? null}
                                onSelect={handleSelect}
                                onEdit={handleEditRequest}
                                onOpenSettings={id => navigate(`/business/${id}/settings`)}
                                onOpenSubscription={id => navigate(`/business/${id}/settings/abbonamento`)}
                                onLeave={handleLeaveRequest}
                                onActivate={handleActivate}
                                onDelete={handleDeleteRequest}
                            />
                        ))}
                    </div>
                )}

                {deletedTenants.length > 0 && (
                    <section className={styles.deletedSection} aria-label="In eliminazione">
                        {deletedCollapsible ? (
                            <button
                                type="button"
                                className={styles.deletedToggle}
                                aria-expanded={deletedOpen}
                                onClick={() => setDeletedSectionOpen(o => !o)}
                            >
                                <Text as="span" variant="body-sm" weight={600}>
                                    {deletedTenants.length} in eliminazione
                                </Text>
                                <Text as="span" variant="body-sm" colorVariant="muted">
                                    {deletedOpen ? "Nascondi" : "Mostra"}
                                </Text>
                            </button>
                        ) : (
                            <Text as="h2" variant="body-sm" weight={600} className={styles.deletedTitle}>
                                In eliminazione
                            </Text>
                        )}

                        {deletedOpen && (
                            <ul className={styles.deletedList}>
                                {[...deletedTenants]
                                    .sort(
                                        (a, b) =>
                                            new Date(b.deleted_at).getTime() -
                                            new Date(a.deleted_at).getTime()
                                    )
                                    .map(row => {
                                        const daysLeft = getDaysLeft(row.deleted_at);
                                        const isRestoring = restoringId === row.id;
                                        const isPurging = actionInProgressId === row.id;
                                        return (
                                            <li
                                                key={row.id}
                                                className={`${styles.deletedRow} ${isRestoring || isPurging ? styles.deletedRowInProgress : ""}`}
                                            >
                                                <div className={styles.deletedInfo}>
                                                    <Text as="span" variant="body" weight={600}>
                                                        {row.name}
                                                    </Text>
                                                    <Text
                                                        as="span"
                                                        variant="body-sm"
                                                        colorVariant={daysLeft <= 3 ? "error" : "muted"}
                                                    >
                                                        {`Eliminata il ${formatDay(new Date(row.deleted_at))} · `}
                                                        {daysLeft === 0
                                                            ? "cancellazione definitiva in corso"
                                                            : `cancellata definitivamente il ${formatDay(purgeDateOf(row.deleted_at))}`}
                                                    </Text>
                                                </div>
                                                <div className={styles.deletedActions}>
                                                    {daysLeft > 0 && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleRestore(row.id)}
                                                            loading={isRestoring}
                                                        >
                                                            Ripristina
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setPurgeTarget({ id: row.id, name: row.name })}
                                                        disabled={isPurging}
                                                    >
                                                        Elimina ora
                                                    </Button>
                                                </div>
                                            </li>
                                        );
                                    })}
                            </ul>
                        )}
                    </section>
                )}
            </div>

            <CreateBusinessWizard
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            />

            <CreateBusinessWizard
                open={resumeTenant !== null}
                onClose={closeResumeWizard}
                mode="resume"
                existingTenant={resumeTenant}
            />

            <CreateBusinessDrawer
                open={editTarget !== null}
                onClose={() => setEditTarget(null)}
                tenantData={editTarget}
                onSuccess={handleEditSuccess}
            />

            <ConfirmDialog
                isOpen={leaveTarget !== null}
                onClose={() => setLeaveTarget(null)}
                onConfirm={handleLeaveConfirm}
                title={`Lasciare "${leaveTarget?.name}"?`}
                message="Non avrai più accesso a questa attività. Potrai essere reinvitato dal proprietario."
                confirmLabel="Lascia attività"
            />

            <ConfirmDialog
                isOpen={purgeTarget !== null}
                onClose={() => setPurgeTarget(null)}
                onConfirm={handlePurgeConfirm}
                title="Eliminare definitivamente questa attività?"
                message="Questa operazione è irreversibile. Tutti i dati dell'attività verranno cancellati definitivamente."
                confirmLabel="Elimina definitivamente"
            />

            <DeleteTenantDialog
                isOpen={deleteTarget !== null}
                tenantName={deleteTarget?.name ?? ""}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
            />

            <InviteModal
                invite={activeInvite}
                onClose={() => setActiveInvite(null)}
                onAccepted={handleInviteAccepted}
                onDeclined={handleInviteDeclined}
            />
        </div>
    );
}
