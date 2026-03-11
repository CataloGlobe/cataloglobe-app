import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@context/useAuth";
import { getProfile, updateProfile, uploadAvatar } from "@services/supabase/profile";
import type { Profile } from "@/types/database";
import Text from "@components/ui/Text/Text";
import { Button } from "@components/ui";
import styles from "./Profile.module.scss";
import { TextInput } from "../ui/Input/TextInput";
import { FileInput } from "../ui/Input/FileInput";
import { supabase } from "@/services/supabase/client";

export default function Profile() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            getProfile(user.id).then(data => {
                setProfile(data);
                setAvatarPreview(null);
            });
        }
    }, [user]);

    const displayName = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        return parts.length ? parts.join(" ") : "utente";
    }, [profile?.first_name, profile?.last_name]);

    const avatarUrl = useMemo(() => {
        if (avatarPreview && avatarPreview.startsWith("blob:")) {
            return avatarPreview;
        }
        if (profile?.avatar_url) {
            return supabase.storage.from("avatars").getPublicUrl(profile.avatar_url).data.publicUrl;
        }
        return "/default-avatar.svg";
    }, [avatarPreview, profile?.avatar_url]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !profile) return;

        setLoading(true);
        setMessage("");

        try {
            let avatarPath = profile.avatar_url || "";

            if (avatarFile) {
                avatarPath = await uploadAvatar(user.id, avatarFile);
            }

            await updateProfile(user.id, {
                first_name: profile.first_name || null,
                last_name: profile.last_name || null,
                avatar_url: avatarPath
            });

            setProfile({ ...profile, avatar_url: avatarPath });
            setAvatarPreview(null);
            setMessage("Profilo aggiornato con successo!");
        } catch (err) {
            console.error(err);
            setMessage("Errore durante l'aggiornamento del profilo.");
        } finally {
            setLoading(false);
        }
    }

    function handleAvatarFileChange(file: File | null) {
        setAvatarFile(file);

        if (file) {
            setAvatarPreview(URL.createObjectURL(file));
        } else {
            setAvatarPreview(null);
        }
    }

    if (!user) return null;

    return (
        <div className={styles.profile}>
            <form onSubmit={handleSubmit} aria-label="Form profilo utente">
                <div className={styles.infoGrid}>
                    {/* Avatar */}
                    <div className={styles.avatarSection}>
                        <img
                            src={avatarUrl}
                            alt={`Avatar di ${displayName}`}
                            className={styles.avatar}
                        />
                    </div>

                    {/* Dati utente */}
                    <div className={styles.formFields}>
                        <TextInput
                            label="Nome"
                            value={profile?.first_name || ""}
                            onChange={e => setProfile({ ...profile!, first_name: e.target.value })}
                        />

                        <TextInput
                            label="Cognome"
                            value={profile?.last_name || ""}
                            onChange={e => setProfile({ ...profile!, last_name: e.target.value })}
                        />

                        <TextInput label="Email" type={"email"} value={user.email ?? ""} disabled />

                        <FileInput
                            label="Foto copertina"
                            accept="image/*"
                            helperText="PNG o JPG, max 5MB"
                            onChange={handleAvatarFileChange}
                        />

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            loading={loading}
                            disabled={loading}
                            aria-busy={loading}
                        >
                            {loading ? "Salvataggio..." : "Salva modifiche"}
                        </Button>
                    </div>
                </div>

                {message && (
                    <Text
                        variant="caption"
                        colorVariant={message.includes("Errore") ? "error" : "success"}
                        align="center"
                        className={styles.message}
                    >
                        {message}
                    </Text>
                )}
            </form>
        </div>
    );
}
