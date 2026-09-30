import { useMemo } from "react";
import { RadioGroup, type RadioOption } from "@/components/ui/RadioGroup/RadioGroup";
import type { UserRole } from "@/lib/permissions";
import { ROLE_LABEL, ROLE_PHRASE } from "@/constants/roles";

interface RoleSelectorProps {
    value: UserRole | null;
    onChange: (role: UserRole) => void;
    /** Ruoli che il caller può assegnare (calcolati nel parent con i helper di permesso). */
    availableRoles: UserRole[];
    disabled?: boolean;
}

const VISIBLE_ROLES: Array<Exclude<UserRole, "owner">> = ["admin", "manager", "staff", "viewer"];

/**
 * Il ruolo si sceglie fra quattro card (scheda RadioGroup, variante `card`):
 * nome in italiano e la frase «cosa può fare», la stessa della lista dei
 * membri. Le voci non disponibili al caller restano visibili, disabilitate,
 * con il motivo: la matrice si vede intera, non si nasconde.
 */
export function RoleSelector({ value, onChange, availableRoles, disabled }: RoleSelectorProps) {
    const options: RadioOption[] = useMemo(
        () =>
            VISIBLE_ROLES.map(role => {
                const isAvailable = availableRoles.includes(role);
                return {
                    value: role,
                    label: ROLE_LABEL[role],
                    description: ROLE_PHRASE[role],
                    disabled: !isAvailable,
                    disabledReason: isAvailable ? undefined : "Non disponibile per il tuo ruolo."
                };
            }),
        [availableRoles]
    );

    return (
        <RadioGroup
            label="Ruolo"
            variant="card"
            value={value ?? ""}
            onChange={next => onChange(next as UserRole)}
            options={options}
            disabled={disabled}
            required
        />
    );
}
