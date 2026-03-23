import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { useTheme } from "@/context/Theme/useTheme";
import { getProfile, updateProfile, updateProfileAvatar, uploadAvatar } from "@/services/supabase/profile";
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
    const [draftAvatarPreview, setDraftAvatarPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isDeleteAccountDrawerOpen, setIsDeleteAccountDrawerOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoadingProfile(true);

        getProfile(user.id)
            .then(data => {
                setProfile(data);
                setDraftFirstName(data?.first_name ?? "");
                setDraftLastName(data?.last_name ?? "");
                setDraftPhone(data?.phone ?? "");
                setDraftAvatarPreview(null);
            })
            .finally(() => setLoadingProfile(false));
    }, [user?.id]);

    useEffect(() => {
        if (!drawerOpen) return;
        setDraftFirstName(profile?.first_name ?? "");
        setDraftLastName(profile?.last_name ?? "");
        setDraftPhone(profile?.phone ?? "");
        setDraftAvatarPreview(null);
        setAvatarFile(null);
    }, [
        drawerOpen,
        profile?.first_name,
        profile?.last_name,
        profile?.phone,
        profile?.avatar_url
    ]);

    const displayName = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(" ");

        const metaParts = [
            user?.user_metadata?.first_name,
            user?.user_metadata?.last_name
        ].filter(Boolean);
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
        if (draftAvatarPreview && draftAvatarPreview.startsWith("blob:")) {
            return draftAvatarPreview;
        }
        if (profile?.avatar_url) {
            return supabase.storage.from("avatars").getPublicUrl(profile.avatar_url).data.publicUrl;
        }
        return "/default-avatar.svg";
    }, [draftAvatarPreview, profile?.avatar_url]);

    const handleAvatarFileChange = (file: File | null) => {
        setAvatarFile(file);
        if (file) {
            setDraftAvatarPreview(URL.createObjectURL(file));
        } else {
            setDraftAvatarPreview(profile?.avatar_url ?? null);
        }
    };

    useEffect(() => {
        if (!draftAvatarPreview || !draftAvatarPreview.startsWith("blob:")) return;
        return () => {
            URL.revokeObjectURL(draftAvatarPreview);
        };
    }, [draftAvatarPreview]);

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

            let nextAvatarPath = profile?.avatar_url ?? null;
            if (avatarFile) {
                const avatarPath = await uploadAvatar(user.id, avatarFile);
                await updateProfileAvatar(user.id, avatarPath);
                nextAvatarPath = avatarPath;
            }

            setProfile(prev =>
                prev
                    ? {
                          ...prev,
                          first_name: nextFirstName || null,
                          last_name: nextLastName || null,
                          phone: draftPhone.trim() || null,
                          avatar_url: nextAvatarPath
                      }
                    : {
                          id: user.id,
                          first_name: nextFirstName || null,
                          last_name: nextLastName || null,
                          phone: draftPhone.trim() || null,
                          avatar_url: nextAvatarPath,
                          created_at: new Date().toISOString()
                      }
            );
            setDraftAvatarPreview(null);
            setAvatarFile(null);
            setDrawerOpen(false);
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

        if (password.length < 8) {
            setPasswordError("La password deve contenere almeno 8 caratteri.");
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
        } catch {
            setPasswordError("Non è stato possibile aggiornare la password. Riprova.");
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <PageHeader
                    title="Impostazioni"
                    subtitle="Gestisci il profilo e le preferenze del tuo workspace."
                />

                <div className={styles.cards}>
                    <Card title="Profilo" className={styles.card}>
                        <div className={styles.profileRow}>
                            <div className={styles.profileInfo}>
                                <img
                                    src={avatarUrl}
                                    alt={`Avatar di ${displayName}`}
                                    className={styles.avatar}
                                />
                                <div className={styles.profileMeta}>
                                    <Text variant="body" weight={600}>
                                        {displayName}
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        {displayEmail}
                                    </Text>
                                </div>
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

                    <Card title="Preferenze" className={styles.card}>
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
                    </Card>

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
                                Aggiorna nome e avatar del tuo account.
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
                    <form
                        id="workspace-profile-form"
                        onSubmit={handleSaveProfile}
                        className={styles.drawerForm}
                    >
                        <div className={styles.drawerAvatarRow}>
                            <img
                                src={avatarUrl}
                                alt="Anteprima avatar"
                                className={styles.drawerAvatar}
                            />
                            <Text variant="body-sm" colorVariant="muted">
                                PNG o JPG, max 5MB.
                            </Text>
                        </div>

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

                        <FileInput
                            label="Avatar"
                            accept="image/png,image/jpeg"
                            helperText="PNG o JPG, max 5MB."
                            maxSizeMb={5}
                            onChange={handleAvatarFileChange}
                        />
                    </form>
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
