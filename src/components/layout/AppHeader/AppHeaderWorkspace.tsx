import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { getProfile } from "@/services/supabase/profile";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import styles from "./AppHeader.module.scss";

interface AppHeaderWorkspaceProps {
    onOpenMobileSidebar?: () => void;
}

export function AppHeaderWorkspace({ onOpenMobileSidebar }: AppHeaderWorkspaceProps) {
    const { user } = useAuth();
    const [firstName, setFirstName] = useState<string | null>(null);

    const fetchProfile = useCallback(() => {
        if (!user?.id) return;
        getProfile(user.id)
            .then(p => setFirstName(p?.first_name ?? null))
            .catch(() => {});
    }, [user?.id]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        window.addEventListener("profile:updated", fetchProfile);
        return () => window.removeEventListener("profile:updated", fetchProfile);
    }, [fetchProfile]);

    return (
        <div className={styles.appHeader}>
            <div className={styles.left}>
                {onOpenMobileSidebar && (
                    <button
                        type="button"
                        className={styles.mobileMenuToggle}
                        onClick={onOpenMobileSidebar}
                        aria-label="Apri menù di navigazione"
                    >
                        <Menu size={20} />
                    </button>
                )}
                <HeaderLogo />
                {firstName && (
                    <>
                        <span className={styles.separator} aria-hidden="true">/</span>
                        <span className={styles.greeting}>Ciao {firstName}</span>
                    </>
                )}
            </div>
            <div className={styles.right}>
                <HeaderNotifications />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
