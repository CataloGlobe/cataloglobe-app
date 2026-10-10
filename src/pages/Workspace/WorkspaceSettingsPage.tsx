import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements/PasswordRequirements";
import { isStrongPassword, weakPasswordMessage } from "@utils/validatePassword";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getProfile,
    updateProfile,
    updateProfileAvatar,
    uploadAvatar,
    deleteAvatar,
    clearProfileAvatar
} from "@/services/supabase/profile";
import { signOut } from "@/services/supabase/auth";
import type { Profile } from "@/types/database";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { supabase } from "@/services/supabase/client";
import { DeleteAccountDrawer } from "@/pages/Dashboard/Settings/DeleteAccountDrawer";
import styles from "./WorkspaceSettingsPage.module.scss";

export default function WorkspaceSettingsPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [draftFirstName, setDraftFirstName] = useState("");
    const [draftLastName, setDraftLastName] = useState("");
    const [draftPhone, setDraftPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [removingAvatar, setRemovingAvatar] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showLogoutAllModal, setShowLogoutAllModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isDeleteAccountDrawerOpen, setIsDeleteAccountDrawerOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    // T17 WS4: «Account», senza barra di pagina; in cima il ritorno alle attività.
    usePageTitle("Account");

    useEffect(() => {
        if (!user) return;
        setLoadingProfile(true);

        getProfile(user.id)
            .then(data => {
                setProfile(data);
                setDraftFirstName(data?.first_name ?? "");
                setDraftLastName(data?.last_name ?? "");
                setDraftPhone(data?.phone ?? "");
            })
            .finally(() => setLoadingProfile(false));
    }, [user?.id]);

    useEffect(() => {
        if (!drawerOpen) return;
        setDraftFirstName(profile?.first_name ?? "");
        setDraftLastName(profile?.last_name ?? "");
        setDraftPhone(profile?.phone ?? "");
    }, [drawerOpen, profile?.first_name, profile?.last_name, profile?.phone, profile?.avatar_url]);

    const displayName = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(" ");

        const metaParts = [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(
            Boolean
        );
        if (metaParts.length > 0) return metaParts.join(" ");

        return "—";
    }, [
        profile?.first_name,
        profile?.last_name,
        user?.user_metadata?.first_name,
        user?.user_metadata?.last_name
    ]);

    const displayEmail = user?.email || "—";

    const initials =
        displayName === "—"
            ? displayEmail.charAt(0).toUpperCase()
            : displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(w => w.charAt(0).toUpperCase())
                  .join("");

    const avatarUrl = useMemo(() => {
        if (profile?.avatar_url) {
            const baseUrl = supabase.storage.from("avatars").getPublicUrl(profile.avatar_url)
                .data.publicUrl;
            const cacheBuster = profile.updated_at
                ? `?t=${encodeURIComponent(profile.updated_at)}`
                : "";
            return `${baseUrl}${cacheBuster}`;
        }
        return null;
    }, [profile?.avatar_url, profile?.updated_at]);

    // Avatar salvato SUBITO al conferma dell'editor (immagine baked 1:1),
    // coerente con la rimozione che è già immediata e standalone. Nome/telefono
    // restano legati al "Salva modifiche" del form.
    const handleAvatarConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!user || !file) return;
        try {
            const avatarPath = await uploadAvatar(user.id, file);
            await updateProfileAvatar(user.id, avatarPath);
            const nextUpdatedAt = new Date().toISOString();
            setProfile(prev =>
                prev ? { ...prev, avatar_url: avatarPath, updated_at: nextUpdatedAt } : prev
            );
            showToast({ message: "Avatar aggiornato.", type: "success" });
            window.dispatchEvent(new CustomEvent("profile:updated"));
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Errore durante il salvataggio dell'avatar.";
            showToast({ message, type: "error" });
        }
    };

    const handleRemoveAvatar = async () => {
        if (!user || !profile?.avatar_url) return;
        setRemovingAvatar(true);
        try {
            await deleteAvatar(profile.avatar_url);
            await clearProfileAvatar(user.id);
            const nextUpdatedAt = new Date().toISOString();
            setProfile(prev =>
                prev ? { ...prev, avatar_url: null, updated_at: nextUpdatedAt } : null
            );
            window.dispatchEvent(new CustomEvent("profile:updated"));
        } catch (err) {
            console.error("[WorkspaceSettings] remove avatar failed:", err);
            showToast({ message: "Impossibile rimuovere l'avatar. Riprova.", type: "error" });
        } finally {
            setRemovingAvatar(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        const nextFirstName = draftFirstName.trim();
        const nextLastName = draftLastName.trim();
        if (!nextFirstName) return;

        setSaving(true);
        try {
            await updateProfile(user.id, {
                first_name: nextFirstName || null,
                last_name: nextLastName || null,
                phone: draftPhone.trim() || null
            });

            setProfile(prev =>
                prev
                    ? {
                          ...prev,
                          first_name: nextFirstName || null,
                          last_name: nextLastName || null,
                          phone: draftPhone.trim() || null
                      }
                    : {
                          id: user.id,
                          first_name: nextFirstName || null,
                          last_name: nextLastName || null,
                          phone: draftPhone.trim() || null,
                          avatar_url: null,
                          updated_at: new Date().toISOString(),
                          created_at: new Date().toISOString()
                      }
            );
            setDrawerOpen(false);
            window.dispatchEvent(new CustomEvent("profile:updated"));
        } catch (err) {
            console.error("[WorkspaceSettings] update profile failed:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async (everywhere = false) => {
        try {
            setLoggingOut(true);
            await signOut({ everywhere });
        } catch (err) {
            console.error("[WorkspaceSettings] sign out failed:", err);
            showToast({ message: "Uscita non riuscita. Riprova.", type: "error" });
        } finally {
            setLoggingOut(false);
            setShowLogoutModal(false);
            setShowLogoutAllModal(false);
        }
    };

    const resetPasswordState = () => {
        setPassword("");
        setConfirmPassword("");
        setPasswordError(null);
        setPasswordSuccess(false);
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordLoading) return;

        setPasswordError(null);
        setPasswordSuccess(false);

        if (!isStrongPassword(password)) {
            setPasswordError("La password non soddisfa i requisiti di sicurezza.");
            return;
        }

        if (password !== confirmPassword) {
            setPasswordError("Le password non coincidono.");
            return;
        }

        try {
            setPasswordLoading(true);
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setPasswordSuccess(true);
            setPassword("");
            setConfirmPassword("");
            setShowPasswordModal(false);
            showToast({ message: "Password aggiornata con successo", type: "success" });
        } catch (err) {
            const weak = weakPasswordMessage(err);
            if (weak) {
                setPasswordError(weak);
            } else {
                setPasswordError("Non è stato possibile aggiornare la password. Riprova.");
            }
        } finally {
            setPasswordLoading(false);
        }
    };

    const accountRows: Array<{
        label: string;
        description: string;
        action: string;
        onClick: () => void;
        disabled?: boolean;
        danger?: boolean;
    }> = [
        {
            label: "Password",
            description: "Serve per accedere insieme all'email.",
            action: "Cambia password",
            onClick: () => {
                resetPasswordState();
                setShowPasswordModal(true);
            }
        },
        {
            label: "Esci",
            description: "Chiude la sessione su questo dispositivo.",
            action: "Esci",
            onClick: () => setShowLogoutModal(true),
            disabled: loggingOut
        },
        {
            label: "Esci da tutti i dispositivi",
            description: "Chiude ogni sessione aperta, anche su telefoni e computer che non hai con te. Al prossimo accesso ti chiediamo il codice via email.",
            action: "Esci da tutti",
            onClick: () => setShowLogoutAllModal(true),
            disabled: loggingOut
        },
        {
            label: "Elimina account",
            description: "Viene eliminato dopo 30 giorni; fino ad allora puoi recuperarlo accedendo di nuovo.",
            action: "Elimina account",
            onClick: () => setIsDeleteAccountDrawerOpen(true),
            danger: true
        }
    ];

    return (
        <div className={styles.page}>
            {/* T17 WS4: colonna 720, una card: profilo in testa, righe
                Password ed Esci, in fondo «Elimina account». */}
            <div className={styles.container}>
                <Link to="/workspace" className={styles.back}>
                    <ArrowLeft size={14} aria-hidden />
                    <Text as="span" variant="body-sm" colorVariant="primary">
                        Le tue attività
                    </Text>
                </Link>

                <Text as="h1" variant="title-lg" weight={700} className={styles.title}>
                    Account
                </Text>

                <Card flush className={styles.card}>
                    <div className={styles.profile}>
                        <span className={styles.avatar} aria-hidden="true">
                            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
                        </span>
                        <div className={styles.profileMeta}>
                            <Text as="h2" variant="title-sm" weight={700} className={styles.profileName}>
                                {displayName}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {displayEmail}
                            </Text>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setDrawerOpen(true)}
                            disabled={loadingProfile}
                            className={styles.profileAction}
                        >
                            Modifica profilo
                        </Button>
                    </div>

                    {accountRows.map(row => (
                        <div key={row.label} className={styles.row}>
                            {/* Da 640 in su: nome, descrizione e bottone a destra. */}
                            <div className={styles.rowText}>
                                <Text variant="body-sm" weight={600} className={row.danger ? styles.danger : undefined}>
                                    {row.label}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    {row.description}
                                </Text>
                            </div>
                            <Button
                                variant={row.danger ? "outline-danger" : "secondary"}
                                size="sm"
                                onClick={row.onClick}
                                disabled={row.disabled}
                                className={styles.rowButton}
                            >
                                {row.action}
                            </Button>
                            {/* Sotto 640: tutta la riga è il bottone, alta 56, con la freccia. */}
                            <button
                                type="button"
                                className={`${styles.rowTap} ${row.danger ? styles.danger : ""}`}
                                onClick={row.onClick}
                                disabled={row.disabled}
                            >
                                <span>{row.action}</span>
                                <ChevronRight size={16} aria-hidden />
                            </button>
                        </div>
                    ))}
                </Card>
            </div>

            <DeleteAccountDrawer
                open={isDeleteAccountDrawerOpen}
                onClose={() => setIsDeleteAccountDrawerOpen(false)}
            />

            <SystemDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}>
                <DrawerLayout
                    header={
                        <div className={styles.drawerHeader}>
                            <Text variant="title-sm" weight={700}>
                                Modifica profilo
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Aggiorna nome e recapiti del tuo account.
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="workspace-profile-form"
                                disabled={saving || !draftFirstName.trim()}
                            >
                                {saving ? "Salvataggio..." : "Salva modifiche"}
                            </Button>
                        </div>
                    }
                >
                    <div className={styles.drawerForm}>
                        <div className={styles.avatarField}>
                                <ImageUploadEditor
                                    aspectRatio={IMAGE_UPLOAD_PRESETS.avatar.aspectRatio}
                                    backgroundFillModes={IMAGE_UPLOAD_PRESETS.avatar.backgroundFillModes}
                                    maxSizeMB={IMAGE_UPLOAD_PRESETS.avatar.maxSizeMB}
                                    compressLongEdge={IMAGE_UPLOAD_PRESETS.avatar.compressLongEdge}
                                    bake={{ size: 512, format: "image/webp", quality: 0.9, fileName: "avatar.webp" }}
                                    fieldLabel={IMAGE_UPLOAD_PRESETS.avatar.fieldLabel}
                                    drawerTitle={IMAGE_UPLOAD_PRESETS.avatar.drawerTitle}
                                    requiresConfirm={IMAGE_UPLOAD_PRESETS.avatar.requiresConfirm}
                                    initialSource={avatarUrl}
                                    initialAspectRatio={1}
                                    onConfirm={handleAvatarConfirm}
                                    onRemove={handleRemoveAvatar}
                                    removing={removingAvatar}
                                />
                        </div>
                        <form noValidate
                            id="workspace-profile-form"
                            onSubmit={handleSaveProfile}
                            className={styles.drawerForm}
                        >
                            <TextInput
                                label="Nome"
                                value={draftFirstName}
                                onChange={e => setDraftFirstName(e.target.value)}
                                required
                            />

                            <TextInput
                                label="Cognome"
                                value={draftLastName}
                                onChange={e => setDraftLastName(e.target.value)}
                            />

                            <TextInput
                                label="Telefono"
                                type="tel"
                                value={draftPhone}
                                onChange={e => setDraftPhone(e.target.value)}
                                placeholder="+39 000 0000000"
                            />

                            <TextInput label="Email" value={displayEmail} disabled />
                        </form>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            <ConfirmDialog
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={() => handleLogout()}
                title="Vuoi davvero uscire?"
                message="L'accesso verrà interrotto e dovrai effettuare nuovamente il login per rientrare."
                confirmLabel={loggingOut ? "Uscita in corso..." : "Esci"}
                confirmVariant="primary"
                isLoading={loggingOut}
            />

            <ConfirmDialog
                isOpen={showLogoutAllModal}
                onClose={() => setShowLogoutAllModal(false)}
                onConfirm={() => handleLogout(true)}
                title="Uscire da tutti i dispositivi?"
                message="Chiudiamo ogni sessione aperta con questo account, compresa questa. Per rientrare da qualsiasi dispositivo serviranno password e codice via email."
                confirmLabel={loggingOut ? "Uscita in corso..." : "Esci da tutti"}
                confirmVariant="primary"
                isLoading={loggingOut}
            />

            <ModalLayout
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                width="sm"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.modalHeader}>
                        <Text as="h2" variant="title-sm" weight={700}>
                            Cambia password
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Imposta una nuova password per il tuo account.
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <form noValidate className={styles.modalForm} onSubmit={handlePasswordChange}>
                        <TextInput
                            label="Nuova password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            disabled={passwordLoading}
                        />

                        <PasswordRequirements value={password} />

                        <TextInput
                            label="Conferma nuova password"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            disabled={passwordLoading}
                        />

                        {passwordError && (
                            <Text
                                as="p"
                                colorVariant="error"
                                variant="caption"
                                className={styles.modalFeedback}
                            >
                                {passwordError}
                            </Text>
                        )}

                        {passwordSuccess && (
                            <Text
                                as="p"
                                colorVariant="success"
                                variant="caption"
                                className={styles.modalFeedback}
                            >
                                Password aggiornata con successo.
                            </Text>
                        )}
                    </form>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button
                        variant="secondary"
                        onClick={() => setShowPasswordModal(false)}
                        disabled={passwordLoading}
                    >
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handlePasswordChange}
                        loading={passwordLoading}
                        disabled={passwordLoading}
                    >
                        Salva
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </div>
    );
}
