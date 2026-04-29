import type { ActivityFeeKey } from "@/types/activity";

export interface FeeDefinition {
    key: ActivityFeeKey;
    label: string;
    unit: string;
    placeholder: string;
}

export const FEE_DEFINITIONS: FeeDefinition[] = [
    {
        key: "coperto",
        label: "Coperto",
        unit: "€/persona",
        placeholder: "es. 2.50"
    },
    {
        key: "servizio",
        label: "Servizio",
        unit: "%",
        placeholder: "es. 10"
    },
    {
        key: "prenotazione_minima",
        label: "Prenotazione minima",
        unit: "€",
        placeholder: "es. 20"
    },
    {
        key: "spesa_minima",
        label: "Spesa minima",
        unit: "€",
        placeholder: "es. 15"
    },
    {
        key: "eta_minima",
        label: "Età minima",
        unit: "anni",
        placeholder: "es. 18"
    }
];

export const FEE_DEFINITIONS_BY_KEY: Record<ActivityFeeKey, FeeDefinition> =
    FEE_DEFINITIONS.reduce(
        (acc, def) => {
            acc[def.key] = def;
            return acc;
        },
        {} as Record<ActivityFeeKey, FeeDefinition>
    );
