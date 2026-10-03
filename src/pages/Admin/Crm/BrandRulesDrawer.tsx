import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useToast } from "@/context/Toast/ToastContext";
import {
    approveCrmBrandRules,
    discardCrmBrandRules,
    proposeCrmBrandRules
} from "@/services/supabase/crmAgents";
import type { CrmBrandRules } from "@/types/crm";
import { crmAgentErrorMessage } from "@/utils/crm/agentLabels";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import styles from "./Crm.module.scss";

/**
 * Regole del brand: una versione nuova si propone in bozza, poi una persona
 * la legge qui e la mette in vigore (la precedente si ritira) o la scarta.
 * Il testo di una versione non cambia: una correzione è una versione nuova.
 */

export type BrandRulesDrawerState =
    | { mode: "propose"; initialBody: string }
    | { mode: "view"; rules: CrmBrandRules };

type Props = {
    state: BrandRulesDrawerState | null;
    teamName: (userId: string | null) => string;
    onClose: () => void;
    onChanged: () => Promise<void>;
};

const FORM_ID = "crm-brand-rules-form";

const STATUS_TEXT: Record<CrmBrandRules["status"], string> = {
    draft: "In bozza: gli agenti non la usano finché non è approvata.",
    approved: "In vigore: è quella che gli agenti seguono.",
    retired: "Ritirata: sostituita da una versione più recente.",
    discarded: "Scartata."
};

export function BrandRulesDrawer({ state, teamName, onClose, onChanged }: Props) {
    const { showToast } = useToast();
    const [body, setBody] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!state) return;
        setBody(state.mode === "propose" ? state.initialBody : "");
        setNote("");
        setError(null);
        setIsSaving(false);
    }, [state]);

    async function run(action: () => Promise<void>, message: string) {
        setIsSaving(true);
        setError(null);
        try {
            await action();
            await onChanged();
            onClose();
            showToast({ message, type: "success" });
        } catch (err) {
            setError(crmAgentErrorMessage(err));
            setIsSaving(false);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!body.trim()) {
            setError("Scrivi le regole.");
            return;
        }
        void run(async () => {
            await proposeCrmBrandRules(body.trim(), note.trim() || null);
        }, "Versione proposta: ora va approvata.");
    }

    const rules = state?.mode === "view" ? state.rules : null;

    return (
        <SystemDrawer open={state !== null} onClose={onClose} size="lg">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {rules ? `Regole del brand, versione ${rules.version}` : "Nuova versione delle regole"}
                    </Text>
                }
                footer={
                    rules ? (
                        rules.status === "draft" ? (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() =>
                                        void run(() => discardCrmBrandRules(rules.version), "Versione scartata.")
                                    }
                                    disabled={isSaving}
                                >
                                    Scarta
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() =>
                                        void run(
                                            () => approveCrmBrandRules(rules.version),
                                            `Versione ${rules.version} in vigore.`
                                        )
                                    }
                                    loading={isSaving}
                                >
                                    Approva e metti in vigore
                                </Button>
                            </>
                        ) : (
                            <Button variant="secondary" onClick={onClose}>
                                Chiudi
                            </Button>
                        )
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                                Annulla
                            </Button>
                            <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                                Proponi
                            </Button>
                        </>
                    )
                }
            >
                {rules ? (
                    <div className={styles.drawerForm}>
                        {error && <InlineBanner variant="error">{error}</InlineBanner>}
                        <Text variant="body-sm" colorVariant="muted">
                            {STATUS_TEXT[rules.status]} Proposta da {teamName(rules.created_by)} il{" "}
                            {formatDateTimeIt(rules.created_at)}
                            {rules.approved_at
                                ? `, approvata da ${teamName(rules.approved_by)} il ${formatDateTimeIt(rules.approved_at)}`
                                : ""}
                            .
                        </Text>
                        {rules.note && <Text variant="body-sm">Nota: {rules.note}</Text>}
                        <Text variant="body" className={styles.preWrap}>
                            {rules.body}
                        </Text>
                    </div>
                ) : (
                    <form id={FORM_ID} className={styles.drawerForm} onSubmit={handleSubmit}>
                        {error && <InlineBanner variant="error">{error}</InlineBanner>}
                        <Text variant="body-sm" colorVariant="muted">
                            Le regole che gli agenti e il Revisore seguono quando scrivono ai locali: prezzi,
                            tono, parole da evitare, promesse vietate. La versione nuova parte in bozza e
                            vale solo dopo l'approvazione.
                        </Text>
                        <Textarea
                            label="Regole"
                            required
                            rows={20}
                            maxLength={20000}
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            disabled={isSaving}
                        />
                        <TextInput
                            label="Cosa cambia"
                            helperText="Facoltativo: una riga per chi la approva."
                            maxLength={300}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            disabled={isSaving}
                        />
                    </form>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
