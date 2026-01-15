import { useState } from "react";
import { useAuth } from "@context/useAuth";
import { useTheme } from "@/context/Theme/useTheme";
import Profile from "@/components/Profile/Profile";
import Text from "@components/ui/Text/Text";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import styles from "./Settings.module.scss";
import { Select } from "@/components/ui/Select/Select";

export default function Settings() {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [language, setLanguage] = useState("it");
    const [notifications, setNotifications] = useState(true);

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
                <Text variant="title-sm">Lingua</Text>
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
                    <Text variant="body">
                        <strong>Email:</strong> {user?.email || "—"}
                    </Text>
                    <button className={styles.logoutBtn}>Esci dall’account</button>
                </div>
            </div>
        </div>
    );
}
