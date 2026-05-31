import { useMemo } from "react";
import { RadioGroup, type RadioOption } from "@/components/ui/RadioGroup/RadioGroup";
import type { UserRole } from "@/lib/permissions";

interface RoleSelectorProps {
    value: UserRole | null;
    onChange: (role: UserRole) => void;
    /** Ruoli che il caller può invitare (calcolato via canInviteRole nel parent). */
    availableRoles: UserRole[];
    disabled?: boolean;
}

const ROLE_META: Record<Exclude<UserRole, "owner">, { label: string; description: string }> = {
    admin: {
        label: "Admin",
        description: "Accesso completo alla gestione di tutte le sedi."
    },
    manager: {
        label: "Manager",
        description: "Gestisce sedi specifiche, può invitare staff e viewer."
    },
    staff: {
        label: "Staff",
        description: "Operatività sulle sedi assegnate."
    },
    viewer: {
        label: "Viewer",
        description: "Sola lettura sulle sedi assegnate."
    }
};

const VISIBLE_ROLES: Array<Exclude<UserRole, "owner">> = ["admin", "manager", "staff", "viewer"];

/**
 * Selettore ruolo a 4 valori. Le opzioni non disponibili al caller sono
 * mostrate disabilitate (matrice completa visibile, no opzioni nascoste).
 */
export function RoleSelector({ value, onChange, availableRoles, disabled }: RoleSelectorProps) {
    const options: RadioOption[] = useMemo(
        () =>
            VISIBLE_ROLES.map(r => {
                const meta = ROLE_META[r];
                const isAvailable = availableRoles.includes(r);
                return {
                    value: r,
                    label: meta.label,
                    description: isAvailable
                        ? meta.description
                        : `${meta.description} Non disponibile per il tuo ruolo.`,
                    disabled: !isAvailable
                };
            }),
        [availableRoles]
    );

    return (
        <RadioGroup
            label="Ruolo"
            value={value ?? ""}
            onChange={next => onChange(next as UserRole)}
            options={options}
            disabled={disabled}
            required
        />
    );
}
