import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { FormGrid, FORM_GRID_CLASSES } from "@/components/ui/FormGrid/FormGrid";
import { ImageUploadEditor, IMAGE_UPLOAD_PRESETS, type ImageUploadEditorResult } from "@/components/ui/ImageUploadEditor";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { PageIndex, PageIndexLayout } from "@/components/ui/PageIndex/PageIndex";
import { usePageIndexActive } from "@/components/ui/PageIndex/usePageIndexActive";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { ActivitySlugDrawer } from "../tabs/info/ActivitySlugDrawer";
import { ActivityGoogleReviewsDrawer } from "../tabs/contacts/ActivityGoogleReviewsDrawer";
import { PaymentMethodsSection } from "../tabs/hours-services/PaymentMethodsSection";
import { ServicesSection } from "../tabs/hours-services/ServicesSection";
import { FeesSection } from "../tabs/hours-services/FeesSection";
import { PAYMENT_METHODS, SERVICES } from "../tabs/hours-services/activityChoices";
import { feesToState, buildFeesPayload, type FeesState } from "../tabs/hours-services/feesState";
import { useActivityDetail } from "../ActivityDetailContext";
import { uploadActivityCover, removeActivityCover } from "@/services/supabase/activities";
import { getActivitySlugAliases } from "@/services/supabase/activitySlugAliases";
import { useToast } from "@/context/Toast/ToastContext";
import { buildPublicUrl } from "@/utils/publicUrl";
import type { ActivitySlugAlias } from "@/types/activity";
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

const SECTION_IDS = ["identita", "indirizzo-web", "copertina", "contatti", "social", "pagamenti", "servizi", "tariffe"] as const;

type TextField = "name" | "address" | "street_number" | "postal_code" | "city" | "province" | "description" | "email_public" | "phone" | "website" | "instagram" | "facebook" | "whatsapp";
type FlagField = "email_public_visible" | "phone_public" | "website_public" | "instagram_public" | "facebook_public" | "whatsapp_public" | "payment_methods_public" | "services_public" | "fees_public";

/**
 * Anagrafica (§31.1): chi è questo locale. Otto sezioni sotto un PageIndex,
 * tutto nel draft di pagina (§31.4) salvo la copertina, l'indirizzo web e
 * le recensioni Google, che sono azioni. I nove flag «visibile ai clienti»
 * sono controlli veri, nel draft (§31.2).
 */
export default function ActivityAnagraficaRoute() {
    const { activity, tenantId, reload, canManage, draft } = useActivityDetail();
    const { showToast } = useToast();
    const d = draft.draft;
    const activeId = usePageIndexActive([...SECTION_IDS]);

    const text = (field: TextField) => d[field] ?? "";
    const setText = (field: TextField) => (value: string) => draft.set(field, value.trim() === "" ? null : value);
    const flag = (field: FlagField) => Boolean(d[field]);
    const setFlag = (field: FlagField) => (value: boolean) => draft.set(field, value);

    // Le tariffe sono un array di {key, value}: si editano come stato di
    // stringhe e si riportano nel draft già nella forma salvata.
    const fees: FeesState = useMemo(() => feesToState(d.fees), [d.fees]);
    const setFees = (next: FeesState) => draft.set("fees", buildFeesPayload(next));

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

    // ── Indirizzo web (operazione a sé) ─────────────────────────────────────
    const [isSlugOpen, setIsSlugOpen] = useState(false);
    const [aliases, setAliases] = useState<ActivitySlugAlias[]>([]);
    const loadAliases = useCallback(async () => {
        try {
            setAliases(await getActivitySlugAliases(activity.id, tenantId));
        } catch {
            // Non critico: la riga dice «nessuno».
        }
    }, [activity.id, tenantId]);
    useEffect(() => {
        void loadAliases();
    }, [loadAliases]);
    const publicUrl = buildPublicUrl(activity.slug);
    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            showToast({ message: "URL copiato.", type: "success" });
        } catch {
            showToast({ message: "Impossibile copiare l'URL.", type: "error" });
        }
    };

    // ── Recensioni Google (azione immediata) ────────────────────────────────
    const [isReviewsOpen, setIsReviewsOpen] = useState(false);

    const visibilitySwitch = (field: FlagField) => (
        <Switch
            size="sm"
            label="Visibile ai clienti"
            checked={flag(field)}
            onChange={setFlag(field)}
            disabled={!canManage}
        />
    );

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
            <div className={styles.contactFlag}>{visibilitySwitch(flagField)}</div>
        </div>
    );

    const selectedFees = (d.fees ?? []).filter(f => f.value && f.value.trim() !== "").length;
    const sections = [
        { id: "identita", label: "Identità", summary: "7 campi" },
        { id: "indirizzo-web", label: "Indirizzo web", summary: activity.slug },
        { id: "copertina", label: "Copertina", summary: activity.cover_image ? "1 foto" : "nessuna" },
        { id: "contatti", label: "Contatti", summary: "3 campi" },
        { id: "social", label: "Social", summary: "3 campi" },
        { id: "pagamenti", label: "Metodi di pagamento", summary: `${(d.payment_methods ?? []).length} su ${PAYMENT_METHODS.length}` },
        { id: "servizi", label: "Servizi offerti", summary: `${(d.services ?? []).length} su ${SERVICES.length}` },
        { id: "tariffe", label: "Tariffe", summary: `${selectedFees} su 5` }
    ];

    return (
        <PageIndexLayout index={<PageIndex sections={sections} activeId={activeId} footer="8 sezioni, un solo Salva" />}>
            <div className={styles.page}>
                <section id="identita" className={styles.section}>
                    <Card title="Identità" subtitle="Il nome e l'indirizzo che vedono i clienti">
                        <FormGrid cols={2}>
                            <TextInput
                                label="Nome del locale"
                                required
                                value={text("name")}
                                onChange={e => setText("name")(e.target.value)}
                                disabled={!canManage}
                                containerClassName={FORM_GRID_CLASSES.span}
                                helperText="Obbligatorio."
                            />
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
                            <Textarea
                                label="Presentazione"
                                placeholder="Compare in cima alla pagina pubblica"
                                value={text("description")}
                                onChange={e => setText("description")(e.target.value)}
                                disabled={!canManage}
                                containerClassName={FORM_GRID_CLASSES.span}
                                rows={4}
                            />
                        </FormGrid>
                    </Card>
                </section>

                <section id="indirizzo-web" className={styles.section}>
                    <Card
                        title="Indirizzo web"
                        subtitle="L'unico dato della sede che è unico in tutta la piattaforma"
                        actions={
                            canManage ? (
                                <Button variant="secondary" size="sm" onClick={() => setIsSlugOpen(true)}>
                                    Cambia indirizzo
                                </Button>
                            ) : undefined
                        }
                        flush
                    >
                        <ListRow
                            title="Indirizzo attuale"
                            subtitle={publicUrl}
                            trailing={
                                <div className={styles.rowActions}>
                                    <Button variant="ghost" size="sm" onClick={() => void handleCopyUrl()}>
                                        Copia
                                    </Button>
                                    <Button as="a" variant="ghost" size="sm" href={publicUrl} target="_blank" rel="noopener noreferrer">
                                        Apri
                                    </Button>
                                </div>
                            }
                        />
                        <ListRow
                            title="Indirizzi precedenti"
                            subtitle={aliases.length === 0 ? "Nessuno" : `${aliases.length} · i vecchi link continuano a funzionare`}
                            onClick={() => setIsSlugOpen(true)}
                        />
                    </Card>
                </section>

                <section id="copertina" className={styles.section}>
                    <Card title="Copertina" subtitle="Una foto 16:9 in cima alla pagina pubblica">
                        {canManage ? (
                            <ImageUploadEditor
                                aspectRatio={IMAGE_UPLOAD_PRESETS.coverSede.aspectRatio}
                                backgroundFillModes={IMAGE_UPLOAD_PRESETS.coverSede.backgroundFillModes}
                                maxSizeMB={IMAGE_UPLOAD_PRESETS.coverSede.maxSizeMB}
                                compressLongEdge={IMAGE_UPLOAD_PRESETS.coverSede.compressLongEdge}
                                bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "cover.webp" }}
                                fieldLabel={IMAGE_UPLOAD_PRESETS.coverSede.fieldLabel}
                                drawerTitle={IMAGE_UPLOAD_PRESETS.coverSede.drawerTitle}
                                requiresConfirm={IMAGE_UPLOAD_PRESETS.coverSede.requiresConfirm}
                                initialSource={activity.cover_image ?? null}
                                onConfirm={handleCoverConfirm}
                                onRemove={() => setIsCoverRemoveOpen(true)}
                                removing={isCoverRemoving}
                            />
                        ) : activity.cover_image ? (
                            <img src={activity.cover_image} alt="Copertina" className={styles.cover} />
                        ) : (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna copertina.
                            </Text>
                        )}
                    </Card>
                </section>

                <section id="contatti" className={styles.section}>
                    <Card title="Contatti" subtitle="Ogni contatto ha un interruttore «visibile ai clienti» separato dal valore">
                        <FormGrid cols={1}>
                            {contactField("email_public", "email_public_visible", "Email pubblica", "info@esempio.it", "email")}
                            {contactField("phone", "phone_public", "Telefono", "+39 02 1234567", "tel")}
                            {contactField("website", "website_public", "Sito web", "https://…", "url")}
                        </FormGrid>
                        <div className={styles.reviewsRow}>
                            <ListRow
                                title="Recensioni Google"
                                subtitle={activity.google_review_url ? "Il link alle recensioni compare nella pagina pubblica" : "Collega la scheda Google Places per mostrare le recensioni"}
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

                <section id="social" className={styles.section}>
                    <Card title="Social">
                        <FormGrid cols={1}>
                            {contactField("instagram", "instagram_public", "Instagram", "@nomelocale")}
                            {contactField("facebook", "facebook_public", "Facebook", "https://facebook.com/…", "url")}
                            {contactField("whatsapp", "whatsapp_public", "WhatsApp", "+39 …", "tel")}
                        </FormGrid>
                    </Card>
                </section>

                <section id="pagamenti" className={styles.section}>
                    <Card
                        title="Metodi di pagamento"
                        subtitle={`${(d.payment_methods ?? []).length} su ${PAYMENT_METHODS.length}`}
                        actions={visibilitySwitch("payment_methods_public")}
                    >
                        <PaymentMethodsSection value={d.payment_methods ?? []} onChange={next => draft.set("payment_methods", next)} disabled={!canManage} />
                    </Card>
                </section>

                <section id="servizi" className={styles.section}>
                    <Card
                        title="Servizi offerti"
                        subtitle={`${(d.services ?? []).length} su ${SERVICES.length}`}
                        actions={visibilitySwitch("services_public")}
                    >
                        <ServicesSection value={d.services ?? []} onChange={next => draft.set("services", next)} disabled={!canManage} />
                    </Card>
                </section>

                <section id="tariffe" className={styles.section}>
                    <Card title="Tariffe" subtitle="Cinque voci, unità diverse. Le vuote non compaiono." actions={visibilitySwitch("fees_public")}>
                        <FeesSection value={fees} onChange={setFees} disabled={!canManage} />
                    </Card>
                </section>
            </div>

            <ActivitySlugDrawer
                open={isSlugOpen}
                onClose={() => setIsSlugOpen(false)}
                activity={activity}
                tenantId={tenantId}
                aliases={aliases}
                onSuccess={() => {
                    void reload();
                    void loadAliases();
                }}
                onAliasRemoved={loadAliases}
                canEdit={canManage}
            />
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
        </PageIndexLayout>
    );
}
