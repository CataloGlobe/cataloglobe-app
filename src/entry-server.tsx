import { PassThrough } from "node:stream";

import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider } from "react-i18next";

import i18n from "@/i18n";

import PublicProviders from "@/components/public/PublicProviders";
import PublicCatalogReady from "@/pages/PublicCollectionPage/PublicCatalogReady";
import { derivePageState } from "@/pages/PublicCollectionPage/derivePageState";
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
    slug: string;
    /** URL per StaticRouter (pathname, più `?menu=` se scelto; default da slug). */
    url?: string;
    /** Lingua dell'interfaccia: quella della pagina (`effective_language`,
        altrimenti la lingua base della sede), già validata dal chiamante.
        Senza, o per una lingua che non abbiamo: italiano. */
    lang?: string;
};

export type RenderPublicResult =
    | { kind: "ready"; html: string }
    | {
          /** Payload valido ma non renderizzabile come catalogo (inactive /
              subscription_inactive / empty / catalog_empty): il chiamante
              serve il fallback SPA, che gestisce questi stati come oggi. */
          kind: "non-ready";
          status: "inactive" | "subscription_inactive" | "empty" | "catalog_empty";
      };

const noop = () => {};

export async function renderPublic(args: RenderPublicArgs): Promise<RenderPublicResult> {
    const { payload, slug } = args;
    const url = args.url ?? `/${slug}`;

    const state = derivePageState(payload);
    if (state.status !== "ready") {
        return { kind: "non-ready", status: state.status };
    }

    // Un'istanza di i18n per richiesta, nella lingua della pagina: la stessa
    // funzione può rendere in parallelo sedi in lingue diverse. Il client carica
    // la stessa lingua prima dell'hydration (`<html lang>`, entry-client).
    const lng = args.lang && i18n.hasResourceBundle(args.lang, "public") ? args.lang : "it";
    const i18nForRequest = i18n.cloneInstance({ lng, initAsync: false });

    const app = (
        <I18nextProvider i18n={i18nForRequest}>
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
        </I18nextProvider>
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
