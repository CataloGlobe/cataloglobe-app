import type { CatalogType } from "@/types/catalog";
import { getCatalogConfig, getFieldsForCollection } from "./getCatalogConfig";
import { CatalogSubtype } from "./config";

type FormValues = Record<string, unknown>;

export function buildItemUpdatePayload(args: {
    catalogType: CatalogType;
    subtype?: string | null; // per services
    values: FormValues;
    existingMetadata?: Record<string, unknown> | null;
}) {
    const { catalogType, subtype, values } = args;

    const cfg = getCatalogConfig(catalogType);
    const fields = getFieldsForCollection(
        catalogType,
        subtype as CatalogSubtype | null | undefined
    );

    const base: Record<string, unknown> = {};
    const meta: Record<string, unknown> = { ...(args.existingMetadata ?? {}) };

    // salva subtype se previsto
    if (cfg.subtypes) {
        meta.subtype = subtype ?? cfg.subtypes.default;
    }

    for (const f of fields) {
        const v = values[f.key];
        if (f.storage === "base") base[f.key] = v ?? null;
        else meta[f.key] = v ?? null;
    }

    // imposta type
    base.type = catalogType;

    return {
        ...base,
        metadata: meta
    };
}
