import { useState } from "react";
import { useAuth } from "@context/useAuth";
import { useTheme } from "@/context/Theme/useTheme";
import Profile from "@/components/Profile/Profile";
import Text from "@components/ui/Text/Text";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import styles from "./Settings.module.scss";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import { signOut } from "@/services/supabase/auth";

export default function Settings() {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [language, setLanguage] = useState("it");
    const [notifications, setNotifications] = useState(true);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        try {
            setIsLoggingOut(true);
            await signOut();
        } finally {
            setIsLoggingOut(false);
            setShowLogoutModal(false);
        }
    };

    return (
        <div className={styles.settings}>
            <Profile />

            <div className={styles.section}>
                <Text variant="title-sm">Aspetto</Text>
                <CheckboxInput
                    id="darkMode"
                    label="Tema scuro"
                    description="Imposta il tema scuro"
                    checked={theme === "dark"}
                    onChange={() => toggleTheme()}
                />
            </div>

            <div className={styles.section}>
                <Select
                    label="Lingua"
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    aria-label="Seleziona lingua interfaccia"
                >
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                </Select>
            </div>

            <div className={styles.section}>
                <Text variant="title-sm">Notifiche</Text>

                <CheckboxInput
                    id="notifications"
                    checked={notifications}
                    onChange={() => setNotifications(!notifications)}
                    label="Avvisi"
                    description="Ricevi avvisi via email"
                />
            </div>

            <div className={styles.section}>
                <Text variant="title-sm">Account</Text>
                <div className={styles.accountInfo}>
                    <div className={styles.emailField}>
                        <Text as="label" variant="caption" weight={600}>
                            Email
                        </Text>
                        <Text as="span" variant="caption">
                            {user?.email || "—"}
                        </Text>
                    </div>

                    <Button variant="danger" onClick={() => setShowLogoutModal(true)}>
                        Esci dall’account
                    </Button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showLogoutModal}
                title="Esci dall’account"
                description="Sei sicuro di voler uscire? Dovrai effettuare nuovamente l’accesso per rientrare."
                confirmLabel={isLoggingOut ? "Uscita in corso..." : "Esci"}
                cancelLabel="Annulla"
                onConfirm={handleLogout}
                onCancel={() => setShowLogoutModal(false)}
            />
        </div>
    );
}
