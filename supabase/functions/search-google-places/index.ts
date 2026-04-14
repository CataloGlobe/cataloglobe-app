// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Metodo non consentito" }, 405);
    }

    try {
        // ── Authentication ─────────────────────────────────────
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Non autenticato" }, 401);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !authData?.user) {
            return jsonResponse({ error: "Non autenticato" }, 401);
        }

        // ── Validation ─────────────────────────────────────────
        const body = (await req.json()) as Record<string, unknown>;
        const query = body.query;

        if (typeof query !== "string" || query.trim().length < 3) {
            return jsonResponse({ error: "La query deve contenere almeno 3 caratteri" }, 400);
        }

        // ── Optional location bias ────────────────────────────
        let locationBias: Record<string, unknown> | undefined;
        if (
            body.location &&
            typeof body.location === "object" &&
            body.location !== null &&
            typeof (body.location as Record<string, unknown>).latitude === "number" &&
            typeof (body.location as Record<string, unknown>).longitude === "number"
        ) {
            const loc = body.location as { latitude: number; longitude: number };
            locationBias = {
                circle: {
                    center: { latitude: loc.latitude, longitude: loc.longitude },
                    radius: 50000.0
                }
            };
        }

        // ── Google Places API ──────────────────────────────────
        const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
        if (!apiKey) {
            return jsonResponse({ error: "Servizio di ricerca non configurato" }, 500);
        }

        const googleRes = await fetch(
            "https://places.googleapis.com/v1/places:searchText",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": apiKey,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress"
                },
                body: JSON.stringify({
                    textQuery: query.trim(),
                    regionCode: "IT",
                    languageCode: "it",
                    ...(locationBias
                        ? { locationBias }
                        : {
                              locationRestriction: {
                                  rectangle: {
                                      low: { latitude: 35.5, longitude: 6.6 },
                                      high: { latitude: 47.1, longitude: 18.5 }
                                  }
                              }
                          }
                    )
                })
            }
        );

        if (!googleRes.ok) {
            console.error("[search-google-places] Google API error:", googleRes.status, await googleRes.text());
            return jsonResponse({ error: "Errore durante la ricerca su Google" }, 500);
        }

        const googleData = (await googleRes.json()) as {
            places?: Array<{
                id: string;
                displayName?: { text?: string };
                formattedAddress?: string;
            }>;
        };

        const results = (googleData.places ?? []).slice(0, 5).map(place => ({
            place_id: place.id,
            name: place.displayName?.text ?? "",
            address: place.formattedAddress ?? "",
            review_url: `https://search.google.com/local/writereview?placeid=${place.id}`
        }));

        return jsonResponse({ results }, 200);
    } catch (err) {
        console.error("[search-google-places] error:", err);
        return jsonResponse({ error: "Errore durante la ricerca" }, 500);
    }
});
