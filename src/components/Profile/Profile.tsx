import { useEffect, useState } from "react";
import { useAuth } from "@context/useAuth";
import { getProfile, updateProfile, uploadAvatar } from "@services/supabase/profile";
import type { Profile } from "@/types/database";
import Text from "@components/ui/Text/Text";
import { Input, Button } from "@components/ui";
import styles from "./Profile.module.scss";

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
            setMessage("Profilo aggiornato con successo! ✅");
        } catch (err) {
            console.error(err);
            setMessage("Errore durante l'aggiornamento del profilo.");
        } finally {
            setLoading(false);
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
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
                        <label htmlFor="avatarUpload" className={styles.uploadLabel}>
                            Cambia foto
                            <input
                                id="avatarUpload"
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                hidden
                            />
                        </label>
                    </div>

                    {/* Dati utente */}
                    <div className={styles.formFields}>
                        <Input
                            label="Nome"
                            type="text"
                            value={profile?.name || ""}
                            onChange={e => setProfile({ ...profile!, name: e.target.value })}
                        />

                        <Input label="Email" type="email" value={user.email ?? ""} disabled />

                        <Button
                            label={loading ? "Salvataggio..." : "Salva modifiche"}
                            variant="primary"
                            fullWidth
                            disabled={loading}
                            aria-busy={loading}
                        />
                    </div>
                </div>

                {message && (
                    <Text
                        variant="body"
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
