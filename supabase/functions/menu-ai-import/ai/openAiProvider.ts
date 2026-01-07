import type { MenuAiProvider, AnalyzeMenuParams } from "./provider.ts";
import type { ParsedMenu } from "../types/aiMenu.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export const openAiMenuProvider: MenuAiProvider = {
    name: "openai",

    async analyzeMenu({ fileUrl }: AnalyzeMenuParams): Promise<ParsedMenu> {
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

        const payload = {
            model: "gpt-4.1", // puoi usare "gpt-4.1-mini" se vuoi risparmiare
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        "Sei un parser professionale di menu. Restituisci SOLO JSON valido, nessun testo aggiuntivo."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `
Analizza questo menu e produci un JSON nel formato:

{
  "language": "it",
  "categories": [
    {
      "id": "string",
      "name": "string",
      "notes": "string|null",
      "items": [
        {
          "id": "string",
          "name": "string",
          "description": "string|null",
          "price": number|null,
          "currency": "EUR",
          "allergens": ["string"]
        }
      ]
    }
  ]
}`
                        },
                        {
                            type: "input_image",
                            image_url: fileUrl
                        }
                    ]
                }
            ]
        };

        const res = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        const raw = data?.choices?.[0]?.message?.content;

        if (!raw) {
            console.log("DEBUG OpenAI:", JSON.stringify(data, null, 2));
            throw new Error("OpenAI non ha restituito JSON.");
        }

        return JSON.parse(raw);
    }
};
