import { supabase } from "@/services/supabase/client";


export type V2StyleVersion = {
    id: string;
    tenant_id: string;
    style_id: string;
    version: number;
    config: Record<string, unknown>;
    created_at: string;
};

export type V2Style = {
    id: string;
    tenant_id: string;
    name: string;
    is_system: boolean;
    is_active: boolean;
    current_version_id: string | null;
    created_at: string;
    updated_at: string;

    // Joined properties
    current_version?: V2StyleVersion;
    usage_count?: number;
};

export async function listStyles(tenantId: string): Promise<V2Style[]> {
    const { data: stylesData, error: stylesError } = await supabase
        .from("styles")
        .select(
            `
            *,
            current_version:style_versions!current_version_id (
                id, tenant_id, style_id, version, config, created_at
            )
        `
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    if (stylesError) throw stylesError;

    // Fetch usage counts directly
    const { data: layoutsData, error: layoutsError } = await supabase
        .from("schedule_layout")
        .select("style_id")
        .eq("tenant_id", tenantId);

    if (layoutsError) throw layoutsError;

    const usageCounts = (layoutsData || []).reduce((acc: Record<string, number>, layout) => {
        if (layout.style_id) {
            acc[layout.style_id] = (acc[layout.style_id] || 0) + 1;
        }
        return acc;
    }, {});

    return (stylesData || []).map(style => {
        const current_version = Array.isArray(style.current_version)
            ? style.current_version[0]
            : style.current_version;

        return {
            ...style,
            current_version,
            usage_count: usageCounts[style.id] || 0
        };
    });
}

export async function getStyle(styleId: string, tenantId: string): Promise<V2Style | null> {
    const { data, error } = await supabase
        .from("styles")
        .select(
            `
            *,
            current_version:style_versions!current_version_id (
                id, tenant_id, style_id, version, config, created_at
            )
        `
        )
        .eq("id", styleId)
        .eq("tenant_id", tenantId)
        .single();

    if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
    }

    const style = data;
    const current_version = Array.isArray(style.current_version)
        ? style.current_version[0]
        : style.current_version;

    return {
        ...style,
        current_version
    };
}

export async function listStyleVersions(
    styleId: string,
    tenantId: string
): Promise<V2StyleVersion[]> {
    const { data, error } = await supabase
        .from("style_versions")
        .select("id, tenant_id, style_id, version, config, created_at")
        .eq("style_id", styleId)
        .eq("tenant_id", tenantId)
        .order("version", { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getStyleVersion(
    versionId: string,
    tenantId: string
): Promise<V2StyleVersion> {
    const { data, error } = await supabase
        .from("style_versions")
        .select("id, tenant_id, style_id, version, config, created_at")
        .eq("id", versionId)
        .eq("tenant_id", tenantId)
        .single();

    if (error) throw error;
    return data;
}

export async function createStyle(tenant_id: string, name: string, config: Record<string, unknown>): Promise<V2Style> {
    // 1. Create the base style
    const { data: styleData, error: styleError } = await supabase
        .from("styles")
        .insert({
            tenant_id,
            name,
            is_system: false,
            is_active: true
        })
        .select()
        .single();

    if (styleError) throw styleError;

    // 2. Create the first version
    const { data: versionData, error: versionError } = await supabase
        .from("style_versions")
        .insert({
            tenant_id,
            style_id: styleData.id,
            version: 1,
            config: config || {}
        })
        .select()
        .single();

    if (versionError) {
        // Cleanup if version creation fails
        await supabase.from("styles").delete().eq("id", styleData.id);
        throw versionError;
    }

    // 3. Update style with current_version_id
    const { data: updatedStyle, error: updateError } = await supabase
        .from("styles")
        .update({
            current_version_id: versionData.id
        })
        .eq("id", styleData.id)
        .select()
        .single();

    if (updateError) throw updateError;

    return {
        ...updatedStyle,
        current_version: versionData
    };
}

export async function updateStyle(
    styleId: string,
    name: string | undefined, // undefined means don't update name
    newConfig: Record<string, unknown> | undefined, // undefined means don't create new version
    tenant_id: string
): Promise<V2Style> {
    const currentStyle = await getStyle(styleId, tenant_id);
    if (!currentStyle) throw new Error("Style not found");

    let nextVersionId = currentStyle.current_version_id;

    // If we have a new config, create a new version
    if (newConfig !== undefined) {
        const nextVersionNum = (currentStyle.current_version?.version || 0) + 1;

        const { data: versionData, error: versionError } = await supabase
            .from("style_versions")
            .insert({
                tenant_id,
                style_id: styleId,
                version: nextVersionNum,
                config: newConfig
            })
            .select()
            .single();

        if (versionError) throw versionError;

        nextVersionId = versionData.id;
    }

    // Update the style record (name if provided, and possibly new current_version_id)
    const updatePayload: Record<string, string | null> = {};
    if (name !== undefined) updatePayload.name = name;
    if (nextVersionId !== currentStyle.current_version_id) {
        updatePayload.current_version_id = nextVersionId;
    }

    // Always trigger updated_at
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedStyle, error: updateError } = await supabase
        .from("styles")
        .update(updatePayload)
        .eq("id", styleId)
        .eq("tenant_id", tenant_id)
        .select(
            `
            *,
            current_version:style_versions!current_version_id (
                id, tenant_id, style_id, version, config, created_at
            )
        `
        )
        .single();

    if (updateError) throw updateError;

    const current_version = Array.isArray(updatedStyle.current_version)
        ? updatedStyle.current_version[0]
        : updatedStyle.current_version;

    return {
        ...updatedStyle,
        current_version
    };
}

export async function duplicateStyle(styleId: string, newName: string, tenantId: string): Promise<V2Style> {
    const sourceStyle = await getStyle(styleId, tenantId);
    if (!sourceStyle) throw new Error("Source style not found");
    if (!sourceStyle.current_version)
        throw new Error("Source style has no config version to duplicate");

    return createStyle(sourceStyle.tenant_id, newName, sourceStyle.current_version.config);
}

export async function deleteStyle(styleId: string, tenantId: string, replaceWithStyleId?: string): Promise<void> {
    const style = await getStyle(styleId, tenantId);
    if (!style) return;

    if (style.is_system) {
        throw new Error("Cannot delete a system style");
    }

    // Check usage
    const { data: usages, error: usageError } = await supabase
        .from("schedule_layout")
        .select("id")
        .eq("style_id", styleId)
        .eq("tenant_id", tenantId);

    if (usageError) throw usageError;

    if (usages && usages.length > 0) {
        if (!replaceWithStyleId) {
            throw new Error(
                `Cannot delete style because it is used in ${usages.length} layout rules. Please provide a replacement style.`
            );
        }

        // Ensure the replacement exists
        const replacement = await getStyle(replaceWithStyleId, tenantId);
        if (!replacement) throw new Error("Replacement style not found");

        // Update all references
        const { error: updateError } = await supabase
            .from("schedule_layout")
            .update({ style_id: replaceWithStyleId })
            .eq("style_id", styleId)
            .eq("tenant_id", tenantId);

        if (updateError) throw updateError;
    }

    // Delete the style (cascade will delete versions)
    const { error: deleteError } = await supabase
        .from("styles")
        .delete()
        .eq("id", styleId)
        .eq("tenant_id", tenantId);

    if (deleteError) throw deleteError;
}
