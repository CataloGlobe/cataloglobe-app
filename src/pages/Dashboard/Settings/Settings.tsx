import { useState } from "react";
import { useAuth } from "@context/useAuth";
import { useTheme } from "@/context/Theme/useTheme";
import Profile from "@/components/Profile/Profile";
import Text from "@components/ui/Text/Text";
import styles from "./Settings.module.scss";

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
                <div className={styles.row}>
                    <label htmlFor="darkMode">
                        <Text as="span" variant="body">
                            Tema scuro
                        </Text>
                    </label>
                    <input
                        id="darkMode"
                        type="checkbox"
                        checked={theme === "dark"}
                        onChange={() => toggleTheme()}
                    />
                </div>
            </div>

            <div className={styles.section}>
                <Text variant="title-sm">Lingua</Text>
                <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    aria-label="Seleziona lingua interfaccia"
                >
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                </select>
            </div>

            <div className={styles.section}>
                <Text variant="title-sm">Notifiche</Text>
                <div className={styles.row}>
                    <label htmlFor="notifications">
                        <Text as="span" variant="body">
                            Ricevi avvisi via email
                        </Text>
                    </label>
                    <input
                        id="notifications"
                        type="checkbox"
                        checked={notifications}
                        onChange={() => setNotifications(!notifications)}
                    />
                </div>
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
