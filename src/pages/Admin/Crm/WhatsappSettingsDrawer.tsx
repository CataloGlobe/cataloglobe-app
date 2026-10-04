import { useEffect, useState, type FormEvent } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { updateCrmWaSettings } from "@/services/supabase/crmWhatsappAgent";
import { parseTestNumbers, WA_TEST_NUMBERS_MAX, waErrorMessage } from "@/utils/crm/waLabels";
import type { CrmWaSettings } from "@/types/crm";
import styles from "./Crm.module.scss";

const FORM_ID = "crm-wa-settings-form";

/**
 * Impostazioni dell'agente WhatsApp: testo del primo messaggio automatico
 * (vuoto = nessun primo messaggio parte da solo) e «solo numeri di prova».
 * Spegnere «solo numeri di prova» fa scrivere l'agente ai lead veri: chiede
 * conferma.
 */
export function WhatsappSettingsDrawer({
    settings,
    onClose,
    onSaved
}: {
    settings: CrmWaSettings | null;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}) {
    const [firstMessage, setFirstMessage] = useState("");
    const [testOnly, setTestOnly] = useState(true);
    const [numbers, setNumbers] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [confirmLive, setConfirmLive] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setFirstMessage(settings.wa_first_message ?? "");
        setTestOnly(settings.wa_test_only);
        setNumbers(settings.wa_test_numbers.join("\n"));
        setError(null);
    }, [settings]);

    async function save(): Promise<boolean> {
        const parsed = parseTestNumbers(numbers);
        if (parsed.invalid.length > 0) {
            setError(`Numeri non validi: ${parsed.invalid.join(", ")}. Servono col prefisso, come +393331234567.`);
            return false;
        }
        if (parsed.numbers.length > WA_TEST_NUMBERS_MAX) {
            setError(`Al massimo ${WA_TEST_NUMBERS_MAX} numeri di prova.`);
            return false;
        }
        setIsSaving(true);
        setError(null);
        try {
            await updateCrmWaSettings({
                wa_first_message: firstMessage.trim() || null,
                wa_test_only: testOnly,
                wa_test_numbers: parsed.numbers
            });
            await onSaved();
            return true;
        } catch (err) {
            setError(waErrorMessage(err));
            return false;
        } finally {
            setIsSaving(false);
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (settings?.wa_test_only && !testOnly) {
            setConfirmLive(true);
            return;
        }
        void save();
    }

    return (
        <SystemDrawer open={settings !== null} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Agente WhatsApp
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Salva
                        </Button>
                    </>
                }
            >
                <form id={FORM_ID} className={styles.drawerForm} onSubmit={handleSubmit}>
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    <Textarea
                        label="Primo messaggio automatico"
                        helperText="Parte da solo ai lead nuovi dei moduli Meta e della landing. Vuoto = nessun primo messaggio automatico. {nome} diventa il nome della persona, {locale} il nome del locale, {mittente} il nome di chi ha il locale in carico."
                        rows={6}
                        maxLength={1000}
                        value={firstMessage}
                        onChange={e => setFirstMessage(e.target.value)}
                        disabled={isSaving}
                    />
                    <Switch
                        label="Solo numeri di prova"
                        description="Acceso, l'agente scrive solo ai numeri qui sotto e annulla gli altri messaggi."
                        checked={testOnly}
                        onChange={setTestOnly}
                        disabled={isSaving}
                    />
                    <Textarea
                        label="Numeri di prova"
                        helperText={`Uno per riga, col prefisso (+39…). Al massimo ${WA_TEST_NUMBERS_MAX}.`}
                        rows={4}
                        value={numbers}
                        onChange={e => setNumbers(e.target.value)}
                        disabled={isSaving}
                    />
                </form>
            </DrawerLayout>
            <ConfirmDialog
                isOpen={confirmLive}
                onClose={() => setConfirmLive(false)}
                onConfirm={async () => {
                    const ok = await save();
                    if (ok) setConfirmLive(false);
                    return ok;
                }}
                title="Scrivere ai lead veri?"
                message="Con «solo numeri di prova» spento, l'agente manda i messaggi in coda ai ristoratori. Le regole di invio restano: fasce orarie, 30 primi messaggi al giorno, pausa agenti."
                confirmLabel="Sì, spegni la prova"
                confirmVariant="primary"
                isLoading={isSaving}
                error={confirmLive ? error : null}
            />
        </SystemDrawer>
    );
}
