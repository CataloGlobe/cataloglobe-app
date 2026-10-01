import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { useToast } from "@/context/Toast/ToastContext";
import { addCrmNote, ingestCrmLead } from "@/services/supabase/crm";
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
import { crmErrorMessage } from "@/utils/crm/stages";
import styles from "./Crm.module.scss";

/**
 * Lead aggiunto a mano: in Fase 0 soprattutto le chat WhatsApp aperte
 * dall'annuncio «Scrivici su WhatsApp». Passa da `crm_ingest_lead` come ogni
 * altro ingresso, quindi vale la stessa regola dei doppioni: con un telefono
 * già noto non nasce una carta nuova, si aggiunge una richiesta al locale.
 */

const SOURCE_OPTIONS = [
    { value: "whatsapp", label: "Chat WhatsApp", description: "Ha scritto lui sul numero dedicato." },
    { value: "manuale", label: "Altro", description: "Telefonata, passaparola, incontro." }
];

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: (venueId: string) => void;
};

const FORM_ID = "crm-add-lead-form";

export function AddLeadDrawer({ open, onClose, onCreated }: Props) {
    const { showToast } = useToast();
    const [source, setSource] = useState<"whatsapp" | "manuale">("whatsapp");
    const [name, setName] = useState("");
    const [venueName, setVenueName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [city, setCity] = useState("");
    const [note, setNote] = useState("");
    const [phoneError, setPhoneError] = useState<string | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setSource("whatsapp");
        setName("");
        setVenueName("");
        setPhone("");
        setEmail("");
        setCity("");
        setNote("");
        setPhoneError(undefined);
        setIsSaving(false);
        setFormError(null);
    }, [open]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const phoneE164 = normalizePhoneToE164(phone);
        if (!phoneE164) {
            setPhoneError("Telefono non valido. Senza prefisso si intende italiano.");
            return;
        }
        setPhoneError(undefined);
        setFormError(null);
        setIsSaving(true);
        try {
            const result = await ingestCrmLead({
                source,
                sourceRef: null,
                name: name.trim(),
                venueName: venueName.trim(),
                phoneE164,
                email: email.trim() || null,
                city: city.trim() || null,
                consentText:
                    source === "whatsapp" ? "Ha scritto per primo su WhatsApp" : null
            });
            if (result.outcome === "suppressed" || !result.venueId) {
                setFormError(
                    "Questo numero ha chiesto di non essere più contattato: non entra nel CRM."
                );
                setIsSaving(false);
                return;
            }
            const venueId = result.venueId;
            // Il lead ormai è dentro: se fallisce solo la nota, niente errore
            // nel form (un secondo «Aggiungi» aggiungerebbe una richiesta doppia).
            if (note.trim()) {
                try {
                    await addCrmNote(venueId, note.trim());
                } catch {
                    showToast({
                        message: "Lead aggiunto, ma la nota non è stata salvata: aggiungila dalla scheda.",
                        type: "warning"
                    });
                    onCreated(venueId);
                    return;
                }
            }
            showToast({
                message:
                    result.outcome === "created"
                        ? "Lead aggiunto."
                        : "Questo telefono era già nel CRM: la richiesta è stata aggiunta al suo locale.",
                type: result.outcome === "created" ? "success" : "info"
            });
            onCreated(venueId);
        } catch (err) {
            setFormError(crmErrorMessage(err));
            setIsSaving(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Aggiungi lead
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Aggiungi
                        </Button>
                    </>
                }
            >
                <form id={FORM_ID} className={styles.drawerForm} onSubmit={handleSubmit}>
                    {formError && <InlineBanner variant="error">{formError}</InlineBanner>}
                    <RadioGroup
                        label="Da dove arriva"
                        value={source}
                        onChange={value => setSource(value as "whatsapp" | "manuale")}
                        options={SOURCE_OPTIONS}
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Nome della persona"
                        required
                        maxLength={120}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Nome del locale"
                        required
                        maxLength={160}
                        value={venueName}
                        onChange={e => setVenueName(e.target.value)}
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Telefono"
                        required
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        error={phoneError}
                        helperText="Il telefono riconosce i doppioni: se c'è già, la richiesta va sul suo locale."
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Email"
                        type="email"
                        maxLength={254}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Città"
                        maxLength={120}
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        disabled={isSaving}
                    />
                    <Textarea
                        label="Nota"
                        rows={3}
                        maxLength={4000}
                        placeholder="Cosa ha chiesto, cosa gli interessa."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        disabled={isSaving}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
