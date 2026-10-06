import { supabase } from "./client";
import type { GeaWebPage } from "@/utils/crm/gea";

export interface GeaTurn {
    asked: string;
    replied: string;
}

export interface GeaWebAnswer {
    status: "answered" | "pending" | "refused" | "failed";
    reply: string;
}

/**
 * Una domanda a Gea dal pannello di /admin (edge crm-gea-web). La memoria
 * corta la tiene il pannello e la manda a ogni domanda.
 */
export async function askGea(text: string, history: GeaTurn[], page: GeaWebPage | null): Promise<GeaWebAnswer> {
    const { data, error } = await supabase.functions.invoke("crm-gea-web", {
        body: { text, history, page },
        timeout: 60_000
    });
    if (error) throw error;
    return data as GeaWebAnswer;
}
