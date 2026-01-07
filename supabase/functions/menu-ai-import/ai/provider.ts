import type { ParsedMenu } from "../types/aiMenu.ts";

export type AnalyzeMenuParams = {
    fileUrl: string;
    locale?: string;
    businessName?: string;
};

export interface MenuAiProvider {
    name: "gemini" | "openai";
    analyzeMenu(params: AnalyzeMenuParams): Promise<ParsedMenu>;
}
