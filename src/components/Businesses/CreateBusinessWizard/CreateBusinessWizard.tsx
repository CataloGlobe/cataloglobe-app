import { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";

import { uploadTenantLogo, updateTenantLogoUrl, updateTenantBillingDetails, type TenantBillingDetails } from "@/services/supabase/tenants";
import { createCheckoutSession } from "@/services/supabase/billing";
import { listPublicPlans } from "@/services/supabase/plans";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { calculateGraduatedFromPlan } from "@/utils/pricing";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import { DEFAULT_SUBTYPE, type BusinessSubtype } from "@/constants/verticalTypes";
import { getStoredPromo, clearStoredPromo } from "@/utils/promoCode";
import type { Plan, PlanCode } from "@/types/plan";
import type { V2Tenant, LegalEntityType } from "@/types/tenant";
import type { AddressResult } from "@/components/ui/AddressAutocomplete/AddressAutocomplete";
import { isValidPartitaIva, isValidCodiceFiscale } from "@/utils/fiscalValidators";

import { Step1Info } from "./steps/Step1Info";
import { Step2PlanSeats } from "./steps/Step2PlanSeats";
import { StepBilling } from "./steps/StepBilling";
import { Step3Summary } from "./steps/Step3Summary";

import styles from "./CreateBusinessWizard.module.scss";

type WizardMode = "create" | "resume";

interface CreateBusinessWizardProps {
    open: boolean;
    onClose: () => void;
    mode?: WizardMode;
    existingTenant?: V2Tenant | null;
}

const STEPS = [
    { n: 1 as const, label: "Informazioni attività" },
    { n: 2 as const, label: "Piano e sedi" },
    { n: 3 as const, label: "Dati di fatturazione" },
    { n: 4 as const, label: "Riepilogo e pagamento" },
];

const DEFAULT_PLAN: PlanCode = "pro";

export function CreateBusinessWizard({ open, onClose, mode = "create", existingTenant = null }: CreateBusinessWizardProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const resumeMode = mode === "resume" && existingTenant !== null;

    // Resume reactivates an existing tenant: collect billing only when the
    // tenant has no fiscal data yet. With data present, the step is skipped.
    const resumeNeedsBilling = resumeMode && !!existingTenant && !tenantHasFiscalData(existingTenant);

    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [name, setName] = useState("");
    const [subtype, setSubtype] = useState<BusinessSubtype>(DEFAULT_SUBTYPE);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [planCode, setPlanCode] = useState<PlanCode>(DEFAULT_PLAN);
    const [seats, setSeats] = useState(1);
    const [promotionCode, setPromotionCode] = useState("");
    const [showPromoInput, setShowPromoInput] = useState(false);

    // Billing identity (intestatario fattura) — collected in create flow only.
    const [entityType, setEntityType] = useState<LegalEntityType | "">("");
    const [legalName, setLegalName] = useState("");
    const [vatNumber, setVatNumber] = useState("");
    const [fiscalCode, setFiscalCode] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [pec, setPec] = useState("");
    const [codiceDestinatario, setCodiceDestinatario] = useState("");
    const [billingAddress, setBillingAddress] = useState<AddressResult | null>(null);

    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [plansError, setPlansError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    // Synchronous re-entry guard for handleCheckout. `submitting` drives the
    // button's disabled state but is applied on the next render — between the
    // first click and that render, rapid clicks would re-enter and insert
    // duplicate tenants. This ref blocks re-entry within the same tick.
    const inFlightRef = useRef(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [promoError, setPromoError] = useState<string | null>(null);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);

    // Snapshot of initial plan/seats in resume mode — used to detect changes
    // and avoid useless UPDATE roundtrips when the user confirms unchanged values.
    const initialResumeRef = useRef<{ plan: PlanCode; seats: number } | null>(null);

    // Reset state on open transition
    useEffect(() => {
        if (!open) return;

        if (resumeMode && existingTenant) {
            setStep(2);
            setName(existingTenant.name);
            setSubtype(existingTenant.business_subtype ?? DEFAULT_SUBTYPE);
            setPlanCode(existingTenant.plan);
            setSeats(Math.max(1, existingTenant.paid_seats));
            initialResumeRef.current = { plan: existingTenant.plan, seats: Math.max(1, existingTenant.paid_seats) };

            // Pre-fill billing from any data already on the tenant (covers partial).
            setEntityType(existingTenant.legal_entity_type ?? "");
            setLegalName(existingTenant.legal_name ?? "");
            setVatNumber(existingTenant.vat_number ?? "");
            setFiscalCode(existingTenant.fiscal_code ?? "");
            setFirstName(existingTenant.first_name ?? "");
            setLastName(existingTenant.last_name ?? "");
            setPec(existingTenant.pec ?? "");
            setCodiceDestinatario(existingTenant.codice_destinatario ?? "");
            const hasAddr =
                !!existingTenant.address ||
                !!existingTenant.street_number ||
                !!existingTenant.postal_code ||
                !!existingTenant.city ||
                !!existingTenant.province;
            setBillingAddress(
                hasAddr
                    ? {
                          address: existingTenant.address ?? "",
                          street_number: existingTenant.street_number ?? "",
                          postal_code: existingTenant.postal_code ?? "",
                          city: existingTenant.city ?? "",
                          province: existingTenant.province ?? "",
                      }
                    : null
            );
        } else {
            setStep(1);
            setName("");
            setSubtype(DEFAULT_SUBTYPE);
            setPlanCode(DEFAULT_PLAN);
            setSeats(1);
            initialResumeRef.current = null;

            // Billing fields start empty (collected fresh in create flow).
            setEntityType("");
            setLegalName("");
            setVatNumber("");
            setFiscalCode("");
            setFirstName("");
            setLastName("");
            setPec("");
            setCodiceDestinatario("");
            setBillingAddress(null);
        }

        setLogoFile(null);

        const seeded = getStoredPromo() ?? "";
        setPromotionCode(seeded);
        setShowPromoInput(seeded.length > 0);

        setSubmitting(false);
        setSubmitError(null);
        setPromoError(null);
        setShowCloseConfirm(false);
    }, [open, resumeMode, existingTenant]);

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

    const canProceedFromStep1 = name.trim().length >= 2;
    const canProceedFromStep2 = !!selectedPlan && seats >= 1 && !overLimit;

    // Civico (street_number) is optional — NumeroCivico is not required by FatturaPA.
    const billingAddressComplete =
        !!billingAddress &&
        billingAddress.address.trim().length > 0 &&
        billingAddress.postal_code.trim().length > 0 &&
        billingAddress.city.trim().length > 0 &&
        billingAddress.province.trim().length > 0;

    const canProceedFromStepBilling = useMemo(() => {
        if (!billingAddressComplete) return false;

        const vatFilled = vatNumber.trim().length > 0;
        const cfFilled = fiscalCode.trim().length > 0;
        const vatFormatOk = !vatFilled || isValidPartitaIva(vatNumber);
        const cfFormatOk = !cfFilled || isValidCodiceFiscale(fiscalCode);

        switch (entityType) {
            case "societa":
                return vatFilled && isValidPartitaIva(vatNumber) && legalName.trim().length > 0 && cfFormatOk;
            case "professionista":
                return (
                    vatFilled &&
                    isValidPartitaIva(vatNumber) &&
                    cfFilled &&
                    isValidCodiceFiscale(fiscalCode) &&
                    firstName.trim().length > 0 &&
                    lastName.trim().length > 0
                );
            case "associazione":
                return cfFilled && isValidCodiceFiscale(fiscalCode) && legalName.trim().length > 0 && vatFormatOk;
            default:
                return false;
        }
    }, [entityType, vatNumber, fiscalCode, legalName, firstName, lastName, billingAddressComplete]);

    const isDirty = resumeMode
        ? (
            !!initialResumeRef.current && (
                planCode !== initialResumeRef.current.plan ||
                seats !== initialResumeRef.current.seats
            )
        ) || promotionCode.length > 0 || step > 2
        : (
            name.trim().length > 0 ||
            subtype !== DEFAULT_SUBTYPE ||
            logoFile !== null ||
            step > 1 ||
            promotionCode.length > 0 ||
            entityType !== "" ||
            billingAddress !== null
        );

    const requestClose = () => {
        if (submitting) return;
        if (isDirty) {
            setShowCloseConfirm(true);
            return;
        }
        onClose();
    };

    const handleConfirmedClose = async (): Promise<boolean> => {
        onClose();
        return true;
    };

    const handleBack = () => {
        if (submitting) return;
        if (resumeMode) {
            if (step === 2) return requestClose();
            if (step === 3) {
                setStep(2);
                setSubmitError(null);
                return;
            }
            // Summary (4) → billing (3) if it was shown, else plan/seats (2).
            setStep(resumeNeedsBilling ? 3 : 2);
            setSubmitError(null);
            return;
        }
        if (step === 1) return requestClose();
        setStep(s => (s - 1) as 1 | 2 | 3 | 4);
        setSubmitError(null);
    };

    const handleNext = () => {
        if (step === 1 && canProceedFromStep1) {
            setStep(2);
        } else if (step === 2 && canProceedFromStep2) {
            // Resume skips billing only when the tenant already has fiscal data.
            setStep(resumeMode && !resumeNeedsBilling ? 4 : 3);
        } else if (step === 3 && canProceedFromStepBilling) {
            setStep(4);
        }
    };

    const handleSeatsChange = (next: number) => {
        setSeats(next);
    };

    const buildBillingPayload = (): TenantBillingDetails => ({
        legal_entity_type: entityType || null,
        legal_name: legalName.trim() || null,
        vat_number: vatNumber.trim() || null,
        fiscal_code: fiscalCode.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        pec: pec.trim() || null,
        codice_destinatario: codiceDestinatario.trim() || null,
        address: billingAddress?.address.trim() || null,
        street_number: billingAddress?.street_number.trim() || null,
        postal_code: billingAddress?.postal_code.trim() || null,
        city: billingAddress?.city.trim() || null,
        province: billingAddress?.province.trim() || null,
        country: "IT",
    });

    const handleCheckout = async () => {
        if (!selectedPlan) return;
        if (!resumeMode && !user) return;
        if (resumeMode && !existingTenant) return;

        // Synchronous re-entry block: a second click before the re-render that
        // disables the button must not trigger a second tenant insert.
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        setSubmitting(true);
        setSubmitError(null);
        setPromoError(null);

        try {
            let tenantId: string;

            if (resumeMode && existingTenant) {
                tenantId = existingTenant.id;

                // Only align when the user actually changed plan/seats. Skipping
                // the UPDATE when unchanged avoids a wasted roundtrip.
                const initial = initialResumeRef.current;
                const planChanged = !initial || planCode !== initial.plan;
                const seatsChanged = !initial || seats !== initial.seats;

                if (planChanged || seatsChanged) {
                    const { error: alignError } = await supabase
                        .from("tenants")
                        .update({ plan: selectedPlan.code, paid_seats: seats })
                        .eq("id", tenantId);

                    if (alignError) {
                        const wrap = new Error("tenant_align_failed");
                        wrap.name = "tenant_align_failed";
                        throw wrap;
                    }
                }

                // Persist billing only when it was missing and is now collected.
                if (resumeNeedsBilling) {
                    await updateTenantBillingDetails(tenantId, buildBillingPayload());
                }
            } else {
                const { data: tenantRow, error: insertError } = await supabase
                    .from("tenants")
                    .insert({
                        owner_user_id: user!.id,
                        name: name.trim(),
                        vertical_type: "food_beverage",
                        business_subtype: subtype,
                        // Billing identity (intestatario fattura) + legal address.
                        ...buildBillingPayload(),
                    })
                    .select("id")
                    .single();

                if (insertError) throw insertError;
                tenantId = tenantRow.id as string;

                // Align plan + paid_seats to wizard selection. tenants defaults are
                // plan='base' + paid_seats=1; without this update, if the user abandons
                // Stripe Checkout the tenant stays in DB with wrong values and the
                // "Attiva abbonamento" retry would charge the wrong plan/quantity.
                const { error: alignError } = await supabase
                    .from("tenants")
                    .update({ plan: selectedPlan.code, paid_seats: seats })
                    .eq("id", tenantId);

                if (alignError) {
                    const wrap = new Error("tenant_align_failed");
                    wrap.name = "tenant_align_failed";
                    throw wrap;
                }

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

            // Guard against a silent no-op: if the session call returns without a
            // usable URL we must surface an error instead of leaving the button
            // stuck in loading with no redirect.
            if (!checkoutUrl || checkoutUrl.trim().length === 0) {
                const wrap = new Error("checkout_url_missing");
                wrap.name = "checkout_url_missing";
                throw wrap;
            }

            clearStoredPromo();
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
        } finally {
            // Always release the re-entry guard. On the success path the page is
            // already navigating away; `submitting` stays true so the button does
            // not flicker back to enabled before the redirect completes.
            inFlightRef.current = false;
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
                    <StepBilling
                        entityType={entityType}
                        onEntityTypeChange={setEntityType}
                        legalName={legalName}
                        onLegalNameChange={setLegalName}
                        vatNumber={vatNumber}
                        onVatNumberChange={setVatNumber}
                        fiscalCode={fiscalCode}
                        onFiscalCodeChange={setFiscalCode}
                        firstName={firstName}
                        onFirstNameChange={setFirstName}
                        lastName={lastName}
                        onLastNameChange={setLastName}
                        pec={pec}
                        onPecChange={setPec}
                        codiceDestinatario={codiceDestinatario}
                        onCodiceDestinatarioChange={setCodiceDestinatario}
                        billingAddress={billingAddress}
                        onAddressChange={setBillingAddress}
                        disabled={submitting}
                    />
                );
            case 4:
                return (
                    <Step3Summary
                        name={name}
                        plan={selectedPlan}
                        breakdown={breakdown}
                        total={breakdown.subtotal}
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
        (step === 2 && !canProceedFromStep2) ||
        (step === 3 && !canProceedFromStepBilling);

    const headerTitle = resumeMode && existingTenant
        ? `Attiva abbonamento — ${existingTenant.name}`
        : "Crea nuova attività";

    // Resume skips info (1) always, and billing (3) only when fiscal data exists.
    const visibleSteps = resumeMode
        ? STEPS.filter(s => s.n !== 1 && (s.n !== 3 || resumeNeedsBilling))
        : STEPS;

    return (
        <>
        <SystemDrawer open={open} onClose={requestClose} width={920}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <Text variant="title-sm" weight={700}>
                            {headerTitle}
                        </Text>
                        {resumeMode && (
                            <span className={styles.headerSubtitle}>
                                Riprendi da dove avevi lasciato. Modifica piano o sedi se vuoi cambiare.
                            </span>
                        )}
                    </div>
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
                    {visibleSteps.map((s, idx) => {
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
                                {idx < visibleSteps.length - 1 && <span className={styles.stepConnector} />}
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
                        leftIcon={(resumeMode ? step === 2 : step === 1) ? undefined : <ArrowLeft size={16} />}
                    >
                        {(resumeMode ? step === 2 : step === 1) ? "Annulla" : "Indietro"}
                    </Button>

                    <div className={styles.footerRight}>
                        {step < 4 ? (
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
                                disabled={!canProceedFromStep2 || ((!resumeMode || resumeNeedsBilling) && !canProceedFromStepBilling)}
                                rightIcon={<ArrowRight size={16} />}
                            >
                                Vai al pagamento
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </SystemDrawer>

        <ConfirmDialog
            isOpen={showCloseConfirm}
            onClose={() => setShowCloseConfirm(false)}
            onConfirm={handleConfirmedClose}
            title="Vuoi chiudere?"
            message="Le informazioni inserite andranno perse."
            confirmLabel="Chiudi comunque"
            confirmVariant="danger"
        />
        </>
    );
}

/**
 * True when the tenant already carries the fiscal identity required for its
 * entity type. Drives whether the billing step is shown in resume flow.
 */
function tenantHasFiscalData(t: V2Tenant): boolean {
    if (!t.legal_entity_type) return false;
    const has = (v?: string | null) => !!v && v.trim().length > 0;

    // Identity without a minimal legal address is incomplete for invoicing.
    const addressOk = has(t.address) && has(t.postal_code) && has(t.city) && has(t.province);
    if (!addressOk) return false;

    switch (t.legal_entity_type) {
        case "societa":
            return has(t.vat_number) && has(t.legal_name);
        case "professionista":
            return has(t.vat_number) && has(t.fiscal_code) && has(t.first_name) && has(t.last_name);
        case "associazione":
            return has(t.fiscal_code) && has(t.legal_name);
        default:
            return false;
    }
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
        case "checkout_url_missing":
            return "Errore durante la creazione del checkout. Riprova tra qualche istante.";
        case "tenant_align_failed":
            return "Impossibile finalizzare la scelta del piano. Riprova oppure contatta l'assistenza.";
        default:
            return "Errore durante la creazione dell'attività. Riprova.";
    }
}
