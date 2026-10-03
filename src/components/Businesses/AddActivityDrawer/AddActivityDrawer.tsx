import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { type SeatLimitInfo } from "@/services/supabase/activities";
import { getPlanByCode } from "@/services/supabase/plans";
import { listPlanPrices } from "@/services/supabase/planPrices";
import { getTenantBillingInterval } from "@/services/supabase/tenants";
import { nextSeatOffer } from "@/utils/pricing";
import { priceCentsFor, DEFAULT_BILLING_INTERVAL } from "@/utils/planPricing";
import type { Plan, PlanPrice, BillingInterval } from "@/types/plan";
import type { V2Activity } from "@/types/activity";
import { workspaceRoleIsAdmin as isAdmin, workspaceRoleIsOwner as isOwner } from "@/utils/workspaceRole";
import { useCreateActivity } from "@/hooks/useCreateActivity";
import { useAddActivityGate } from "@/hooks/useAddActivityGate";
import { refreshActivitiesCache } from "@/hooks/activitiesCache";
import {
    BusinessLocationDrawer,
    type SeatLimitOffer
} from "@/components/Businesses/BusinessLocationDrawer/BusinessLocationDrawer";

function formatDateIt(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export interface AddActivityDrawerProps {
    open: boolean;
    onClose: () => void;
    /** Le sedi già create: con le sedi pagate decide se aprire il form o l'offerta. */
    usedSeats: number;
    /** Dopo la creazione (l'elenco delle sedi in cache è già riletto). */
    onCreated?: (activity: V2Activity) => void | Promise<void>;
}

/**
 * Il flusso «Aggiungi sede», uno solo per Sedi e per il selettore di sede
 * nell'header (§51.7): form di creazione, oppure l'offerta per una sede in
 * più quando le sedi pagate sono finite. Il cancello d'ingresso (permesso,
 * abbonamento) è `useAddActivityGate`, chiamato da chi apre.
 *
 * Piano, prezzi e intervallo si leggono al montaggio: chi lo monta su ogni
 * pagina (l'header) lo monta solo dopo il primo gesto.
 */
export function AddActivityDrawer({ open, onClose, usedSeats, onCreated }: AddActivityDrawerProps) {
    const tenantId = useTenantId();
    const { selectedTenant, userRole } = useTenant();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { tryOpen } = useAddActivityGate();

    // Piano + prezzi del tenant: servono solo per l'offerta quando il piano è
    // al limite di sedi. Stessa fonte di Abbonamento.
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
    const [planPrices, setPlanPrices] = useState<PlanPrice[]>([]);
    const [billingInterval, setBillingInterval] = useState<BillingInterval>(DEFAULT_BILLING_INTERVAL);

    useEffect(() => {
        if (!selectedTenant?.plan || !tenantId) return;
        getPlanByCode(selectedTenant.plan)
            .then(setCurrentPlan)
            .catch(err => {
                console.error("[AddActivityDrawer] plan lookup failed:", err);
                setCurrentPlan(null);
            });
        getTenantBillingInterval(tenantId)
            .then(interval => setBillingInterval(interval ?? DEFAULT_BILLING_INTERVAL))
            .catch(err => console.error("[AddActivityDrawer] billing interval lookup failed:", err));
        listPlanPrices()
            .then(setPlanPrices)
            .catch(err => {
                console.error("[AddActivityDrawer] plan prices list failed:", err);
                setPlanPrices([]);
            });
    }, [selectedTenant?.plan, tenantId]);

    // Rete di sicurezza: il drawer si apre già sull'offerta quando il limite è
    // noto; qui si arriva solo se il piano non era caricato al click.
    const guardSeatLimit = useCallback(() => {
        if (selectedTenant && usedSeats >= selectedTenant.paid_seats) {
            const paidSeats = selectedTenant.paid_seats;
            showToast({
                message: `Hai usato tutte le ${paidSeats} sedi pagate. ${
                    isOwner(userRole) || isAdmin(userRole)
                        ? "Aggiungine una al piano da Abbonamento."
                        : "Chiedi al proprietario di aggiungerne una al piano."
                }`,
                type: "error",
                duration: 4000
            });
            return false;
        }
        return true;
    }, [selectedTenant, usedSeats, userRole, showToast]);

    // Offerta al posto del form quando le sedi pagate sono finite: `null`
    // finché il piano non è caricato o finché c'è margine.
    const seatOffer = useMemo<SeatLimitOffer | null>(() => {
        const paidSeats = selectedTenant?.paid_seats ?? 0;
        if (usedSeats < paidSeats || !currentPlan) return null;

        const unitPriceCents = priceCentsFor(planPrices, currentPlan.code, billingInterval);
        const offer = nextSeatOffer({ ...currentPlan, unit_price_cents: unitPriceCents }, paidSeats, usedSeats);
        if (offer.kind === "free") return null;

        const renewal = selectedTenant?.current_period_end ?? null;
        return {
            offer,
            planName: currentPlan.name,
            paidSeats,
            interval: billingInterval,
            renewalDateLabel: renewal ? formatDateIt(renewal) : null
        };
    }, [selectedTenant, usedSeats, currentPlan, planPrices, billingInterval]);

    const openPlanUpgradeFromOffer = useCallback(() => {
        onClose();
        navigate(`/business/${tenantId}/settings/abbonamento#modifica-piano`);
    }, [onClose, navigate, tenantId]);

    // La creazione è comunque respinta dal trigger DB se il limite viene
    // raggiunto fra apertura e invio (altra sede creata da un altro tab).
    const handleSeatLimitFromServer = useCallback(
        (info: SeatLimitInfo) => {
            showToast({
                message: `Limite sedi raggiunto: il piano copre ${info.paid} ${
                    info.paid === 1 ? "sede" : "sedi"
                } (in uso ${info.used}).`,
                type: "error",
                duration: 4000
            });
        },
        [showToast]
    );

    const handleCreated = useCallback(
        async (activity: V2Activity) => {
            if (tenantId) await refreshActivitiesCache(tenantId);
            await onCreated?.(activity);
        },
        [tenantId, onCreated]
    );

    const {
        values,
        errors,
        isCreating,
        slugState,
        setSlugState,
        handleFieldChange,
        handleCoverChange,
        handlePickSlugSuggestion,
        handleSubmit,
        reset
    } = useCreateActivity({
        tenantId,
        activityType: selectedTenant?.vertical_type ?? null,
        canSubmit: tryOpen,
        beforeCreate: guardSeatLimit,
        onNotify: showToast,
        onSeatLimit: handleSeatLimitFromServer,
        onSuccess: handleCreated,
        onSettled: onClose
    });

    // Ogni apertura parte senza lo stato dello slug della volta prima.
    useEffect(() => {
        if (open) setSlugState({ type: "idle" });
    }, [open, setSlugState]);

    return (
        <BusinessLocationDrawer
            open={open}
            mode="create"
            tenantName={selectedTenant?.name}
            values={values}
            errors={errors}
            loading={isCreating}
            onFieldChange={handleFieldChange}
            onCoverChange={handleCoverChange}
            slugState={slugState}
            onPickSlugSuggestion={handlePickSlugSuggestion}
            onSubmit={handleSubmit}
            onClose={() => {
                onClose();
                setSlugState({ type: "idle" });
                reset();
            }}
            seatOffer={seatOffer}
            onOpenPlanDrawer={openPlanUpgradeFromOffer}
        />
    );
}
