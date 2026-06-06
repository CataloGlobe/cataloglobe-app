import { useEffect, useMemo, useState } from "react";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";

import { uploadTenantLogo, updateTenantLogoUrl } from "@/services/supabase/tenants";
import { createCheckoutSession } from "@/services/supabase/billing";
import { listPublicPlans } from "@/services/supabase/plans";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { calculateGraduatedFromPlan } from "@/utils/pricing";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import { DEFAULT_SUBTYPE, type BusinessSubtype } from "@/constants/verticalTypes";
import type { Plan, PlanCode } from "@/types/plan";

import { Step1Info } from "./steps/Step1Info";
import { Step2PlanSeats } from "./steps/Step2PlanSeats";
import { Step3Summary } from "./steps/Step3Summary";

import styles from "./CreateBusinessWizard.module.scss";

interface CreateBusinessWizardProps {
    open: boolean;
    onClose: () => void;
}

const STEPS = [
    { n: 1 as const, label: "Informazioni attività" },
    { n: 2 as const, label: "Piano e sedi" },
    { n: 3 as const, label: "Riepilogo e pagamento" },
];

const IVA_RATE = 0.22;
const DEFAULT_PLAN: PlanCode = "pro";

export function CreateBusinessWizard({ open, onClose }: CreateBusinessWizardProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [name, setName] = useState("");
    const [subtype, setSubtype] = useState<BusinessSubtype>(DEFAULT_SUBTYPE);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [planCode, setPlanCode] = useState<PlanCode>(DEFAULT_PLAN);
    const [seats, setSeats] = useState(1);
    const [promotionCode, setPromotionCode] = useState("");
    const [showPromoInput, setShowPromoInput] = useState(false);

    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [plansError, setPlansError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [promoError, setPromoError] = useState<string | null>(null);

    // Reset state on open transition
    useEffect(() => {
        if (!open) return;
        setStep(1);
        setName("");
        setSubtype(DEFAULT_SUBTYPE);
        setLogoFile(null);
        setPlanCode(DEFAULT_PLAN);
        setSeats(1);
        setPromotionCode("");
        setShowPromoInput(false);
        setSubmitting(false);
        setSubmitError(null);
        setPromoError(null);
    }, [open]);

    // Fetch plans once per open
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setPlansLoading(true);
        setPlansError(null);
        listPublicPlans()
            .then(rows => {
                if (cancelled) return;
                setPlans(rows);
                const hasDefault = rows.some(r => r.code === DEFAULT_PLAN);
                if (!hasDefault && rows.length > 0) {
                    setPlanCode(rows[0].code);
                }
            })
            .catch(err => {
                if (cancelled) return;
                console.error("[CreateBusinessWizard] plans fetch failed:", err);
                setPlansError("Impossibile caricare i piani. Riprova.");
            })
            .finally(() => {
                if (cancelled) return;
                setPlansLoading(false);
            });
        return () => { cancelled = true; };
    }, [open]);

    const selectedPlan = useMemo(
        () => plans.find(p => p.code === planCode) ?? plans[0] ?? null,
        [plans, planCode]
    );

    const breakdown = useMemo(() => {
        if (!selectedPlan) {
            return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        }
        return calculateGraduatedFromPlan(selectedPlan, seats);
    }, [selectedPlan, seats]);

    const maxSelfServiceSeats = selectedPlan?.max_self_service_seats ?? 5;
    const discountPercent = selectedPlan?.volume_discount_percent ?? 10;
    const overLimit = seats > maxSelfServiceSeats;

    const ivaAmount = breakdown.subtotal * IVA_RATE;
    const totalWithIva = breakdown.subtotal + ivaAmount;

    const canProceedFromStep1 = name.trim().length >= 2;
    const canProceedFromStep2 = !!selectedPlan && seats >= 1 && !overLimit;

    const isDirty =
        name.trim().length > 0 ||
        subtype !== DEFAULT_SUBTYPE ||
        logoFile !== null ||
        step > 1 ||
        promotionCode.length > 0;

    const requestClose = () => {
        if (submitting) return;
        if (isDirty) {
            const ok = window.confirm("Vuoi davvero chiudere? Le informazioni inserite andranno perse.");
            if (!ok) return;
        }
        onClose();
    };

    const handleBack = () => {
        if (submitting) return;
        if (step === 1) return requestClose();
        setStep(s => (s === 3 ? 2 : 1));
        setSubmitError(null);
    };

    const handleNext = () => {
        if (step === 1 && canProceedFromStep1) {
            setStep(2);
        } else if (step === 2 && canProceedFromStep2) {
            setStep(3);
        }
    };

    const handleSeatsChange = (next: number) => {
        setSeats(next);
    };

    const handleCheckout = async () => {
        if (!user || !selectedPlan) return;

        setSubmitting(true);
        setSubmitError(null);
        setPromoError(null);

        try {
            const { data: tenantRow, error: insertError } = await supabase
                .from("tenants")
                .insert({
                    owner_user_id: user.id,
                    name: name.trim(),
                    vertical_type: "food_beverage",
                    business_subtype: subtype,
                })
                .select("id")
                .single();

            if (insertError) throw insertError;
            const tenantId = tenantRow.id as string;

            if (logoFile) {
                try {
                    const compressed = await compressImage(logoFile, COMPRESS_PROFILES.logo);
                    const logoPath = await uploadTenantLogo(tenantId, compressed);
                    await updateTenantLogoUrl(tenantId, logoPath);
                } catch (logoErr) {
                    console.error("[CreateBusinessWizard] logo upload failed:", logoErr);
                    showToast({
                        type: "warning",
                        message: "Attività creata, ma non è stato possibile caricare il logo. Puoi riprovare dalle impostazioni.",
                    });
                }
            }

            localStorage.setItem(STORAGE_KEY, tenantId);

            const checkoutUrl = await createCheckoutSession({
                tenantId,
                planCode: selectedPlan.code,
                quantity: seats,
                promotionCode: promotionCode.trim() || undefined,
                successUrl: `${window.location.origin}/business/${tenantId}/overview`,
                cancelUrl: `${window.location.origin}/workspace`,
            });

            window.location.href = checkoutUrl;
        } catch (err) {
            console.error("[CreateBusinessWizard] checkout failed:", err);
            const code = err instanceof Error ? err.name : "";

            if (code === "promo_code_invalid") {
                setPromoError("Codice promozionale non valido. Verifica e riprova.");
                setShowPromoInput(true);
            } else {
                const message = friendlyErrorMessage(code);
                setSubmitError(message);
            }
            setSubmitting(false);
        }
    };

    const renderStep = () => {
        if (plansLoading) {
            return <div className={styles.loadingBlock}>Caricamento piani…</div>;
        }
        if (plansError || !selectedPlan) {
            return (
                <div className={styles.fetchErrorBlock}>
                    <span>{plansError ?? "Nessun piano disponibile."}</span>
                </div>
            );
        }

        switch (step) {
            case 1:
                return (
                    <Step1Info
                        name={name}
                        onNameChange={setName}
                        subtype={subtype}
                        onSubtypeChange={setSubtype}
                        logoFile={logoFile}
                        onLogoChange={setLogoFile}
                        disabled={submitting}
                    />
                );
            case 2:
                return (
                    <Step2PlanSeats
                        plans={plans}
                        planCode={planCode}
                        onPlanChange={setPlanCode}
                        seats={seats}
                        onSeatsChange={handleSeatsChange}
                        breakdown={breakdown}
                        maxSeats={maxSelfServiceSeats}
                        discountPercent={discountPercent}
                        overLimit={overLimit}
                        disabled={submitting}
                    />
                );
            case 3:
                return (
                    <Step3Summary
                        name={name}
                        plan={selectedPlan}
                        breakdown={breakdown}
                        ivaAmount={ivaAmount}
                        totalWithIva={totalWithIva}
                        discountPercent={discountPercent}
                        promotionCode={promotionCode}
                        onPromotionCodeChange={value => {
                            setPromotionCode(value);
                            setPromoError(null);
                        }}
                        showPromoInput={showPromoInput}
                        onTogglePromoInput={() => setShowPromoInput(true)}
                        promoError={promoError}
                        submitError={submitError}
                    />
                );
        }
    };

    const nextDisabled =
        plansLoading ||
        !!plansError ||
        !selectedPlan ||
        (step === 1 && !canProceedFromStep1) ||
        (step === 2 && !canProceedFromStep2);

    return (
        <SystemDrawer open={open} onClose={requestClose} width={920}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <Text variant="title-sm" weight={700}>
                        Crea nuova attività
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={requestClose}
                        aria-label="Chiudi"
                        disabled={submitting}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.stepperBar}>
                    {STEPS.map((s, idx) => {
                        const isActive = step === s.n;
                        const isDone = step > s.n;
                        return (
                            <div key={s.n} className={styles.stepItem}>
                                <div className={styles.stepCluster}>
                                    <span
                                        className={`${styles.stepDot} ${
                                            isDone
                                                ? styles.stepDotDone
                                                : isActive
                                                ? styles.stepDotActive
                                                : ""
                                        }`}
                                    >
                                        {isDone ? "✓" : s.n}
                                    </span>
                                    <span
                                        className={`${styles.stepLabel} ${
                                            isActive || isDone ? styles.stepLabelActive : ""
                                        }`}
                                    >
                                        {s.label}
                                    </span>
                                </div>
                                {idx < STEPS.length - 1 && <span className={styles.stepConnector} />}
                            </div>
                        );
                    })}
                </div>

                <div className={styles.body}>{renderStep()}</div>

                <div className={styles.footer}>
                    <Button
                        variant="ghost"
                        onClick={handleBack}
                        disabled={submitting}
                        leftIcon={step === 1 ? undefined : <ArrowLeft size={16} />}
                    >
                        {step === 1 ? "Annulla" : "Indietro"}
                    </Button>

                    <div className={styles.footerRight}>
                        {step < 3 ? (
                            <Button
                                variant="primary"
                                onClick={handleNext}
                                disabled={nextDisabled}
                                rightIcon={<ArrowRight size={16} />}
                            >
                                Avanti
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={handleCheckout}
                                loading={submitting}
                                disabled={!canProceedFromStep2}
                                rightIcon={<ArrowRight size={16} />}
                            >
                                Vai al pagamento
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </SystemDrawer>
    );
}

function friendlyErrorMessage(code: string): string {
    switch (code) {
        case "unauthorized":
            return "Sessione scaduta. Effettua nuovamente l'accesso.";
        case "forbidden":
            return "Non hai i permessi per completare questa operazione.";
        case "plan_not_configured":
            return "Il piano selezionato non è ancora configurato. Riprova più tardi.";
        case "invalid_plan_code":
            return "Il piano selezionato non è valido.";
        case "missing_tenant_id":
        case "invalid_json":
            return "Errore nei dati inviati. Ricarica la pagina e riprova.";
        case "server_misconfigured":
        case "plan_lookup_failed":
        case "db_update_failed":
        case "checkout_failed":
            return "Errore durante la creazione del checkout. Riprova tra qualche istante.";
        default:
            return "Errore durante la creazione dell'attività. Riprova.";
    }
}
