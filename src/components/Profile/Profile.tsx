import { useEffect, useState } from "react";
import { useAuth } from "@context/useAuth";
import { getProfile, updateProfile, uploadAvatar } from "@services/supabase/profile";
import type { Profile } from "@/types/database";
import Text from "@components/ui/Text/Text";
import { Button } from "@components/ui";
import styles from "./Profile.module.scss";
import { TextInput } from "../ui/Input/TextInput";
import { FileInput } from "../ui/Input/FileInput";

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
                setAvatarPreview(data?.avatar_url || null);
            });
        }
    }, [user]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !profile) return;

        setLoading(true);
        setMessage("");

        try {
            let avatarUrl = profile.avatar_url || "";

            if (avatarFile) {
                avatarUrl = await uploadAvatar(
                    user.id,
                    avatarFile,
                    profile.avatar_url || undefined
                );
            }

            await updateProfile(user.id, {
                name: profile.name || "",
                avatar_url: avatarUrl
            });

            setProfile({ ...profile, avatar_url: avatarUrl });
            setAvatarPreview(avatarUrl);
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
            setAvatarPreview(profile?.avatar_url || null);
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
                            src={avatarPreview || "/default-avatar.svg"}
                            alt={`Avatar di ${profile?.name || "utente"}`}
                            className={styles.avatar}
                        />
                    </div>

                    {/* Dati utente */}
                    <div className={styles.formFields}>
                        <TextInput
                            label="Nome"
                            value={profile?.name || ""}
                            onChange={e => setProfile({ ...profile!, name: e.target.value })}
                        />

                        <TextInput label="Email" type={"email"} value={user.email ?? ""} disabled />

                        <FileInput
                            label="Foto copertina"
                            accept="image/*"
                            helperText="PNG o JPG, max 5MB"
                            onChange={handleAvatarFileChange}
                        />

                        <Button
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
