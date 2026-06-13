import { PassThrough } from "node:stream";

import { renderToPipeableStream } from "react-dom/server";

import "@/i18n";

import PublicProviders from "@/components/public/PublicProviders";
import PublicCatalogReady from "@/pages/PublicCollectionPage/PublicCatalogReady";
import { derivePageState } from "@/pages/PublicCollectionPage/derivePageState";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedPayloadShape } from "@/types/publicCatalog";

/**
 * Entry SSR della pagina pubblica /:slug (stage 4a — solo build machinery,
 * nessuna attivazione: il consumer Vercel arriva in 4b).
 *
 * Renderizza il ramo "ready" via PublicCatalogReady dentro StaticRouter.
 * `orderingMaintenance` è null per costruzione lato server: deriva da
 * location.state / URL param, che il primo render server non ha (il canale
 * payload-derived viene applicato client-side dalla pagina dopo l'hydration,
 * invariato).
 *
 * 4a raccoglie lo stream in stringa (verifica byte-count); lo streaming
 * verso la response HTTP e la shell HTML completa (head, __PUBLIC_CATALOG__)
 * sono 4b.
 */

export type RenderPublicArgs = {
    payload: ResolvedPayloadShape;
    allergens: Allergen[] | null;
    slug: string;
    /** URL per StaticRouter (pathname; default da slug). */
    url?: string;
};

export type RenderPublicResult =
    | { kind: "ready"; html: string }
    | {
          /** Payload valido ma non renderizzabile come catalogo (inactive /
              subscription_inactive / empty): il chiamante serve il fallback
              SPA, che gestisce questi stati come oggi. */
          kind: "non-ready";
          status: "inactive" | "subscription_inactive" | "empty";
      };

const noop = () => {};

export async function renderPublic(args: RenderPublicArgs): Promise<RenderPublicResult> {
    const { payload, allergens, slug } = args;
    const url = args.url ?? `/${slug}`;

    const state = derivePageState(payload, allergens);
    if (state.status !== "ready") {
        return { kind: "non-ready", status: state.status };
    }

    const app = (
        <PublicProviders router="static" location={url}>
            <PublicCatalogReady
                slug={slug}
                data={state}
                orderingMaintenance={null}
                onRetry={noop}
                activeTab="menu"
                onTabChange={noop}
            />
        </PublicProviders>
    );

    const html = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const sink = new PassThrough();
        sink.on("data", (chunk: Buffer) => chunks.push(chunk));
        sink.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));

        const { pipe } = renderToPipeableStream(app, {
            // Albero sincrono (niente Suspense pendente al primo render:
            // i sheet lazy sono chiusi) → onAllReady scatta subito dopo
            // la shell. In 4b il pipe andrà sulla response HTTP.
            onAllReady() {
                pipe(sink);
            },
            onError(error) {
                reject(error);
            }
        });
    });

    // React 19 auto-inietta <link rel="preload" as="image"> per ogni <img> in SSR.
    // In render di sottoalbero (senza <head>) finiscono dentro #root; sul client
    // React li hoista nel <head> → divergenza → #418. La shell <head> già contiene
    // i preload canonici (cover, logo, featured) quindi questi sono ridondanti.
    const strippedHtml = html.replace(/<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>/gi, "");

    return { kind: "ready", html: strippedHtml };
}
