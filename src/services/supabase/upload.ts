import { supabase } from "./client";

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
