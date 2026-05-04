import type { ActivityFeeKey } from "@/types/activity";

export interface FeeDefinition {
    key: ActivityFeeKey;
    label: string;
    unit: string;
    placeholder: string;
    /** i18n key for the label in public-facing contexts (namespace: "public") */
    labelKey: string;
    /** Suffix for fees.unit_format.* key in public-facing contexts */
    unitFormatKey: "per_person" | "percent" | "currency" | "years";
}

export const FEE_DEFINITIONS: FeeDefinition[] = [
    {
        key: "coperto",
        label: "Coperto",
        unit: "€/persona",
        placeholder: "es. 2.50",
        labelKey: "fees.labels.coperto",
        unitFormatKey: "per_person"
    },
    {
        key: "servizio",
        label: "Servizio",
        unit: "%",
        placeholder: "es. 10",
        labelKey: "fees.labels.servizio",
        unitFormatKey: "percent"
    },
    {
        key: "prenotazione_minima",
        label: "Prenotazione minima",
        unit: "€",
        placeholder: "es. 20",
        labelKey: "fees.labels.prenotazione_minima",
        unitFormatKey: "currency"
    },
    {
        key: "spesa_minima",
        label: "Spesa minima",
        unit: "€",
        placeholder: "es. 15",
        labelKey: "fees.labels.spesa_minima",
        unitFormatKey: "currency"
    },
    {
        key: "eta_minima",
        label: "Età minima",
        unit: "anni",
        placeholder: "es. 18",
        labelKey: "fees.labels.eta_minima",
        unitFormatKey: "years"
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
