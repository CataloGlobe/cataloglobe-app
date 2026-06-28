// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exceedsPayloadBudget, estimateDecodedBytes } from "../_shared/aiImportPayloadSize.ts";
import { classifyGeminiFailure, type ClassifiedFailure } from "../_shared/geminiFailure.ts";
import { MAX_ATTEMPTS, isRetryable, computeBackoffSeconds } from "../_shared/geminiRetry.ts";

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

interface FailureContext {
    fileCount: number;
    estimatedBytes: number;
    languageHint: string;
    debug?: string;
}

// Risposta d'errore classificata: emette UNA riga di log strutturata (code +
// metadati input, mai contenuto file) e ritorna il payload con `code` e
// `retry_after` opzionale, cosi' i 429/502/500 prima collassati sono ora
// distinguibili sia lato log sia lato client.
function failureResponse(classified: ClassifiedFailure, ctx: FailureContext) {
    console.error(
        "[menu-ai-import] failure",
        JSON.stringify({
            code: classified.code,
            http_status: classified.httpStatus,
            file_count: ctx.fileCount,
            estimated_bytes: Math.round(ctx.estimatedBytes),
            language_hint: ctx.languageHint,
            ...(classified.retryAfterSeconds !== undefined
                ? { retry_after_seconds: classified.retryAfterSeconds }
                : {}),
            ...(ctx.debug ? { debug: ctx.debug } : {})
        })
    );
    const payload: Record<string, unknown> = {
        success: false,
        error: classified.messageIt,
        code: classified.code
    };
    if (classified.retryAfterSeconds !== undefined) payload.retry_after = classified.retryAfterSeconds;
    return new Response(JSON.stringify(payload), {
        status: classified.httpStatus,
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

        // ── Aggregate size backstop (defense-in-depth) ────────────
        // Il cap reale vive nel frontend (foto 25 MB / PDF 20 MB / totale 30 MB).
        // Qui un guard aggregato protegge l'isolate dell'edge function da payload
        // combinati che saturerebbero la memoria. Stima byte decodificati via
        // helper puro condiviso (testabile in node).
        if (exceedsPayloadBudget(normalizedImages)) {
            return jsonError("Richiesta troppo grande: riduci numero o peso dei file.", 413);
        }

        // ── Gemini API call ───────────────────────────────────────
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiKey) {
            console.error("[menu-ai-import] GEMINI_API_KEY not configured");
            return jsonError("Servizio AI non configurato", 500);
        }

        const lang = language_hint || "it";

        // Contesto comune per il logging strutturato degli errori (no contenuto file).
        const failureCtx: Omit<FailureContext, "debug"> = {
            fileCount: images.length,
            estimatedBytes: estimateDecodedBytes(normalizedImages),
            languageHint: lang
        };

        const parts = [
            { text: SYSTEM_PROMPT },
            ...normalizedImages.map((img) => ({
                inline_data: { mime_type: img.mime_type, data: img.data }
            })),
            { text: `Extract all products from this menu. The menu language is likely "${lang}".` }
        ];

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

        const startMs = Date.now();

        const geminiRequestInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                    // temperature/top_p/top_k ai default (raccomandato per i 3.x).
                    // maxOutputTokens al ceiling del modello (65536, output token limit
                    // documentato per gemini-2.5-flash): sul tier gratuito il vincolo e'
                    // RPD non i token, quindi e' upside-only e riduce i MAX_TOKENS.
                    // Non superare 65536: oltre il max la request fallisce.
                    maxOutputTokens: 65536,
                    // thinkingLevel LOW: veloce mantenendo qualita' (leva documentata).
                    thinkingConfig: { thinkingLevel: "LOW" },
                    // Structured output vincolato (forma classica v1beta), contratto invariato.
                    responseMimeType: "application/json",
                    responseSchema: MENU_SCHEMA
                }
            })
        };

        // ── Gemini call con retry limitato sui fallimenti transitori ──
        // Ritenta SOLO le cause transitorie (rete/5xx → upstream_unavailable,
        // rate-limit al minuto → rate_limit_rpm_tpm); MAI RPD/safety/max-tokens/
        // bad-response. Decisioni delegate agli helper puri testati
        // (isRetryable / computeBackoffSeconds): backoff esponenziale con cap, il
        // retryDelay di Gemini onorato solo se abbastanza corto da tenere aperto
        // l'edge. Il classifier e il logging strutturato restano invariati.
        let geminiRes: Response;
        let attempt = 1;
        while (true) {
            let classified: ClassifiedFailure;
            let debug: string;
            try {
                const res = await fetch(geminiUrl, geminiRequestInit);
                if (res.ok) {
                    geminiRes = res;
                    break;
                }
                const errText = await res.text();
                let errBody: unknown = errText;
                try {
                    errBody = JSON.parse(errText);
                } catch {
                    // corpo non-JSON: il classifier degrada a rate_limit/bad_response generico
                }
                classified = classifyGeminiFailure({ geminiHttpStatus: res.status, geminiErrorBody: errBody });
                debug = `HTTP ${res.status}: ${errText.slice(0, 500)}`;
            } catch (networkErr) {
                classified = classifyGeminiFailure({ isNetworkError: true });
                debug = networkErr instanceof Error ? networkErr.message : String(networkErr);
            }

            const backoff =
                attempt < MAX_ATTEMPTS && isRetryable(classified.code)
                    ? computeBackoffSeconds(attempt, classified.retryAfterSeconds)
                    : null;
            if (backoff === null) {
                // Cause terminali, tentativi esauriti, o delay troppo lungo da
                // tenere aperto l'edge: ritorna l'errore classificato (con retry_after).
                return failureResponse(classified, { ...failureCtx, debug });
            }
            console.error(
                "[menu-ai-import] retry",
                JSON.stringify({ code: classified.code, attempt, backoff_seconds: backoff })
            );
            await new Promise((resolve) => setTimeout(resolve, backoff * 1000));
            attempt++;
        }

        const processingTimeMs = Date.now() - startMs;

        // ── Parse Gemini response ─────────────────────────────────
        const geminiData = await geminiRes.json();

        const candidate = geminiData?.candidates?.[0];
        const finishReason: string | undefined = candidate?.finishReason;

        // finishReason anomalo (MAX_TOKENS / SAFETY / RECITATION): instradato dal
        // classifier per tenere TUTTA la mappatura in un unico posto testato.
        if (finishReason && finishReason !== "STOP") {
            return failureResponse(classifyGeminiFailure({ finishReason }), {
                ...failureCtx,
                debug: `finishReason=${finishReason}`
            });
        }

        const rawText = candidate?.content?.parts?.[0]?.text;
        if (!rawText) {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: "empty Gemini response"
            });
        }

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: `JSON parse failed. finishReason=${finishReason}. raw=${rawText.slice(0, 300)}`
            });
        }

        if (!Array.isArray(parsed.categories)) {
            return failureResponse(classifyGeminiFailure({}), {
                ...failureCtx,
                debug: `missing categories array: ${JSON.stringify(parsed).slice(0, 300)}`
            });
        }

        // ── Build response ────────────────────────────────────────
        return jsonOk({
            menu_language: parsed.menu_language || lang,
            categories: parsed.categories,
            ...(parsed.error ? { error: parsed.error } : {}),
            metadata: {
                images_analyzed: images.length,
                model_used: "gemini-2.5-flash",
                processing_time_ms: processingTimeMs
            }
        });
    } catch (err) {
        console.error("[menu-ai-import] Unhandled error:", err);
        return jsonError("Errore nell'analisi del menu", 500);
    }
});
