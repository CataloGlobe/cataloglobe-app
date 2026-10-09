import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { FormGrid, FORM_GRID_CLASSES } from "@/components/ui/FormGrid/FormGrid";
import { IconButton } from "@/components/ui/Button/IconButton";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorControl,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { ActivityGoogleReviewsDrawer } from "../tabs/contacts/ActivityGoogleReviewsDrawer";
import { useActivityDetail } from "../ActivityDetailContext";
import ActivityOrariRoute from "./ActivityOrariRoute";
import ActivityPubblicazioneRoute from "./ActivityPubblicazioneRoute";
import { uploadActivityCover, removeActivityCover } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityAnagraficaRoute.module.scss";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function urlProblem(value: string): string | null {
    try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:" ? null : "Il sito web deve iniziare con http:// o https://.";
    } catch {
        return "Sito web: inserisci un indirizzo valido (es. https://esempio.com).";
    }
}

type TextField = "name" | "address" | "street_number" | "postal_code" | "city" | "province" | "description" | "email_public" | "phone" | "website" | "instagram" | "facebook" | "whatsapp";
type FlagField = "email_public_visible" | "phone_public" | "website_public" | "instagram_public" | "facebook_public" | "whatsapp_public";

/**
 * Il biglietto da visita (Officina 3, prototipo s3): chi è questo locale, in
 * una griglia 2fr/1fr. Il locale (copertina, nome, presentazione) con gli
 * orari accanto; i contatti con dove siete accanto; link e QR a tutta
 * larghezza. Tutto nel draft di pagina (§31.4) salvo copertina, orari,
 * Google e indirizzo web, che sono azioni. L'occhio accanto a un contatto
 * compilato dice se i clienti lo vedono (§31.2).
 */
export default function ActivityAnagraficaRoute() {
    const { activity, tenantId, reload, canManage, draft } = useActivityDetail();
    const { showToast } = useToast();
    const d = draft.draft;
    const { hash } = useLocation();

    // I vecchi indirizzi (orari, pubblicazione) arrivano con l'ancora del
    // blocco: lo scroll si fa a mano, la pagina monta prima del contenuto.
    useEffect(() => {
        if (!hash) return;
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    }, [hash]);

    const text = (field: TextField) => d[field] ?? "";
    const setText = (field: TextField) => (value: string) => draft.set(field, value.trim() === "" ? null : value);
    const flag = (field: FlagField) => Boolean(d[field]);
    const setFlag = (field: FlagField) => (value: boolean) => draft.set(field, value);

    useEffect(() => {
        return draft.registerValidator("anagrafica", () => {
            if (!(d.name ?? "").trim()) return "Il nome del locale è obbligatorio.";
            const email = (d.email_public ?? "").trim();
            if (email && !EMAIL_RE.test(email)) return "Email pubblica: inserisci un indirizzo valido.";
            const website = (d.website ?? "").trim();
            if (website) {
                const problem = urlProblem(website);
                if (problem) return problem;
            }
            return null;
        });
    }, [draft, d.name, d.email_public, d.website]);

    // ── Copertina (azione immediata) ────────────────────────────────────────
    const [isCoverRemoving, setIsCoverRemoving] = useState(false);
    const [isCoverRemoveOpen, setIsCoverRemoveOpen] = useState(false);
    const coverEditor = useRef<ImageUploadEditorControl>(null);
    const handleCoverConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!file) return;
        try {
            await uploadActivityCover(activity, file);
            showToast({ message: "Copertina aggiornata.", type: "success" });
            await reload();
        } catch {
            showToast({ message: "Impossibile caricare la copertina.", type: "error" });
        }
    };
    const handleCoverRemove = async (): Promise<boolean> => {
        if (!activity.cover_image) return true;
        setIsCoverRemoving(true);
        try {
            await removeActivityCover(activity.id, tenantId, activity.cover_image);
            showToast({ message: "Copertina rimossa.", type: "success" });
            await reload();
            return true;
        } catch {
            showToast({ message: "Impossibile rimuovere la copertina.", type: "error" });
            return false;
        } finally {
            setIsCoverRemoving(false);
        }
    };

    // ── Recensioni Google (azione immediata) ────────────────────────────────
    const [isReviewsOpen, setIsReviewsOpen] = useState(false);

    // L'occhio compare solo sul contatto compilato: su un campo vuoto non
    // c'è niente da mostrare o nascondere.
    const eyeToggle = (field: TextField, flagField: FlagField, label: string) => {
        if (!filled(field)) return null;
        const visible = flag(flagField);
        return (
            <IconButton
                icon={visible ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
                aria-label={`${label}: visibile ai clienti`}
                aria-pressed={visible}
                title={visible ? "I clienti lo vedono" : "Nascosto ai clienti"}
                variant="ghost"
                size="sm"
                onClick={() => setFlag(flagField)(!visible)}
                disabled={!canManage}
            />
        );
    };

    const contactField = (field: TextField, flagField: FlagField, label: string, placeholder: string, type: "text" | "email" | "url" | "tel" = "text") => (
        <div className={styles.contact}>
            <TextInput
                type={type}
                label={label}
                placeholder={placeholder}
                value={text(field)}
                onChange={e => setText(field)(e.target.value)}
                disabled={!canManage}
                containerClassName={styles.contactInput}
            />
            <div className={styles.contactFlag}>{eyeToggle(field, flagField, label)}</div>
        </div>
    );

    const filled = (field: TextField) => text(field).trim() !== "";

    return (
        <div className={styles.grid}>
            <section id="locale" aria-label="Il locale" className={styles.main}>
                {/* A2: con la foto, «Cambia la foto» e Rimuovi nella testata; senza,
                    nessuna azione e il corpo è l'area di caricamento. */}
                <Card
                    title="Il locale"
                    subtitle="La foto in cima alla pagina pubblica, il nome e due righe su di voi"
                    actions={
                        canManage && activity.cover_image ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => coverEditor.current?.open()}
                                    disabled={isCoverRemoving}
                                >
                                    Cambia la foto
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Rimuovi la copertina"
                                    onClick={() => setIsCoverRemoveOpen(true)}
                                    disabled={isCoverRemoving}
                                >
                                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                                </Button>
                            </>
                        ) : undefined
                    }
                >
                    <div className={styles.stack}>
                        {canManage ? (
                            <ImageUploadEditor
                                aspectRatio={IMAGE_UPLOAD_PRESETS.coverSede.aspectRatio}
                                backgroundFillModes={IMAGE_UPLOAD_PRESETS.coverSede.backgroundFillModes}
                                maxSizeMB={IMAGE_UPLOAD_PRESETS.coverSede.maxSizeMB}
                                compressLongEdge={IMAGE_UPLOAD_PRESETS.coverSede.compressLongEdge}
                                bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "cover.webp" }}
                                hideHeader
                                controlRef={coverEditor}
                                drawerTitle={IMAGE_UPLOAD_PRESETS.coverSede.drawerTitle}
                                requiresConfirm={IMAGE_UPLOAD_PRESETS.coverSede.requiresConfirm}
                                initialSource={activity.cover_image ?? null}
                                onConfirm={handleCoverConfirm}
                                removing={isCoverRemoving}
                            />
                        ) : activity.cover_image ? (
                            <img src={activity.cover_image} alt="Copertina" className={styles.cover} />
                        ) : (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna copertina.
                            </Text>
                        )}
                        <FormGrid cols={1}>
                            <TextInput
                                label="Nome del locale"
                                required
                                value={text("name")}
                                onChange={e => setText("name")(e.target.value)}
                                disabled={!canManage}
                            />
                            <Textarea
                                label="Presentazione"
                                placeholder="Compare in cima alla pagina pubblica"
                                value={text("description")}
                                onChange={e => setText("description")(e.target.value)}
                                disabled={!canManage}
                                rows={3}
                            />
                        </FormGrid>
                    </div>
                </Card>
            </section>

            <section id="orari" aria-label="Orari" className={styles.side}>
                <ActivityOrariRoute />
            </section>

            <section id="contatti" aria-label="Contatti" className={styles.main}>
                <Card title="Contatti" subtitle="L'occhio accanto a un contatto dice se i clienti lo vedono">
                    <FormGrid cols={2}>
                        {contactField("phone", "phone_public", "Telefono", "+39 02 1234567", "tel")}
                        {contactField("email_public", "email_public_visible", "Email", "info@esempio.it", "email")}
                        {contactField("website", "website_public", "Sito web", "https://…", "url")}
                        {contactField("instagram", "instagram_public", "Instagram", "@nomelocale")}
                        {contactField("facebook", "facebook_public", "Facebook", "https://facebook.com/…", "url")}
                        {contactField("whatsapp", "whatsapp_public", "WhatsApp", "+39 …", "tel")}
                    </FormGrid>
                </Card>
            </section>

            <section id="dove" aria-label="Dove siete" className={styles.side}>
                <Card title="Dove siete">
                    <FormGrid cols={2}>
                        <TextInput
                            label="Via"
                            value={text("address")}
                            onChange={e => setText("address")(e.target.value)}
                            disabled={!canManage}
                            containerClassName={FORM_GRID_CLASSES.span}
                        />
                        <TextInput label="Civico" value={text("street_number")} onChange={e => setText("street_number")(e.target.value)} disabled={!canManage} />
                        <TextInput label="CAP" value={text("postal_code")} onChange={e => setText("postal_code")(e.target.value)} disabled={!canManage} />
                        <TextInput label="Città" value={text("city")} onChange={e => setText("city")(e.target.value)} disabled={!canManage} />
                        <TextInput label="Provincia" helperText="Sigla di 2 lettere" maxLength={2} value={text("province")} onChange={e => setText("province")(e.target.value.toUpperCase())} disabled={!canManage} />
                    </FormGrid>
                    <div className={styles.reviewsRow}>
                        <ListRow
                            title="Recensioni Google"
                            subtitle={activity.google_review_url ? "Chi lascia 4 o 5 stelle viene invitato a recensirvi anche su Google" : "Aggiungi il link della scheda Google per invitare i clienti soddisfatti a recensirvi lì"}
                            meta={
                                activity.google_review_url ? (
                                    <StatusBadge variant="success" label="Collegato" />
                                ) : (
                                    <StatusBadge variant="neutral" label="Non collegato" />
                                )
                            }
                            trailing={
                                canManage ? (
                                    <Button variant="secondary" size="sm" onClick={() => setIsReviewsOpen(true)}>
                                        {activity.google_review_url ? "Cambia" : "Collega"}
                                    </Button>
                                ) : undefined
                            }
                        />
                    </div>
                </Card>
            </section>

            <section id="link" aria-label="Link e QR" className={styles.full}>
                <ActivityPubblicazioneRoute />
            </section>

            <ActivityGoogleReviewsDrawer
                open={isReviewsOpen}
                onClose={() => setIsReviewsOpen(false)}
                activity={activity}
                tenantId={tenantId}
                onSuccess={reload}
            />
            <ConfirmDialog
                isOpen={isCoverRemoveOpen}
                onClose={() => setIsCoverRemoveOpen(false)}
                onConfirm={handleCoverRemove}
                title="Rimuovi la copertina?"
                message="La pagina pubblica resta senza foto in cima finché non ne carichi un'altra."
                confirmLabel="Rimuovi"
                confirmVariant="danger"
                isLoading={isCoverRemoving}
            />
        </div>
    );
}
