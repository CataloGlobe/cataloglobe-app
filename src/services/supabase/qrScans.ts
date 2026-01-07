import { supabase } from "./client"; // importa il tuo client, adegua il path se diverso

export type AnalyticsQrScan = {
    id: string;
    business_id: string | null;
    created_at: string;
};

export async function getAnalyticsQrScans(): Promise<AnalyticsQrScan[]> {
    const { data, error } = await supabase
        .from("qr_scans")
        .select("id, business_id, created_at")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Errore nel recupero delle scansioni QR:", error);
        return [];
    }

    return data ?? [];
}
