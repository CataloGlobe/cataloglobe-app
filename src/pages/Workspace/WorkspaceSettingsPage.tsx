import { useEffect, useMemo, useState } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements/PasswordRequirements";
import { isStrongPassword, isWeakPasswordError } from "@utils/validatePassword";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { useTheme } from "@/context/Theme/useTheme";
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
import { supabase } from "@/services/supabase/client";
import { DeleteAccountDrawer } from "@/pages/Dashboard/Settings/DeleteAccountDrawer";
import styles from "./WorkspaceSettingsPage.module.scss";

export default function WorkspaceSettingsPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { theme, setTheme } = useTheme();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [language, setLanguage] = useState("it");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [draftFirstName, setDraftFirstName] = useState("");
    const [draftLastName, setDraftLastName] = useState("");
    const [draftPhone, setDraftPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [removingAvatar, setRemovingAvatar] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isDeleteAccountDrawerOpen, setIsDeleteAccountDrawerOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    usePageHeader({
        title: "Impostazioni",
        subtitle: "Gestisci il profilo e le preferenze del tuo workspace.",
        sticky: true,
    });

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

    const handleLogout = async () => {
        try {
            setLoggingOut(true);
            await signOut();
        } finally {
            setLoggingOut(false);
            setShowLogoutModal(false);
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
            if (err instanceof Error && isWeakPasswordError(err.message)) {
                setPasswordError("La password non soddisfa i requisiti di sicurezza.");
            } else {
                setPasswordError("Non è stato possibile aggiornare la password. Riprova.");
            }
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.cards}>
                    <Card title="Profilo" className={styles.card}>
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

                        <div className={styles.profileRow}>
                            <div className={styles.profileMeta}>
                                <Text variant="body" weight={600}>
                                    {displayName}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    {displayEmail}
                                </Text>
                            </div>

                            <Button
                                variant="secondary"
                                onClick={() => setDrawerOpen(true)}
                                disabled={loadingProfile}
                            >
                                Modifica profilo
                            </Button>
                        </div>
                    </Card>

                    {/* TODO: Implementare Tema e Lingua */}
                    {/* <Card title="Preferenze" className={styles.card}>
                        <div className={styles.preferencesGrid}>
                            <Select
                                label="Tema"
                                value={theme}
                                onChange={e => setTheme(e.target.value as "light" | "dark")}
                                options={[
                                    { value: "light", label: "Chiaro" },
                                    { value: "dark", label: "Scuro" }
                                ]}
                            />

                            <Select
                                label="Lingua"
                                value={language}
                                onChange={e => setLanguage(e.target.value)}
                                options={[
                                    { value: "it", label: "Italiano" },
                                    { value: "en", label: "English" }
                                ]}
                            />
                        </div>
                    </Card> */}

                    <Card title="Account e sicurezza" className={styles.card}>
                        <div className={styles.accountGrid}>
                            <div className={styles.accountField}>
                                <Text variant="caption" colorVariant="muted">
                                    Email
                                </Text>
                                <Text variant="body-sm">{displayEmail}</Text>
                            </div>

                            <div className={styles.accountField}>
                                <Text variant="caption" colorVariant="muted">
                                    Password
                                </Text>
                                <Text variant="body-sm">••••••••</Text>
                            </div>

                            <div className={styles.accountActions}>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        resetPasswordState();
                                        setShowPasswordModal(true);
                                    }}
                                >
                                    Cambia password
                                </Button>
                            </div>
                        </div>

                        <div className={styles.logoutRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Chiudi la sessione attiva del tuo workspace.
                            </Text>
                            <Button
                                variant="danger"
                                onClick={() => setShowLogoutModal(true)}
                                disabled={loggingOut}
                            >
                                Logout
                            </Button>
                        </div>
                    </Card>

                    <Card title="Eliminazione account" className={styles.card}>
                        <div className={styles.logoutRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Questa azione è irreversibile. Il tuo account verrà eliminato
                                definitivamente dopo 30 giorni.
                            </Text>
                            <Button
                                variant="danger"
                                onClick={() => setIsDeleteAccountDrawerOpen(true)}
                            >
                                Elimina account
                            </Button>
                        </div>
                    </Card>
                </div>
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
                        <form
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

            <ModalLayout
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <Text as="h2" variant="title-sm" weight={700}>
                        Vuoi davvero uscire?
                    </Text>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <Text variant="body-sm">
                        L&apos;accesso verrà interrotto e dovrai effettuare nuovamente il login per
                        rientrare.
                    </Text>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setShowLogoutModal(false)}>
                        Annulla
                    </Button>
                    <Button variant="primary" onClick={handleLogout} disabled={loggingOut}>
                        {loggingOut ? "Uscita in corso..." : "Esci"}
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>

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
                    <form className={styles.modalForm} onSubmit={handlePasswordChange}>
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
