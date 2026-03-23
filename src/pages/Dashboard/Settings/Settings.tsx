import { useState } from "react";
import { useAuth } from "@context/useAuth";
import { useTheme } from "@/context/Theme/useTheme";
import Profile from "@/components/Profile/Profile";
import Text from "@components/ui/Text/Text";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import styles from "./Settings.module.scss";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui";
import { signOut } from "@/services/supabase/auth";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { DeleteAccountDrawer } from "./DeleteAccountDrawer";

export default function Settings() {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [language, setLanguage] = useState("it");
    const [notifications, setNotifications] = useState(true);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isDeleteAccountDrawerOpen, setIsDeleteAccountDrawerOpen] = useState(false);

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
            <PageHeader title="Impostazioni" subtitle="Configura il tuo account e le preferenze." />

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

            <div className={styles.section}>
                <Text variant="title-sm">Eliminazione account</Text>
                <div className={styles.dangerZone}>
                    <div>
                        <Text variant="body-sm" weight={600}>
                            Elimina account
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Questa azione eliminerà definitivamente il tuo account e tutti i dati
                            associati. Avrai 30 giorni per recuperarlo.
                        </Text>
                    </div>
                    <Button
                        variant="danger"
                        onClick={() => setIsDeleteAccountDrawerOpen(true)}
                    >
                        Elimina account
                    </Button>
                </div>
            </div>

            <DeleteAccountDrawer
                open={isDeleteAccountDrawerOpen}
                onClose={() => setIsDeleteAccountDrawerOpen(false)}
            />

            <ModalLayout
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-sm" weight={700}>
                            Esci dall’account
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <Text variant="body">
                        Sei sicuro di voler uscire? Dovrai effettuare nuovamente l’accesso per
                        rientrare.
                    </Text>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setShowLogoutModal(false)}>
                        Annulla
                    </Button>

                    <Button variant="primary" onClick={handleLogout}>
                        {isLoggingOut ? "Uscita in corso..." : "Esci"}
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </div>
    );
}
