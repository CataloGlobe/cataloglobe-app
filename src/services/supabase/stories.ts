import { supabase } from "@/services/supabase/client";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
import { deleteStoryImageBestEffort } from "./upload";

export type StoryStatus = "draft" | "published";

export type StoryVideoProvider = "youtube" | "vimeo";

/**
 * Discriminated union for `body_blocks` (JSONB). Plain text (no rich text in
 * v1), image (uploaded), video (embed-only — `ref` is saved as-is, URL/ID
 * normalization for the embed player is the public reader's job, future
 * sub-fase). `id` is client-generated and stable, used for React key + dnd.
 */
export type StoryTextBlock = { id: string; type: "text"; content: string };
export type StoryImageBlock = { id: string; type: "image"; url: string; caption?: string };
export type StoryVideoBlock = { id: string; type: "video"; provider: StoryVideoProvider; ref: string };
export type StoryBlock = StoryTextBlock | StoryImageBlock | StoryVideoBlock;

export interface Story {
    id: string;
    tenant_id: string;
    activity_id: string | null;
    eyebrow: string | null;
    title: string;
    cover_media: string | null;
    body_blocks: StoryBlock[];
    product_id: string | null;
    sort_order: number;
    status: StoryStatus;
    created_at: string;
    updated_at: string;
}

export interface StoryWithProduct extends Story {
    product: { id: string; name: string } | null;
}

export async function listStories(tenantId: string): Promise<StoryWithProduct[]> {
    const { data, error } = await supabase
        .from("stories")
        .select("*, product:product_id (id, name)")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as StoryWithProduct[];
}

export async function getStory(id: string, tenantId: string): Promise<StoryWithProduct> {
    const { data, error } = await supabase
        .from("stories")
        .select("*, product:product_id (id, name)")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (error) throw error;
    return data as unknown as StoryWithProduct;
}

export type StoryMetadataInput = Pick<
    Story,
    "eyebrow" | "title" | "cover_media" | "product_id" | "status"
>;

export async function createStory(
    tenantId: string,
    data: StoryMetadataInput
): Promise<Story> {
    const { data: created, error } = await supabase
        .from("stories")
        .insert({ ...data, tenant_id: tenantId, activity_id: null })
        .select()
        .single();

    if (error) throw error;
    void revalidatePublicCatalogForTenant(tenantId);
    return created as Story;
}

export type StoryUpdateInput = Partial<StoryMetadataInput> & { body_blocks?: StoryBlock[] };

export async function updateStory(
    id: string,
    tenantId: string,
    data: StoryUpdateInput
): Promise<Story> {
    const { data: updated, error } = await supabase
        .from("stories")
        .update(data)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    void revalidatePublicCatalogForTenant(tenantId);
    return updated as Story;
}

export async function deleteStory(id: string, tenantId: string): Promise<void> {
    const { data: existing } = await supabase
        .from("stories")
        .select("cover_media, body_blocks")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    try {
        await deleteStoryImageBestEffort(tenantId, id, existing?.cover_media ?? null);
    } catch (err) {
        console.warn("[storage] story cover cleanup failed:", err);
    }

    const blocks = (existing?.body_blocks ?? []) as unknown as StoryBlock[];
    for (const block of blocks) {
        if (block.type !== "image") continue;
        try {
            await deleteStoryImageBestEffort(tenantId, `${id}/${block.id}`, block.url);
        } catch (err) {
            console.warn("[storage] story block image cleanup failed:", err);
        }
    }

    void revalidatePublicCatalogForTenant(tenantId);
}

export async function reorderStories(
    tenantId: string,
    rows: { id: string; sort_order: number }[]
): Promise<void> {
    const results = await Promise.all(
        rows.map(row =>
            supabase
                .from("stories")
                .update({ sort_order: row.sort_order })
                .eq("id", row.id)
                .eq("tenant_id", tenantId)
        )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
    void revalidatePublicCatalogForTenant(tenantId);
}
