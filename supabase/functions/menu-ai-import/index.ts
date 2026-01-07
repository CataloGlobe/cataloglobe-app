// @ts-nocheck
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { getMenuAiProvider } from "./ai/factory.ts";
import { saveParsedMenuToDb } from "./db/saveParsedMenuToDb.ts";

serve(async (req: Request) => {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const body = await req.json();
        const { fileUrl, businessId, locale, businessName } = body;

        if (!fileUrl || !businessId) {
            return new Response(JSON.stringify({ error: "Missing fileUrl or businessId" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const provider = getMenuAiProvider();

        // Chiamata al provider (stub)
        const parsedMenu = await provider.analyzeMenu({
            fileUrl,
            locale,
            businessName
        });

        const saveResult = await saveParsedMenuToDb(parsedMenu, businessId);

        return new Response(
            JSON.stringify(
                {
                    provider: provider.name,
                    parsedMenu,
                    saveResult
                },
                null,
                2
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("menu-ai-import ERROR:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
