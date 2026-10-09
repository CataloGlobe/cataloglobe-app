import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
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
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { uploadActivityCover, removeActivityCover } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityGoogleReviewsDrawer } from "../tabs/contacts/ActivityGoogleReviewsDrawer";
import { PaymentMethodsSection } from "../tabs/hours-services/PaymentMethodsSection";
import { ServicesSection } from "../tabs/hours-services/ServicesSection";
import { FeesSection } from "../tabs/hours-services/FeesSection";
import { feesToState, buildFeesPayload, type FeesState } from "../tabs/hours-services/feesState";
import { useActivityDetail } from "../ActivityDetailContext";
import { CONTACTS } from "./schedaModel";
import styles from "./Scheda.module.scss";

type TextField = "name" | "address" | "street_number" | "postal_code" | "city" | "province" | "description";

function useText() {
    const { draft } = useActivityDetail();
    const d = draft.draft;
    const text = (field: TextField) => d[field] ?? "";
    const setText = (field: TextField) => (value: string) => draft.set(field, value.trim() === "" ? null : value);
    return { text, setText };
}

/** Il locale: la foto (subito), il nome e la presentazione (col Salva). */
export function LocaleEditor() {
    const { activity, tenantId, reload, canManage } = useActivityDetail();
    const { showToast } = useToast();
    const { text, setText } = useText();

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

    return (
        <div className={styles.stack}>
            <div className={styles.stack} style={{ gap: 8 }}>
                <div className={styles.rowBetween}>
                    <span className={styles.lab}>Foto in cima alla pagina</span>
                    {canManage && activity.cover_image && (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                            <Button variant="ghost" size="sm" onClick={() => coverEditor.current?.open()} disabled={isCoverRemoving}>
                                Cambia la foto
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Togli la foto"
                                onClick={() => setIsCoverRemoveOpen(true)}
                                disabled={isCoverRemoving}
                            >
                                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                            </Button>
                        </span>
                    )}
                </div>
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
                    <img src={activity.cover_image} alt="Copertina" className={styles.coverImg} />
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna foto.
                    </Text>
                )}
            </div>
            <FormGrid cols={1}>
                <TextInput label="Nome del locale" required value={text("name")} onChange={e => setText("name")(e.target.value)} disabled={!canManage} />
                <Textarea
                    label="Presentazione"
                    placeholder="Cosa siete e perché venire"
                    helperText="Due righe: cosa siete e perché venire. Compare sotto il nome."
                    value={text("description")}
                    onChange={e => setText("description")(e.target.value)}
                    disabled={!canManage}
                    rows={3}
                />
            </FormGrid>
            <ConfirmDialog
                isOpen={isCoverRemoveOpen}
                onClose={() => setIsCoverRemoveOpen(false)}
                onConfirm={handleCoverRemove}
                title="Togliere la foto?"
                message="La pagina pubblica resta senza foto in cima finché non ne caricate un'altra."
                confirmLabel="Togli"
                confirmVariant="danger"
                isLoading={isCoverRemoving}
            />
        </div>
    );
}

/** I contatti: l'occhio accanto a quello scritto dice se è sulla pagina. */
export function ContattiEditor() {
    const { canManage, draft } = useActivityDetail();
    const d = draft.draft;
    return (
        <div className={styles.stack}>
            <FormGrid cols={2}>
                {CONTACTS.map(c => {
                    const value = d[c.field] ?? "";
                    const visible = Boolean(d[c.flag]);
                    return (
                        <div key={c.field} className={styles.contact}>
                            <TextInput
                                type={c.type}
                                label={c.label}
                                placeholder={c.placeholder}
                                value={value}
                                onChange={e => draft.set(c.field, e.target.value.trim() === "" ? null : e.target.value)}
                                disabled={!canManage}
                                containerClassName={styles.contactInput}
                            />
                            <div className={styles.contactFlag}>
                                {value.trim() !== "" && (
                                    <IconButton
                                        icon={visible ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
                                        aria-label={`${c.label}: ${visible ? "sulla pagina" : "solo per voi"}`}
                                        aria-pressed={visible}
                                        title={visible ? "Sulla pagina: tocca per tenerlo solo per voi" : "Solo per voi: tocca per metterlo sulla pagina"}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => draft.set(c.flag, !visible)}
                                        disabled={!canManage}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </FormGrid>
            <span className={styles.hint}>L'occhio compare quando il contatto c'è: dice se i clienti lo vedono.</span>
        </div>
    );
}

/** Dove vi trovano: l'indirizzo (col Salva) e Google (subito). */
export function DoveEditor() {
    const { activity, tenantId, reload, canManage } = useActivityDetail();
    const { text, setText } = useText();
    const [isReviewsOpen, setIsReviewsOpen] = useState(false);
    return (
        <div className={styles.stack}>
            <FormGrid cols={2}>
                <TextInput
                    label="Via o piazza"
                    value={text("address")}
                    onChange={e => setText("address")(e.target.value)}
                    disabled={!canManage}
                    containerClassName={FORM_GRID_CLASSES.span}
                />
                <TextInput label="Civico" value={text("street_number")} onChange={e => setText("street_number")(e.target.value)} disabled={!canManage} />
                <TextInput label="CAP" value={text("postal_code")} onChange={e => setText("postal_code")(e.target.value)} disabled={!canManage} />
                <TextInput label="Città" value={text("city")} onChange={e => setText("city")(e.target.value)} disabled={!canManage} />
                <TextInput
                    label="Provincia"
                    helperText="Sigla di 2 lettere"
                    maxLength={2}
                    value={text("province")}
                    onChange={e => setText("province")(e.target.value.toUpperCase())}
                    disabled={!canManage}
                />
            </FormGrid>
            <div className={styles.split} />
            <div className={styles.rowBetween}>
                <div>
                    <span className={styles.subTitle}>Recensioni Google</span>{" "}
                    {activity.google_review_url ? (
                        <StatusBadge variant="success" label="Collegato" />
                    ) : (
                        <StatusBadge variant="neutral" label="Non collegato" />
                    )}
                    <p className={styles.hint}>
                        {activity.google_review_url
                            ? "Chi lascia 4 o 5 stelle viene invitato a recensirvi anche su Google."
                            : "Collegate la scheda Google per invitare i clienti soddisfatti a recensirvi lì."}
                    </p>
                </div>
                {canManage && (
                    <Button variant="secondary" size="sm" onClick={() => setIsReviewsOpen(true)}>
                        {activity.google_review_url ? "Cambia" : "Collega"}
                    </Button>
                )}
            </div>
            <ActivityGoogleReviewsDrawer
                open={isReviewsOpen}
                onClose={() => setIsReviewsOpen(false)}
                activity={activity}
                tenantId={tenantId}
                onSuccess={reload}
            />
        </div>
    );
}

type FlagField = "payment_methods_public" | "services_public" | "fees_public";

function VisibilitySwitch({ field, label }: { field: FlagField; label: string }) {
    const { canManage, draft } = useActivityDetail();
    return (
        <Switch
            size="sm"
            label={label}
            checked={Boolean(draft.draft[field])}
            onChange={value => draft.set(field, value)}
            disabled={!canManage}
        />
    );
}

/** Pagamenti e servizi, ognuno col suo «Visibili». */
export function OffriteEditor() {
    const { canManage, draft } = useActivityDetail();
    const d = draft.draft;
    return (
        <div className={styles.stack}>
            <div className={styles.rowBetween}>
                <span className={styles.lab}>Pagamenti</span>
                <VisibilitySwitch field="payment_methods_public" label="Visibili" />
            </div>
            <PaymentMethodsSection value={d.payment_methods ?? []} onChange={next => draft.set("payment_methods", next)} disabled={!canManage} />
            <div className={styles.split} />
            <div className={styles.rowBetween}>
                <span className={styles.lab}>Servizi</span>
                <VisibilitySwitch field="services_public" label="Visibili" />
            </div>
            <ServicesSection value={d.services ?? []} onChange={next => draft.set("services", next)} disabled={!canManage} />
        </div>
    );
}

/** Al conto: le voci vuote non compaiono. */
export function ContoEditor() {
    const { canManage, draft } = useActivityDetail();
    const d = draft.draft;
    const fees: FeesState = useMemo(() => feesToState(d.fees), [d.fees]);
    return (
        <div className={styles.stack}>
            <div className={styles.rowBetween} style={{ justifyContent: "flex-end" }}>
                <VisibilitySwitch field="fees_public" label="Mostrale ai clienti" />
            </div>
            <FeesSection value={fees} onChange={next => draft.set("fees", buildFeesPayload(next))} disabled={!canManage} />
            <span className={styles.hint}>Le voci vuote non compaiono.</span>
        </div>
    );
}
