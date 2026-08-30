import { useEffect } from "react";
import { FileText, PencilLine } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { CatalogForm } from "@/pages/Dashboard/Catalogs/components/CatalogForm";
import { AiMenuImportWizard } from "@/pages/Dashboard/Catalogs/AiMenuImport/AiMenuImportWizard";
import type { AiImportSession } from "@/hooks/useAiImportSession";
import type { V2Catalog } from "@/services/supabase/catalogs";
import styles from "./SetupCatalogStep.module.scss";

/** Ramo scelto al bivio. `null` = nessuna scelta ancora fatta. */
export type CatalogBranch = "import" | "manual";

type SetupCatalogStepProps = {
    formId: string;
    tenantId: string | null;
    branch: CatalogBranch | null;
    onBranchChange: (branch: CatalogBranch) => void;
    /** Sessione import montata dalla pagina, così sopravvive al cambio di ramo. */
    importSession: AiImportSession;
    onSavingChange: (saving: boolean) => void;
    onCatalogCreated: (catalog: V2Catalog) => void;
};

const CHOICES: {
    id: CatalogBranch;
    title: string;
    description: string;
    icon: typeof FileText;
}[] = [
    {
        id: "import",
        // Stesso nome dell'intestazione del pannello che si apre: due nomi per
        // la stessa cosa facevano dubitare di essere finiti altrove.
        title: "Importa menù con AI",
        description:
            "Lo leggo io e ti preparo categorie, piatti e prezzi già pronti da controllare.",
        icon: FileText
    },
    {
        id: "manual",
        title: "Lo creo a mano",
        description: "Parti da un menù vuoto e aggiungi i piatti quando ti fa comodo.",
        icon: PencilLine
    }
];

export function SetupCatalogStep({
    formId,
    tenantId,
    branch,
    onBranchChange,
    importSession,
    onSavingChange,
    onCatalogCreated
}: SetupCatalogStepProps) {
    // Il primario della shell vale solo per il ramo manuale: fuori da lì non
    // deve restare in stato "salvataggio" da una sessione precedente.
    useEffect(() => {
        if (branch !== "manual") onSavingChange(false);
    }, [branch, onSavingChange]);

    if (importSession.isOpen) {
        return (
            <div className={styles.importPanel}>
                {/* Qui il tenant è appena nato: cataloghi esistenti non ce ne
                    sono, quindi niente selettore Nuovo/Esistente. */}
                <AiMenuImportWizard session={importSession} forceNewCatalog />
            </div>
        );
    }

    return (
        <div className={styles.step}>
            <div className={styles.choices} role="radiogroup" aria-label="Come creiamo il menù">
                {CHOICES.map(choice => {
                    const Icon = choice.icon;
                    const selected = branch === choice.id;

                    return (
                        <button
                            key={choice.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={styles.choice}
                            data-selected={selected || undefined}
                            onClick={() => onBranchChange(choice.id)}
                        >
                            <span className={styles.choiceIcon} aria-hidden>
                                <Icon size={18} />
                            </span>
                            <Text variant="body-sm" weight={600}>
                                {choice.title}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                {choice.description}
                            </Text>
                        </button>
                    );
                })}
            </div>

            {branch === "manual" && (
                <div className={styles.manualForm}>
                    <CatalogForm
                        formId={formId}
                        mode="create"
                        entityData={null}
                        tenantId={tenantId ?? ""}
                        onSuccess={onCatalogCreated}
                        onSavingChange={onSavingChange}
                    />
                    <Text variant="caption" colorVariant="muted" className={styles.hint}>
                        Es. &laquo;Alla carta&raquo;, &laquo;Colazioni&raquo;, &laquo;Carta dei
                        vini&raquo;.
                        <br />
                        Per ora creiamo solo il contenitore: i piatti li aggiungerai dalla pagina
                        Prodotti, dove imposti nomi, prezzi, foto e allergeni.
                    </Text>
                </div>
            )}
        </div>
    );
}
