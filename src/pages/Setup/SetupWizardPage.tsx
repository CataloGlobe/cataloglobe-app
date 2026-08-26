import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTenantId } from "@/context/useTenantId";
import type { V2Activity } from "@/types/activity";
import { SetupShell, type SetupStepDefinition } from "./components/SetupShell";
import { SetupActivityStep } from "./steps/SetupActivityStep";

const STEPS: SetupStepDefinition[] = [
    { id: "activity", label: "La tua sede", hint: "Dove i clienti ti trovano" },
    { id: "catalog", label: "Il tuo menù", hint: "Cosa offri ai clienti" },
    { id: "publish", label: "Pubblicazione", hint: "Il QR pronto da usare" }
];

const ACTIVITY_FORM_ID = "setup-activity-form";

/** Sottoinsieme della sede creata che i passi successivi consumano. */
type CreatedActivity = Pick<V2Activity, "id" | "name" | "slug">;

const STEP_COPY = [
    {
        title: "Iniziamo dal tuo locale",
        subtitle:
            "È quello che i clienti raggiungono inquadrando il QR. Bastano poche informazioni: il resto lo affini quando vuoi."
    },
    {
        title: "Ora il menù",
        subtitle: "Il passo successivo del setup guidato."
    },
    {
        title: "Pubblica e stampa il QR",
        subtitle: "L'ultimo passo del setup guidato."
    }
];

export default function SetupWizardPage() {
    usePageTitle("Setup guidato");
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const tenantId = useTenantId();

    const [stepIndex, setStepIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    // Sede creata al passo 1: l'id serve al passo 2 per collegare il menù, slug
    // e nome al passo 3 per comporre URL pubblico e QR.
    const [createdActivity, setCreatedActivity] = useState<CreatedActivity | null>(null);

    const handleExitToOverview = useCallback(() => {
        navigate(`/business/${businessId}/overview`);
    }, [navigate, businessId]);

    const handleActivityCreated = useCallback((activity: V2Activity) => {
        setCreatedActivity({
            id: activity.id,
            name: activity.name,
            slug: activity.slug
        });
        setStepIndex(1);
    }, []);

    const copy = STEP_COPY[stepIndex];
    const isActivityStep = stepIndex === 0;

    return (
        <SetupShell
            steps={STEPS}
            currentIndex={stepIndex}
            title={copy.title}
            subtitle={copy.subtitle}
            formId={isActivityStep ? ACTIVITY_FORM_ID : undefined}
            primaryLabel="Continua"
            primaryLoading={isActivityStep ? isSaving : false}
            primaryDisabled={isActivityStep ? isSaving : true}
            onExit={handleExitToOverview}
        >
            {isActivityStep ? (
                <SetupActivityStep
                    formId={ACTIVITY_FORM_ID}
                    tenantId={tenantId}
                    onSavingChange={setIsSaving}
                    onCreated={handleActivityCreated}
                />
            ) : (
                <Text variant="body-sm" colorVariant="muted">
                    In arrivo{createdActivity ? ` per ${createdActivity.name}` : ""}.
                </Text>
            )}
        </SetupShell>
    );
}
