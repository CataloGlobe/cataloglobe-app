// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ────────────────────────────── CORS ────────────────────────────── */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/* ────────────────────────────── Helpers ─────────────────────────── */

function jsonOk(data: unknown) {
    return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function jsonError(error: string, status: number) {
    return new Response(JSON.stringify({ success: false, error }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

/* ────────────────────────────── Prompt ──────────────────────────── */

const SYSTEM_PROMPT = `You are a menu digitization assistant. You receive photos or PDF pages of restaurant/bar/café menus and extract structured product data.

## Your Task
Analyze the menu image(s) and extract every product (food item, drink, dish) into a structured JSON format.

## Rules

### What to Extract
- Every item that a customer can order: dishes, drinks, desserts, appetizers, etc.
- The name as written on the menu, converted to Title Case (see Name Formatting rules)
- Description if present on the menu (do NOT invent descriptions)
- Price(s) as numbers without currency symbols
- The category/section the item belongs to
- Include items that reference a blackboard, daily specials sheet, or "ask the waiter" — these are valid products with null price

### Name Formatting
- Convert ALL CAPS names to Title Case: "BRUSCHETTA" → "Bruschetta", "SALUMI MISTI" → "Salumi Misti"
- In Italian, keep lowercase for articles and prepositions INSIDE names: di, del, della, dello, dei, degli, delle, al, alla, alle, allo, agli, con, e, in, su, per, fra, tra, o, a, da, il, la, lo, le, i, gli, un, una, uno
- Examples: "TARTARE DI TONNO CON BRUNOISE" → "Tartare di Tonno con Brunoise", "MISTO DI PESCE AL VAPORE" → "Misto di Pesce al Vapore"
- The FIRST word of a name is always capitalized regardless: "Al Barbecue" not "al Barbecue"
- Preserve proper nouns and brand names: "Beck's", "Buenos Aires", "Cervia", "Dijon", "Gillardeau"
- Keep size abbreviations uppercase: "XL", "XXL", "S", "M", "L"
- Keep weight/volume notations as-is in descriptions: "400gr.", "50 cl.", "1 Kg."
- Apply the same rules to category names

### Category Hierarchy
- When a menu has a MAIN section (e.g., "Il Pesce", "La Carne") with SUB-sections (e.g., "Crudità", "Antipasti", "Primi", "Secondi", "Contorni"), preserve both levels using " — " as separator
- Example: main section "IL PESCE" with sub-section "Crudità" → category "Il Pesce — Crudità"
- Example: main section "LA CARNE" with sub-section "Contorni" → category "La Carne — Contorni"
- If there is only ONE level of sections (no sub-sections), use it directly: "Antipasti", "Bevande"
- Apply Title Case and preposition rules to both main and sub-section names

### Multi-Item Lines
- When a line lists DIFFERENT products separated by "o" / "or" / commas with clearly distinct items (e.g., "Vino Bianco Gambellara o Rosso Montepulciano" = two different wines), split them into separate products
- When a line lists variations of the SAME dish where the choice doesn't substantially change the product (e.g., "Branzino o Orata al Sale" = same preparation, different fish), keep as ONE product
- Use judgment: "Caffè o Tè" = two different drinks → split. "Penne o Rigatoni al pomodoro" = same dish, pasta shape choice → keep as one

### Formats/Sizes Detection
When a single item shows MULTIPLE prices for different sizes or formats (e.g., "Pizza Margherita — S €6 / M €8 / L €10" or "33cl €4 — 50cl €6"), this is ONE product with formats, not multiple products.
- Set "product_type" to "formats"
- List each format in the "formats" array with name and price
- Do NOT set base_price for format products (it's determined by the formats)
- If a product has only ONE size/format option (e.g., "Acqua 0,5 lt €1,50"), treat it as "simple" with that price as base_price, NOT as "formats". Include the size in the description or name.

### What to Ignore
- Restaurant name, address, phone number, website, social media
- "Coperto" (cover charge), "Servizio" (service charge) — these are NOT products
- Legal notices, footnotes about allergens (do NOT extract allergen info)
- Decorative text, promotional banners, slogans (e.g., "Dal 1991...", "Business Lunch tutto compreso", "Lo chef consiglia...")
- Section dividers without items, page numbers
- Certifications and origin claims (e.g., "carni provenienti da allevamenti certificati")
- Service-related notes (e.g., "pane, sale, pepe, olio... €4,50 a px")
- Notes about frozen products, hygiene regulations, legal disclaimers
- Delivery/franchising/booking information

### Confidence Scoring
For each product, assess your confidence:
- "high": name and price clearly readable, category clear
- "medium": some ambiguity (e.g., price partially visible, category inferred, name/description boundary unclear)
- "low": significant uncertainty (e.g., text blurry, price unclear, might not be a real product)

## Output
Return a JSON object that conforms to the response schema enforced by the API. Do not add markdown fences or extra text. The structure (menu_language, categories, items, formats) is fixed by the schema — focus on FILLING it correctly.

## Field Semantics
- name: required, taken from the menu text, in Title Case with the Italian preposition rules above. Same rules apply to category names.
- description: only if explicitly written on the menu, never invent. Natural case (not ALL CAPS). Put unit pricing like "cad." or "al kg" here. Use null when absent.
- base_price: the price as a number. Use null for "formats" products OR when no price is shown.
- product_type: "simple" (single price or no price) or "formats" (multiple sizes with different prices).
- formats: present only for "formats" products. Each entry has a name and a numeric price. Do NOT set base_price for formats products.
- confidence: "high", "medium" or "low" per the scoring rules above.
- menu_language: ISO 639-1 code of the menu language (honor the language hint when provided).

## Price Parsing
- "€8" or "8,00" or "8.00" or "8,00€" → 8.00
- "€8/10/12" for same item with sizes → formats product with three entries
- "€ 7 cad." → 7.00 (add "cadauno" or "cad." info to description)
- "MP" or "Market Price" or "Prezzo di mercato" or "s.q." → base_price: null, keep product_type: "simple"
- Italian thousands separator: "1.200" or "1.200,00" = 1200.00, not 1.2
- If a price appears next to a weight (e.g., "€45/kg"), include the price as-is (45.00) and note the weight in the description

## Edge Cases
- If a section header has no items under it, skip it entirely
- If an item has no visible price, still include it with base_price: null
- If you cannot determine the category, use "Altro" as category name
- If the image is too blurry or unreadable, return: {"error": "Menu non leggibile", "categories": []}
- Items like "Piatti del giorno" or "Chiedere al cameriere" are valid products — include them with null price
- Weight notations like "(400gr.)" or "(1 Kg.)" are part of the description, not the product name`;

/* ────────────────────────── Response schema ─────────────────────── */
// Structured output (responseMimeType + responseSchema, forma classica v1beta).
// Su REST raw lo stile responseFormat.text.mimeType fallisce con 400 (mime enum),
// quindi si usa l'OpenAPI-subset di Gemini. Rispecchia ESATTAMENTE il contratto
// consumato dal client (handleImport in AiMenuImportWizard): nessun campo nuovo,
// nessuna rinomina. Nullable espresso come nullable:true (OpenAPI-subset).
const MENU_SCHEMA = {
    type: "object",
    properties: {
        menu_language: { type: "string", description: "ISO 639-1 code of the menu language" },
        // Popolato SOLO se il menu e' illeggibile (con categories vuoto). Opzionale.
        error: { type: "string", nullable: true, description: "Set only when the menu is unreadable" },
        categories: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                description: { type: "string", nullable: true },
                                base_price: { type: "number", nullable: true },
                                product_type: { type: "string", enum: ["simple", "formats"] },
                                confidence: { type: "string", enum: ["high", "medium", "low"] },
                                // Presente solo per i prodotti "formats". Nullable per i "simple".
                                formats: {
                                    type: "array",
                                    nullable: true,
                                    items: {
                                        type: "object",
                                        properties: {
                                            name: { type: "string" },
                                            price: { type: "number" }
                                        },
                                        required: ["name", "price"]
                                    }
                                }
                            },
                            // description e base_price required-ma-nullable: la chiave compare
                            // sempre (il client la legge senza guard), il valore puo' essere null.
                            required: ["name", "description", "base_price", "product_type", "confidence"]
                        }
                    }
                },
                required: ["name", "items"]
            }
        }
    },
    required: ["menu_language", "categories"]
};

/* ────────────────────────────── Main ───────────────────────────── */

serve(async (req: Request) => {
    // ── Preflight ─────────────────────────────────────────────────
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonError("Metodo non consentito", 405);
    }

    try {
        // ── JWT validation ────────────────────────────────────────
        const authHeader = req.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return jsonError("Token di autenticazione mancante", 401);
        }

        const token = authHeader.replace("Bearer ", "");

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return jsonError("Token non valido o scaduto", 401);
        }

        // ── Body parsing ──────────────────────────────────────────
        const body = await req.json();
        const { images, tenant_id, language_hint } = body;

        if (!tenant_id || typeof tenant_id !== "string") {
            return jsonError("tenant_id è obbligatorio", 400);
        }

        // ── Permission check (canonical — handles owner via owner_user_id) ────
        // has_permission_any_activity checks the specific tenant; owner is
        // resolved via tenants.owner_user_id without requiring a
        // tenant_memberships row (owner has none post-Fase 5.B.2).
        // Gate: catalogs.write (tenant scope) — granted to owner + admin only.
        // Behaviour change vs old check: manager/staff/viewer are now denied
        // (correct — they lack catalogs.write in role_permissions regardless).
        const supabaseUser = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { data: hasPerm, error: permError } = await supabaseUser.rpc("has_permission_any_activity", {
            p_permission_id: "catalogs.write",
            p_tenant_id: tenant_id
        });
        if (permError) throw permError;
        if (!hasPerm) {
            return jsonError("Accesso al tenant non autorizzato", 403);
        }

        // ── Images validation ─────────────────────────────────────
        if (!Array.isArray(images) || images.length === 0) {
            return jsonError("images deve essere un array non vuoto", 400);
        }

        if (images.length > 5) {
            return jsonError("Massimo 5 immagini per richiesta", 400);
        }

        const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

        const normalizedImages: { data: string; mime_type: string }[] = [];
        for (let i = 0; i < images.length; i++) {
            const raw = images[i];
            let entry: { data: string; mime_type: string };
            if (typeof raw === "string") {
                // Retrocompatibilità: vecchio formato, assume JPEG
                entry = { data: raw, mime_type: "image/jpeg" };
            } else if (raw && typeof raw === "object" && typeof raw.data === "string" && typeof raw.mime_type === "string") {
                entry = { data: raw.data, mime_type: raw.mime_type };
            } else {
                return jsonError(`Immagine ${i + 1} non valida`, 400);
            }
            if (entry.data.length === 0) {
                return jsonError(`Immagine ${i + 1} non valida`, 400);
            }
            if (!ALLOWED_MIME_TYPES.includes(entry.mime_type)) {
                return jsonError(`Formato non supportato: ${entry.mime_type}`, 400);
            }
            normalizedImages.push(entry);
        }

        // ── Gemini API call ───────────────────────────────────────
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) {
            console.error("[menu-ai-import] GEMINI_API_KEY not configured");
            return jsonError("Servizio AI non configurato", 500);
        }

        const lang = language_hint || "it";

        const parts = [
            { text: SYSTEM_PROMPT },
            ...normalizedImages.map((img) => ({
                inline_data: { mime_type: img.mime_type, data: img.data }
            })),
            { text: `Extract all products from this menu. The menu language is likely "${lang}".` }
        ];

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`;

        const startMs = Date.now();

        let geminiRes: Response;
        try {
            geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        // temperature/top_p/top_k lasciati ai default: per i modelli 3.x
                        // Google raccomanda di non sovrascriverli.
                        // maxOutputTokens generoso: i menu lunghi producono molti prodotti.
                        // Headroom modello 65k; 32768 copre menu grandi evitando troncamenti
                        // silenziosi (il caso finishReason MAX_TOKENS e' gestito sotto).
                        maxOutputTokens: 32768,
                        // thinkingLevel LOW: veloce mantenendo qualita'. Alzare a MEDIUM se
                        // i menu complessi restano imprecisi (leva documentata).
                        thinkingConfig: { thinkingLevel: "LOW" },
                        // Structured output vincolato (forma classica v1beta). Lo schema
                        // vincola la STRUTTURA, il contratto resta invariato.
                        responseMimeType: "application/json",
                        responseSchema: MENU_SCHEMA
                    }
                })
            });
        } catch (networkErr) {
            console.error("[menu-ai-import] Gemini network error:", networkErr);
            return jsonError("Servizio AI temporaneamente non disponibile", 502);
        }

        const processingTimeMs = Date.now() - startMs;

        // ── Gemini error handling ─────────────────────────────────
        if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            console.error(`[menu-ai-import] Gemini HTTP ${geminiRes.status}:`, errBody);

            if (geminiRes.status === 429) {
                return jsonError("Servizio AI temporaneamente non disponibile, riprovare tra qualche minuto", 502);
            }
            if (geminiRes.status === 400) {
                return jsonError("Errore nella richiesta al servizio AI", 500);
            }
            return jsonError("Servizio AI temporaneamente non disponibile", 502);
        }

        // ── Parse Gemini response ─────────────────────────────────
        const geminiData = await geminiRes.json();

        const candidate = geminiData?.candidates?.[0];
        const finishReason: string | undefined = candidate?.finishReason;

        // Troncamento output: il menu ha generato piu' token del budget. Errore
        // SPECIFICO e distinguibile (non collassare nel 500 generico) cosi' l'utente
        // sa che deve ridurre le pagine e il log mostra la firma esatta.
        if (finishReason === "MAX_TOKENS") {
            console.error("[menu-ai-import] finishReason=MAX_TOKENS (output troncato)");
            return jsonError(
                "Il menu e' troppo lungo per essere elaborato in una volta. Riprova con meno pagine.",
                422
            );
        }

        // Altre interruzioni anomale (SAFETY, RECITATION, ...) vs completamento
        // normale (STOP). Log + errore specifico, mai un 500 indistinguibile.
        if (finishReason && finishReason !== "STOP") {
            console.error(`[menu-ai-import] finishReason anomalo: ${finishReason}`);
            return jsonError("Il modello AI ha interrotto l'analisi del menu. Riprova.", 502);
        }

        const rawText = candidate?.content?.parts?.[0]?.text;
        if (!rawText) {
            console.error("[menu-ai-import] Empty Gemini response:", JSON.stringify(geminiData, null, 2));
            return jsonError("Errore nell'analisi del menu", 500);
        }

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            console.error(
                `[menu-ai-import] JSON parse failed. finishReason=${finishReason}. Raw:`,
                rawText.slice(0, 500)
            );
            return jsonError("Errore nell'analisi del menu", 500);
        }

        if (!Array.isArray(parsed.categories)) {
            console.error("[menu-ai-import] Missing categories array:", JSON.stringify(parsed).slice(0, 500));
            return jsonError("Errore nell'analisi del menu", 500);
        }

        // ── Build response ────────────────────────────────────────
        return jsonOk({
            menu_language: parsed.menu_language || lang,
            categories: parsed.categories,
            ...(parsed.error ? { error: parsed.error } : {}),
            metadata: {
                images_analyzed: images.length,
                model_used: "gemini-3.5-flash",
                processing_time_ms: processingTimeMs
            }
        });
    } catch (err) {
        console.error("[menu-ai-import] Unhandled error:", err);
        return jsonError("Errore nell'analisi del menu", 500);
    }
});
