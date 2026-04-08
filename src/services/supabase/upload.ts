import { supabase } from "@/services/supabase/client";

export async function uploadBusinessItemImage(businessId: string, file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;

    const filePath = `${businessId}/${fileName}`;

    const { error } = await supabase.storage.from("business-items").upload(filePath, file, {
        upsert: false
    });

    if (error) {
        console.error("Errore upload immagine:", error);
        throw new Error("Upload fallito");
    }

    const { data } = supabase.storage.from("business-items").getPublicUrl(filePath);

    return data.publicUrl;
}

export async function uploadCatalogItemImage(itemId: string, file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${itemId}.${ext}`;

    const { error } = await supabase.storage.from("catalog-items").upload(fileName, file, {
        upsert: true,
        contentType: file.type
    });

    if (error) throw error;

    const {
        data: { publicUrl }
    } = supabase.storage.from("catalog-items").getPublicUrl(fileName);

    return publicUrl;
}

export async function uploadProductImage(
    tenantId: string,
    productId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/products/${productId}.${ext}`;

    const { error } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload fallito");

    const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);

    return data.publicUrl;
}

export async function deleteProductImage(
    tenantId: string,
    productId: string,
    ext: string
): Promise<void> {
    const filePath = `${tenantId}/products/${productId}.${ext}`;
    const { error } = await supabase.storage.from("product-images").remove([filePath]);
    if (error) throw error;
}

export async function uploadFeaturedContentImage(
    tenantId: string,
    contentId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/${contentId}.${ext}`;

    const { error } = await supabase.storage
        .from("featured-contents")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload immagine fallito");

    const { data } = supabase.storage.from("featured-contents").getPublicUrl(filePath);
    return data.publicUrl;
}

export async function deleteFeaturedContentImage(
    tenantId: string,
    contentId: string,
    ext: string
): Promise<void> {
    const filePath = `${tenantId}/${contentId}.${ext}`;
    const { error } = await supabase.storage.from("featured-contents").remove([filePath]);
    if (error) throw error;
}
