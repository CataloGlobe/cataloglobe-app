import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { usePageHead } from "@/hooks/usePageHead";
import { usePublicLanguageSync } from "@/hooks/usePublicLanguageSync";
import { usePublicFontInjection } from "@/hooks/usePublicFontInjection";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import type { HubTab } from "@/types/collectionStyle";
import type { OrderingStateReason } from "@/types/orders";
import { VERTICAL_CONFIG } from "@/constants/verticalTypes";
import type { ResolvedPayloadShape } from "@/types/publicCatalog";
import { derivePageState, resolveRedirect, type PageState } from "./derivePageState";
import PublicCatalogReady from "./PublicCatalogReady";
import { listAllAllergens, type Allergen } from "@/services/supabase/allergens";

import { supabase } from "@/services/supabase/client";
import { fetchPublicCatalog, type CatalogSource, type PublicCatalogPayload } from "@/services/publicCatalog/fetchPublicCatalog";
import { getCached, setCached } from "@/services/publicCatalog/publicCatalogCache";

import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import PublicCatalogUnavailable from "@/components/PublicCollectionView/PublicCatalogUnavailable/PublicCatalogUnavailable";
import NotFound from "../NotFound/NotFound";
import { isValidLangFormat } from "@/utils/lang";
import DeviceFrame, { type DeviceFrameFormat } from "@/components/ui/DeviceFrame/DeviceFrame";
import PublicPreviewBar from "./components/PublicPreviewBar";
import { useTenantMembership } from "./useTenantMembership";
import {
    detectRealDeviceFormat,
    listPreviewFormats,
    resolvePreviewFormat,
    shouldShowPreviewBar
} from "./previewControl";
import pageStyles from "./PublicCollectionPage.module.scss";
// reviews_summary and recent_reviews still returned by edge function — unused in frontend for now

/* ===============================================
   PAGE
=============================================== */

// PublicBusiness + ResolvedPayloadShape promossi a src/types/publicCatalog.ts;
// PageState + derivazione pura in ./derivePageState.ts (SSR stage 3, step 1).

// ── Maintenance message centralization ───────────────────────────────────
// Centralizza i testi user-facing per reason di ordering maintenance.
// Single source of truth tra URL-param flow (table_maintenance) e
// payload-derived flow (ordering_disabled).
function messageForReason(reason: OrderingStateReason, t: TFunction): string {
    switch (reason) {
        case "ordering_disabled":
            return t("ordering.maintenance_qr_suspended");
        case "table_maintenance":
            return t("ordering.maintenance_table_unavailable");
        default:
            return t("ordering.maintenance_qr_unavailable");
    }
}

/**
 * Payload inlinato dalla shell SSR (`window.__PUBLIC_CATALOG__`). Esportato
 * perché lo consumano anche `entry-client.tsx` e `routes/publicRoutes.tsx`:
 * unica dichiarazione, non tre copie della stessa shape.
 */
export type PublicCatalogInitialPayload = {
    payload: ResolvedPayloadShape;
    allergens: Allergen[] | null;
};

type Props = {
    initialPayload?: PublicCatalogInitialPayload;
};

/**
 * Il payload SSR è single-use per SESSIONE, non per istanza.
 *
 * `entry-client.tsx` legge `window.__PUBLIC_CATALOG__` a livello modulo e lo
 * passa come prop: quel valore sopravvive a tutta la sessione SPA. La guardia
 * skip-fetch qui sotto è invece governata da un ref PER-ISTANZA
 * (`hydrationConsumedRef`), che si azzera ad ogni remount della pagina —
 * navigare su `/:slug/prenota` e tornare indietro smonta e rimonta
 * `PublicCollectionPage`. Con solo il ref, il remount ritrova il payload
 * inlinato (lingua base, ormai stale) e può ri-armare lo skip del fetch:
 * la pagina renderebbe contenuto vecchio con stato già `ready`, quindi anche
 * `usePublicLanguageSync` resta spento (attivo solo fuori dal ramo ready).
 *
 * Fix: il payload viene RILASCIATO dopo il primo consumo effettivo, così ogni
 * mount successivo non lo trova più e passa dal fetch. La disponibilità è
 * letta da `window` al mount (non dalla prop, che resta valorizzata per sempre).
 */
type SsrPayloadWindow = Window & {
    __PUBLIC_CATALOG__?: PublicCatalogInitialPayload;
};

function readSsrPayload(
    fallback: PublicCatalogInitialPayload | undefined
): PublicCatalogInitialPayload | undefined {
    // Render server (nessun window): la prop è l'unica sorgente.
    if (typeof window === "undefined") return fallback;
    return (window as SsrPayloadWindow).__PUBLIC_CATALOG__ ?? undefined;
}

/** Idempotente: dopo il primo consumo il payload non è più disponibile. */
function releaseSsrPayload(): void {
    if (typeof window === "undefined") return;
    (window as SsrPayloadWindow).__PUBLIC_CATALOG__ = undefined;
}

export default function PublicCollectionPage({ initialPayload }: Props) {
    const { slug, lang: langFromUrl } = useParams<{ slug: string; lang?: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation("public");
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const simulateParam = searchParams.get("simulate");
    const previewParam = searchParams.get("preview");

    // Maintenance mode mid-session — tre canali, in ordine di priorita:
    //   1. Router state (preferito): set da TableEntryPage navigate post-423
    //      resolve-table. Non shareable / non bookmarkable. Persiste a refresh
    //      via window.history.state (voluto: stato server, non client).
    //   2. URL param `?maintenance=<reason>` (legacy, backwards-compat 1 ciclo
    //      deploy per link salvati esistenti). Rimovibile in deploy successivo.
    //   3. Payload server-side `business.ordering_enabled`: source of truth
    //      per `ordering_disabled` (sostituisce URL param visibile/manipolabile).
    const orderingMaintenanceFromState = useMemo<
        { reason: OrderingStateReason; message: string } | null
    >(() => {
        const state = location.state as
            | { tableMaintenance?: { reason: OrderingStateReason; message: string } }
            | null;
        if (!state?.tableMaintenance) return null;
        // Whitelist defensive: solo reason canViewMenu=true (no full-page error).
        const VALID_STATE_REASONS = new Set<OrderingStateReason>([
            "table_maintenance"
        ]);
        if (!VALID_STATE_REASONS.has(state.tableMaintenance.reason)) return null;
        return state.tableMaintenance;
    }, [location.state]);

    const maintenanceParam = searchParams.get("maintenance");
    const orderingMaintenanceFromUrl = useMemo<
        { reason: OrderingStateReason; message: string } | null
    >(() => {
        if (!maintenanceParam) return null;
        const VALID_URL_PARAM_REASONS = new Set<OrderingStateReason>([
            "table_maintenance"
        ]);
        if (!VALID_URL_PARAM_REASONS.has(maintenanceParam as OrderingStateReason)) {
            return null;
        }
        const reason = maintenanceParam as OrderingStateReason;
        return { reason, message: messageForReason(reason, t) };
    }, [maintenanceParam, t]);
    const [effectiveSimulate, setEffectiveSimulate] = useState<string | null>(null);

    // URL caricato nell'iframe di preview: stesso path della finestra host
    // (slug + eventuale segmento lingua) e stessi query param, MENO `preview`.
    // Escludere `preview` serve a due cose:
    //   1. Stabilità: il formato è un resize CSS del frame, non un reload. Il
    //      src non deve cambiare al cambio formato — la stringa risultante
    //      resta identica, quindi React non riscrive l'attributo e l'iframe
    //      non ricarica (i payload `simulate` non sono cacheati: un reload
    //      costerebbe un refetch pieno ad ogni switch).
    //   2. Guardia anti-ricorsione: con `preview` nel src, la pagina dentro
    //      l'iframe monterebbe a sua volta un DeviceFrame con un altro iframe.
    const previewIframeSrc = useMemo(() => {
        const params = new URLSearchParams(location.search);
        params.delete("preview");
        const qs = params.toString();
        return `${location.pathname}${qs ? `?${qs}` : ""}`;
    }, [location.pathname, location.search]);

    // Payload SSR ancora disponibile a QUESTO mount (vedi readSsrPayload):
    // valutato una sola volta, non ri-letto ad ogni render. Su un remount
    // successivo al primo consumo vale `undefined` → la pagina fetcha.
    const [ssrPayload] = useState<PublicCatalogInitialPayload | undefined>(() =>
        readSsrPayload(initialPayload)
    );

    const [state, setState] = useState<PageState>(() =>
        ssrPayload
            ? derivePageState(ssrPayload.payload, ssrPayload.allergens)
            : { status: "loading" }
    );

    // ── Elementi riservati (mai visibili ai clienti) ──────────────────────
    // Un'unica verifica condivisa: "sessione presente E relazione reale con
    // QUESTO tenant" (owner o membership attiva, qualunque ruolo). Copre sia
    // il banner `?simulate=` sia la barra di controllo formato / `?preview=`.
    // Il tenant è noto solo a payload ricevuto → prima di allora tutto resta
    // nascosto (fail-closed). Il gate autorizzativo vero per `simulate` è
    // server-side (resolve-public-catalog): qui si decide solo cosa mostrare.
    const isMember = useTenantMembership(
        state.status === "ready" || state.status === "empty" || state.status === "catalog_empty"
            ? state.business.tenant_id
            : null
    );
    // Un non membro con `?simulate=` riceve dal server il catalogo normale:
    // il banner non deve comparire, l'esperienza è identica a un anonimo.
    const simulateAt = isMember === true ? effectiveSimulate : null;

    // Dispositivo reale: rilevazione one-shot al mount (nessun resize listener).
    // Dentro l'iframe del DeviceFrame la larghezza è quella del frame: la
    // pagina ospitata non deve né mostrare la barra né montare un frame
    // proprio — la finestra host possiede entrambi.
    const [realFormat] = useState<DeviceFrameFormat>(() =>
        typeof window === "undefined" ? "desktop" : detectRealDeviceFormat(window.innerWidth)
    );
    const [isFramed] = useState<boolean>(() => typeof window !== "undefined" && window.self !== window.top);

    // Device-frame di simulazione (?preview=): derivato, nessun effect. Non
    // richiede un refetch del catalogo, solo il montaggio del frame lato render.
    const effectivePreview = isFramed
        ? null
        : resolvePreviewFormat({ previewParam, realFormat, isMember });
    const previewFormats = useMemo(() => listPreviewFormats(realFormat), [realFormat]);
    const showPreviewBar = shouldShowPreviewBar({
        isMember,
        realFormat,
        isFramed,
        hasSimulate: !!simulateAt
    });
    // Pillola: scrive `?preview=<formato>` nell'URL (persistente, condivisibile —
    // stesso pattern di `simulate`). Il resto della query string è preservato.
    const handleSelectFormat = useCallback(
        (format: DeviceFrameFormat) => {
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set("preview", format);
                return next;
            });
        },
        [setSearchParams]
    );
    const previewBarNode = showPreviewBar ? (
        <PublicPreviewBar
            formats={previewFormats}
            activeFormat={effectivePreview ?? realFormat}
            onSelectFormat={handleSelectFormat}
            simulateAt={simulateAt}
            // Fissa solo con frame attivo: nel ramo senza frame la barra sta
            // nel flusso (bannerSlot) e non deve contendere lo z-index con
            // l'header sticky della pagina pubblica.
            sticky={effectivePreview !== null}
        />
    ) : null;

    // Fase 1 (URL-driven): applica la lingua dall'URL nelle SHELL
    // (loading/error/inactive/...). Nel ramo "ready" comanda il
    // `LanguageProvider` (Fase 2, dentro PublicCatalogReady): writer unico per
    // stato → niente ping-pong di changeLanguage al cambio lingua (il provider
    // conosce effective_language e preserva base≠it). Vedi usePublicLanguageSync.
    usePublicLanguageSync(state.status !== "ready");

    // Skip-hydration one-shot: il payload inlinato dal server è SEMPRE nella
    // lingua base (il rewrite SSR serve solo /:slug, senza segmento lingua).
    // Consumiamo lo skip del primo fetch una sola volta — al primo render
    // post-hydration e solo se la lingua richiesta coincide con quella
    // inlinata — così ogni cambio lingua o render successivo fetcha
    // normalmente. (entry-client non monta StrictMode → il ref non viene
    // consumato due volte; rivedere se StrictMode torna.)
    const hydrationConsumedRef = useRef(false);
    const inlinedBaseLang = ssrPayload?.payload.base_language_code ?? "it";

    // Payload-derived: ordering_disabled deriva da business.ordering_enabled.
    // Backward compat: snapshot Redis pre-Fix 1 puo non avere il campo →
    // `!== false` rende il check permissivo (no maintenance), submit-order
    // Edge runtime gestira eventuali tentativi via 423.
    const orderingMaintenanceFromPayload = useMemo<
        { reason: OrderingStateReason; message: string } | null
    >(() => {
        if (state.status !== "ready") return null;
        if (state.business.ordering_enabled !== false) return null;
        return {
            reason: "ordering_disabled",
            message: t("ordering.maintenance_qr_suspended")
        };
    }, [state, t]);

    // Priorita: Router state > URL param legacy > payload server.
    // table_maintenance (state/URL) prevale su ordering_disabled (payload):
    // e' piu specifico (singolo tavolo vs tutta la sede).
    const orderingMaintenance =
        orderingMaintenanceFromState ??
        orderingMaintenanceFromUrl ??
        orderingMaintenanceFromPayload;
    const [retryToken, setRetryToken] = useState(0);
    const handleRetry = useCallback(() => {
        setRetryToken(t => t + 1);
    }, []);

    // Dinamic head tags (title, description, OG) — only when ready.
    // Anche con menù vuoto la pagina è quella della sede: title/OG col suo nome.
    const headBusiness =
        state.status === "ready" || state.status === "empty" || state.status === "catalog_empty"
            ? state.business
            : null;
    const headLang = state.status === "ready" ? state.effectiveLanguage : undefined;
    const menuLabel = t("page.menu_label", { defaultValue: "Menu" });
    const headTitle = headBusiness ? `${headBusiness.name} · ${menuLabel}` : undefined;
    const headDescription = headBusiness
        ? headBusiness.address
            ? `${headBusiness.name} · ${headBusiness.address}`
            : headBusiness.name
        : undefined;
    const headImage = headBusiness?.cover_image ?? undefined;
    usePageHead({
        title: headTitle,
        description: headDescription,
        lang: headLang,
        imageUrl: headImage
    });

    // ── Font dello stile attivo — vedi usePublicFontInjection ────────────
    usePublicFontInjection(state.status === "ready" ? state.resolved.style : null);

    useEffect(() => {
        // Il payload SSR ha già fatto il suo lavoro: `ssrPayload` è stato letto
        // al mount e ha popolato lo stato iniziale (primo paint). Da qui in poi
        // nessun altro mount della sessione deve poterlo riusare — vedi
        // releaseSsrPayload. Idempotente, primo effect post-commit.
        releaseSsrPayload();

        if (!slug) {
            setState({ status: "error", messageKey: "page.invalid_link" });
            return;
        }

        // Pre-fetch redirect 1: lang format invalido → /:slug
        if (langFromUrl && !isValidLangFormat(langFromUrl)) {
            navigate(`/${slug}`, { replace: true });
            return;
        }

        // Pre-fetch redirect 2: uppercase normalize → /:slug/:lang(lowercase)
        if (langFromUrl && langFromUrl !== langFromUrl.toLowerCase()) {
            navigate(`/${slug}/${langFromUrl.toLowerCase()}`, { replace: true });
            return;
        }

        const validatedLang = isValidLangFormat(langFromUrl) ? langFromUrl!.toLowerCase() : undefined;

        // Skip fetch on SSR hydration: payload already inlined by the server.
        // Vale SOLO al primo render post-hydration e SOLO se la lingua
        // richiesta coincide con quella inlinata (lingua base). Nessun segmento
        // lingua (validatedLang undefined) ⇒ lingua base. Qualsiasi cambio
        // lingua client-side deve fetchare → contenuto tradotto senza reload.
        // retryToken > 0 (manual retry) e simulateParam bypassano lo skip.
        const requestedLang = validatedLang ?? inlinedBaseLang;
        if (
            ssrPayload &&
            !hydrationConsumedRef.current &&
            requestedLang === inlinedBaseLang &&
            retryToken === 0 &&
            !simulateParam
        ) {
            hydrationConsumedRef.current = true;
            return;
        }

        let cancelled = false;

        /**
         * Processa un payload (fresco o cachato) verso uno PageState.
         * Orchestrazione: redirect (intento da resolveRedirect, solo payload
         * fresco) → allergeni (fetch gated, solo se il payload arriva a
         * "ready") → stato (derivePageState puro) → cache write.
         */
        async function processPayload(
            payload: PublicCatalogPayload,
            opts: { fromCache: boolean; isSimulate: boolean; source: CatalogSource }
        ): Promise<void> {
            // Unico punto di cast del payload opaco alla shape tipizzata.
            const typedPayload = payload as unknown as ResolvedPayloadShape;

            const redirectTo = resolveRedirect(typedPayload, {
                fromCache: opts.fromCache,
                slug: slug!,
                requestedLang: validatedLang
            });
            if (redirectTo) {
                // Guard: il cleanup dell'effect (cancelled = true) non è
                // sincrono con una navigazione utente avvenuta nel frattempo
                // (es. tap su "Prenota un tavolo" mentre questo fetch era
                // ancora in volo) — senza questo check il redirect di
                // canonicalizzazione lingua sovrascriverebbe con replace:true
                // la navigazione già fatta dall'utente.
                if (cancelled) return;
                navigate(redirectTo, { replace: true });
                return;
            }

            // Primo pass senza allergeni: decide se il payload arriva a
            // "ready". Evita il fetch allergeni su inactive/subscription/empty
            // (come oggi: in processPayload il fetch stava DOPO quegli early
            // return). derivePageState è pura → richiamarla è gratis.
            const probe = derivePageState(typedPayload, null);
            if (probe.status !== "ready") {
                setState(probe);
                return;
            }

            const showAllergens = typedPayload.vertical_type
                ? VERTICAL_CONFIG[typedPayload.vertical_type]?.productSections.allergens === true
                : false;
            let allergens: Allergen[] | null = null;
            if (showAllergens) {
                try {
                    allergens = await listAllAllergens();
                } catch (e) {
                    console.error("[PublicCollectionPage] allergens load error:", e);
                    allergens = null;
                }
                if (cancelled) return;
            }

            const isStale = opts.fromCache || opts.source === "stale";

            const next = derivePageState(typedPayload, allergens);
            if (next.status === "ready") {
                setState({ ...next, isRefetching: false, isStale });
            } else {
                // Difensivo: derivePageState è pura, stesso payload del probe
                // → non può cambiare status. Mai raggiunto.
                setState(next);
            }

            // Cache solo payload "healthy" provenienti da risposta LIVE (non stale).
            // Skip per:
            //   - opts.fromCache: il payload viene già dalla cache localStorage, riscriverlo
            //     come "savedAt: now" falsa la freschezza dello snapshot.
            //   - opts.isSimulate: i payload simulati sono time-shifted.
            //   - opts.source === "stale": il server ha servito uno snapshot Redis
            //     vecchio (Supabase down). Salvarlo in localStorage con savedAt=now
            //     falsa la freschezza locale.
            if (!opts.fromCache && !opts.isSimulate && opts.source !== "stale") {
                setCached(slug!, validatedLang, payload);
            }
        }

        async function load() {
            try {
                setState(prev => {
                    if (prev.status === "ready") {
                        // Nuovo tentativo: azzera un eventuale degrado precedente
                        // (banner lingua-fallita) mentre il refetch è in corso.
                        return { ...prev, isRefetching: true, langSwitchFailed: null };
                    }
                    return { status: "loading" };
                });

                // Pre-check "sessione presente" solo per scegliere il trasporto
                // (invoke diretto, no-store) — il tenant non è ancora noto qui.
                // L'autorizzazione vera (appartenenza al tenant) è server-side:
                // un non membro riceve il catalogo normale e il banner resta
                // nascosto (vedi simulateAt / useTenantMembership).
                let simulate: string | undefined = undefined;
                if (simulateParam) {
                    const {
                        data: { session }
                    } = await supabase.auth.getSession();
                    if (session) {
                        const parsed = new Date(simulateParam);
                        if (!Number.isNaN(parsed.getTime())) {
                            simulate = simulateParam;
                        }
                    }
                }
                if (cancelled) return;
                setEffectiveSimulate(simulate ?? null);

                const result = await fetchPublicCatalog({
                    slug: slug!,
                    lang: validatedLang,
                    simulate
                });

                if (cancelled) return;

                if (result.kind === "success") {
                    await processPayload(result.payload, {
                        fromCache: false,
                        isSimulate: !!simulate,
                        source: result.source
                    });
                    return;
                }

                if (result.kind === "domain_error") {
                    console.warn("[PublicCollectionPage] domain error:", result.code);
                    // Codici domain definitivi (link rotto, sede inesistente) →
                    // NotFound. Nessun retry possibile.
                    setState({ status: "domain_error", code: result.code });
                    return;
                }

                // network_error → tenta fallback da cache locale
                console.error("[PublicCollectionPage] network error after retries:", result.cause);
                const cached = simulate ? null : getCached(slug!, validatedLang);
                if (cached) {
                    console.debug("[PublicCollectionPage] using cached snapshot from", cached.savedAt.toISOString());
                    await processPayload(cached.payload, {
                        fromCache: true,
                        isSimulate: false,
                        source: "unknown"
                    });
                    return;
                }

                degradeOrError();
            } catch (err) {
                if (cancelled) return;
                console.error("[PublicCollectionPage] loading error:", err);
                degradeOrError();
            }

            /**
             * Fallback finale del fetch fallito, DOPO il miss di getCached.
             * Se esiste già uno stato `ready` (menù visibile in una lingua),
             * NON distruggerlo con l'error card: resta sul contenuto corrente e
             * accende il banner lingua-fallita (LanguageFallbackBanner) col
             * codice lingua richiesto. Solo quando non c'è nulla da mostrare
             * (primo load fallito) → error card full-page.
             */
            function degradeOrError() {
                setState(prev => {
                    if (prev.status === "ready") {
                        return {
                            ...prev,
                            isRefetching: false,
                            langSwitchFailed: validatedLang ?? prev.baseLanguage
                        };
                    }
                    return { status: "error", messageKey: "page.loading_error" };
                });
            }
        }

        load();
        return () => {
            cancelled = true;
        };
        // initialPayload/inlinedBaseLang sono seed di hydration stabili (letti una volta da window.__PUBLIC_CATALOG__): esclusi di proposito per non ri-triggerare il fetch — i trigger reali sono langFromUrl/simulateParam/retryToken.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, langFromUrl, simulateParam, navigate, retryToken]);

    const [activeTab, setActiveTab] = useState<HubTab>("menu");
    const handleTabChange = useCallback(
        (tab: HubTab) => {
            const prevTab = activeTab;
            setActiveTab(tab);
            if (state.status === "ready" && prevTab !== tab) {
                trackEvent(state.business.id, "tab_switch", {
                    from_tab: prevTab,
                    to_tab: tab
                });
            }
        },
        [activeTab, state]
    );
    // Reset raw a "menu" (niente analytics): usato dal fallback quando la tab
    // "events" non ha piu contenuti da mostrare.
    const handleTabAutoReset = useCallback(() => {
        setActiveTab("menu");
    }, []);

    // ── Language change toast ──────────────────────────────────────────────
    // toastMounted: false sul primo render (coincide col server che non
    // renderizza PublicCollectionPage e quindi non ha il toast in #root).
    // Diventa true dopo il mount → nessun mismatch di hydration (#418).
    const [toastMounted, setToastMounted] = useState(false);
    useEffect(() => setToastMounted(true), []);

    type ToastPhase = "idle" | "loading" | "done";
    const [toastPhase, setToastPhase] = useState<ToastPhase>("idle");
    const [toastLabel, setToastLabel] = useState<string>("");
    const prevIsRefetchingRef = useRef(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (state.status !== "ready") return;
        const isRefetching = state.isRefetching ?? false;

        if (isRefetching && !prevIsRefetchingRef.current) {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            setToastPhase("loading");
        } else if (!isRefetching && prevIsRefetchingRef.current) {
            // Cambio-lingua fallito (degrado attivo): niente toast "done" col
            // check verde — sarebbe fuorviante. Il LanguageFallbackBanner è il
            // segnale persistente. Chiudi solo la fase loading.
            if (state.langSwitchFailed) {
                setToastPhase("idle");
            } else {
                const lang = state.availableLanguages.find(l => l.code === state.effectiveLanguage);
                setToastLabel(lang?.name_native ?? state.effectiveLanguage.toUpperCase());
                setToastPhase("done");
                toastTimerRef.current = setTimeout(() => setToastPhase("idle"), 1200);
            }
        }

        prevIsRefetchingRef.current = isRefetching;
    }, [state]);

    useEffect(() => {
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    // NB: nessun preload cover client-side. Il preload LCP della cover è emesso
    // UNA sola volta dalla shell SSR (api/_lib/publicShell.ts) con la variante
    // responsive (imagesrcset, buildCoverImageSet). Un preload React-side con
    // l'URL grezzo causava un secondo download (raw ~194 KB in gara con la
    // variante) che peggiorava/destabilizzava l'LCP.

    // ── Analytics: page_view (una sola volta quando la pagina è pronta) ──
    const pageViewTracked = useRef(false);
    useEffect(() => {
        if (state.status !== "ready" || pageViewTracked.current) return;
        pageViewTracked.current = true;
        trackEvent(state.business.id, "page_view", {
            slug,
            referrer: document.referrer || undefined
        });
    }, [state, slug]);

    /* ============================
       RENDER
    ============================ */

    if (state.status === "loading") {
        return <AppLoader intent="public" />;
    }

    if (state.status === "error") {
        return (
            <div className={pageStyles.errorRoot} role="alert">
                <div className={pageStyles.errorCard}>
                    <h1 className={pageStyles.errorTitle}>{t("error.title")}</h1>
                    <p className={pageStyles.errorDescription}>{t("error.description")}</p>
                    <button type="button" className={pageStyles.errorButton} onClick={handleRetry}>
                        {t("error.retry")}
                    </button>
                </div>
            </div>
        );
    }

    if (state.status === "domain_error") {
        // not_found / invalid_link / invalid_lang / missing_slug / domain_error
        // → link rotto o sede inesistente. NotFound senza retry — il retry
        // non risolverebbe il problema (deterministico server-side).
        return <NotFound variant="business" />;
    }

    if (state.status === "inactive") {
        return <NotFound variant="business-inactive" />;
    }

    if (state.status === "subscription_inactive") {
        return <NotFound variant="subscription-inactive" />;
    }

    // `catalog_empty` (regola di programmazione vinta, catalogo senza
    // prodotti visibili ORA) NON è un errore e NON passa da NotFound: sede
    // pubblicata, branding minimo (logo + nome) via PublicCatalogUnavailable,
    // niente chrome (header/search/hub). Il 404 vero resta `domain_error`.
    // NB: `empty` (nessun catalogo risolto/nessuna regola vinta, comportamento
    // storico) NON passa di qui: cade nel render sotto, chrome completa via
    // PublicCatalogReady, invariato da prima di questo lavoro.
    // La barra riservata compare anche qui: è proprio in questo stato che un
    // membro vuole verificare (via `?simulate=`) cosa vedrà il cliente quando
    // una regola futura entrerà in vigore. Nessun frame in questo ramo (non
    // c'è catalogo da incorniciare): solo la barra sopra la card.
    if (state.status === "catalog_empty") {
        return (
            <div className={pageStyles.previewShell}>
                {previewBarNode}
                <PublicCatalogUnavailable
                    business={state.business}
                    tenantLogoUrl={state.tenantLogoUrl}
                />
            </div>
        );
    }

    // Lingua di destinazione: già nell'URL quando il refetch inizia.
    // Fallback a baseLanguage se si torna alla lingua base (URL senza /lang).
    const toastTargetLang = langFromUrl ?? state.baseLanguage;

    const catalogReadyNode = (
        <PublicCatalogReady
            slug={slug!}
            data={state}
            orderingMaintenance={orderingMaintenance}
            onRetry={handleRetry}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabAutoReset={handleTabAutoReset}
            bannerSlot={previewBarNode}
        >
            {/* Toast cambio lingua — gated post-mount (non SSR) per evitare
                mismatch hydration #418: server non renderizza PublicCollectionPage
                e quindi non emette questo div in #root. */}
            {toastMounted && <div
                className={pageStyles.languageToast}
                data-phase={toastPhase}
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {toastPhase === "loading" && (
                    <span className={pageStyles.languageToastSpinner} />
                )}
                {toastPhase === "done" && (
                    <span className={pageStyles.languageToastCheck}>✓</span>
                )}
                <span>
                    {toastPhase === "loading"
                        ? i18n.t("toast.translating", { lng: toastTargetLang, ns: "public" })
                        : toastPhase === "done"
                          ? toastLabel
                          : ""}
                </span>
            </div>}
        </PublicCatalogReady>
    );

    // Device-frame di simulazione: monta SOLO quando un formato valido è
    // stato risolto (auth + regola "≤ dispositivo reale", vedi effect sopra).
    // Nessun frame → markup identico a prima di questo lavoro (zero rischio
    // di regressione sul comportamento pubblico normale).
    if (!effectivePreview) {
        return catalogReadyNode;
    }

    // Il frame ospita una finestra REALE (iframe same-origin su /:slug), non
    // l'albero React in-place: dentro l'iframe window/matchMedia/createPortal
    // lavorano nativamente sulle dimensioni del frame, quindi header,
    // bottom-bar e PublicSheet si comportano come su un dispositivo reale di
    // quel formato senza alcuno scoping manuale (l'approccio a scoping
    // per-componente è stato tentato e revertito — vedi
    // docs/audit-device-frame-pagina-pubblica.md).
    // Richiede X-Frame-Options: SAMEORIGIN + CSP frame-ancestors 'self'
    // (vercel.json, FASE 3.1): in `npm run dev` Vite non invia XFO, quindi
    // l'embedding va verificato su deploy reale.
    // `catalogReadyNode` resta costruito ma non montato su questo ramo: è solo
    // creazione di elementi React (nessun effect, nessun fetch) — il contenuto
    // vero lo renderizza l'iframe.
    // La barra resta montata anche qui, sopra il frame: dentro l'iframe la
    // pagina ospitata NON la renderizza (isFramed), quindi il controllo per
    // cambiare ancora formato è sempre e solo questo.
    return (
        <div className={pageStyles.previewShell}>
            {previewBarNode}
            <DeviceFrame
                format={effectivePreview}
                iframeSrc={previewIframeSrc}
                iframeTitle={t("page.preview_frame_title", {
                    defaultValue: "Anteprima della pagina pubblica"
                })}
            />
        </div>
    );
}
