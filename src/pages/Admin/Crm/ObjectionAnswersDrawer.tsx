import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { listCrmObjectionAnswers, saveCrmObjectionAnswers } from "@/services/supabase/crmObjections";
import type { CrmObjectionCategory } from "@/types/crm";
import { CRM_OBJECTION_CATEGORIES, CRM_OBJECTION_LABEL } from "@/utils/crm/objections";
import { crmErrorMessage } from "@/utils/crm/stages";
import styles from "./Crm.module.scss";

const FORM_ID = "crm-objection-answers-form";

type Answers = Record<CrmObjectionCategory, string>;

const EMPTY = Object.fromEntries(CRM_OBJECTION_CATEGORIES.map(c => [c, ""])) as Answers;

/**
 * Le risposte che funzionano, una per categoria (libreria delle obiezioni).
 * Le scrive il team dalle telefonate andate bene; gli agenti le useranno
 * dentro le regole del brand. Salva solo quelle cambiate; vuota = tolta.
 */
export function ObjectionAnswersDrawer({
    open,
    onClose,
    userId
}: {
    open: boolean;
    onClose: () => void;
    userId: string | null;
}) {
    const [saved, setSaved] = useState<Answers>(EMPTY);
    const [draft, setDraft] = useState<Answers>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        listCrmObjectionAnswers().then(
            rows => {
                if (cancelled) return;
                const next = { ...EMPTY };
                for (const r of rows) next[r.category] = r.answer;
                setSaved(next);
                setDraft(next);
                setLoading(false);
            },
            err => {
                if (cancelled) return;
                setError(crmErrorMessage(err));
                setLoading(false);
            }
        );
        return () => {
            cancelled = true;
        };
    }, [open]);

    const changed = CRM_OBJECTION_CATEGORIES.filter(c => draft[c].trim() !== saved[c].trim());

    async function handleSubmit() {
        if (!userId || changed.length === 0) return;
        setIsSaving(true);
        setError(null);
        try {
            await saveCrmObjectionAnswers(
                changed.map(c => ({ category: c, answer: draft[c] })),
                userId
            );
            onClose();
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Risposte alle obiezioni
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={isSaving}
                            disabled={loading || changed.length === 0 || !userId}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    className={styles.drawerForm}
                    noValidate
                    onSubmit={e => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    <Text variant="body-sm" colorVariant="muted">
                        Cosa rispondere quando la sentite: due o tre frasi, come le diresti al telefono. Niente sconti né promesse
                        fuori dalle regole del brand.
                    </Text>
                    {CRM_OBJECTION_CATEGORIES.map(c => (
                        <Textarea
                            key={c}
                            label={CRM_OBJECTION_LABEL[c]}
                            rows={3}
                            maxLength={1000}
                            value={draft[c]}
                            onChange={e => setDraft(d => ({ ...d, [c]: e.target.value }))}
                            disabled={loading || isSaving}
                        />
                    ))}
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
