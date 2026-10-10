import { useNavigate } from "react-router-dom";
import { LogOut, Shield, User } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { Menu } from "@/components/ui/Menu";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import styles from "./AppHeader.module.scss";

export function HeaderUserMenu() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const { fullName, email, avatarUrl, showAdminEntry } = useCurrentUserProfile();

    const displayName = fullName ?? "Account";
    const avatarName = fullName ?? email;

    const trigger = (
        <button type="button" className={styles.userButton} aria-label="Profilo utente">
            <Avatar name={avatarName} imageUrl={avatarUrl} size="md" rounded />
        </button>
    );

    return (
        <Menu trigger={trigger} align="end" side="bottom">
            <Menu.Label>
                <div className={styles.userName}>{displayName}</div>
                <div className={styles.userEmail}>{email}</div>
            </Menu.Label>
            <Menu.Separator />
            <Menu.Item icon={User} onSelect={() => navigate("/workspace/account")}>
                Account
            </Menu.Item>
            {showAdminEntry && (
                <Menu.Item icon={Shield} onSelect={() => navigate("/admin")}>
                    Area admin
                </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item icon={LogOut} onSelect={() => void signOut()}>
                Esci
            </Menu.Item>
        </Menu>
    );
}
