import type { CatalogType } from "@/types/catalog";
import { catalogConfigs } from "./catalogConfigs";
import type { FieldDef } from "./fields";
import { CatalogSubtype } from "./config";

export function getCatalogConfig(type: CatalogType) {
    const cfg = catalogConfigs[type];
    if (!cfg) return catalogConfigs.generic;
    return cfg;
}

export function getFieldsForCollection(
    type: CatalogType,
    subtype?: CatalogSubtype | null
): FieldDef[] {
    const cfg = getCatalogConfig(type);

    const base = cfg.fields ?? [];

    if (!cfg.subtypes) {
        return base;
    }

    const resolvedSubtype: CatalogSubtype = subtype ?? cfg.subtypes.default;

    const extra = cfg.subtypes.extraFieldsBySubtype?.[resolvedSubtype] ?? [];

    return [...base, ...extra];
}
