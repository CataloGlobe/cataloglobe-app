import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageHead } from "@/hooks/usePageHead";
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
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import NotFound from "../NotFound/NotFound";
import { buildSingleFamilyFontUrl } from "@utils/publicFontUrl";
import { isValidLangFormat } from "@/utils/lang";
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
const ORDERING_DISABLED_MESSAGE =
    "Il ristorante ha temporaneamente sospeso le ordinazioni tramite QR. Per favore, chiedi allo staff per ordinare.";

function messageForReason(reason: OrderingStateReason): string {
    switch (reason) {
        case "ordering_disabled":
            return ORDERING_DISABLED_MESSAGE;
        case "table_maintenance":
            return "Questo tavolo non e' al momento disponibile per le ordinazioni. Chiedi allo staff.";
        default:
            return "L'ordinazione tramite QR non e' al momento disponibile. Chiedi allo staff.";
    }
}

type Props = {
    initialPayload?: {
        payload: ResolvedPayloadShape;
        allergens: Allergen[] | null;
    };
};

export default function PublicCollectionPage({ initialPayload }: Props) {
    const { slug, lang: langFromUrl } = useParams<{ slug: string; lang?: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation("public");
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const simulateParam = searchParams.get("simulate");

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
        return { reason, message: messageForReason(reason) };
    }, [maintenanceParam]);
    const [effectiveSimulate, setEffectiveSimulate] = useState<string | null>(null);
    const isSimulation = !!effectiveSimulate;
    const [state, setState] = useState<PageState>(() =>
        initialPayload
            ? derivePageState(initialPayload.payload, initialPayload.allergens)
            : { status: "loading" }
    );

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
            message: ORDERING_DISABLED_MESSAGE
        };
    }, [state]);

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
    const headBusiness = state.status === "ready" ? state.business : null;
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

    // ── Font dello stile attivo (Step 2) ─────────────────────────────────
    // Warm: il middleware ha già iniettato <link id="mw-font"> nell'head →
    // nessun caricamento runtime. Cold (fallback opzione B): carica la SOLA
    // famiglia dello stile attivo appena i token arrivano col payload — non
    // più le 8 famiglie di loadPublicFonts (che resta in uso solo nello
    // Style Editor).
    const activeFontToken =
        state.status === "ready"
            ? parseTokens(state.resolved.style?.config ?? null).typography.fontFamily
            : null;

    useEffect(() => {
        if (!activeFontToken) return;
        if (document.getElementById("mw-font")) return;

        // Cold hit = HTML originale: l'Inter variable blocking di index.html
        // è ancora presente (il de-block Step 3a avviene solo sul warm), la
        // spec statica sarebbe un secondo download inutile (~30KB).
        if (activeFontToken === "inter") return;

        const href = buildSingleFamilyFontUrl(activeFontToken);
        if (!href) return; // token sconosciuto: nessuna injection

        const existing = document.getElementById("public-font-fallback") as HTMLLinkElement | null;
        if (existing) {
            if (existing.href !== href) existing.href = href;
            return;
        }
        const link = document.createElement("link");
        link.id = "public-font-fallback";
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);

        return () => {
            if (document.head.contains(link)) document.head.removeChild(link);
        };
    }, [activeFontToken]);

    useEffect(() => {
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
        // retryToken > 0 (manual retry) and simulateParam bypass the skip.
        if (initialPayload && retryToken === 0 && !simulateParam) return;

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
                        return { ...prev, isRefetching: true };
                    }
                    return { status: "loading" };
                });

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

                setState({ status: "error", messageKey: "page.loading_error" });
            } catch (err) {
                if (cancelled) return;
                console.error("[PublicCollectionPage] loading error:", err);
                setState({ status: "error", messageKey: "page.loading_error" });
            }
        }

        load();
        return () => {
            cancelled = true;
        };
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
            const lang = state.availableLanguages.find(l => l.code === state.effectiveLanguage);
            setToastLabel(lang?.name_native ?? state.effectiveLanguage.toUpperCase());
            setToastPhase("done");
            toastTimerRef.current = setTimeout(() => setToastPhase("idle"), 1200);
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
        return (
            <NotFound
                variant="business-inactive"
                inactiveReason={
                    state.inactiveReason as "maintenance" | "closed" | "unavailable" | null
                }
            />
        );
    }

    if (state.status === "subscription_inactive") {
        return <NotFound variant="subscription-inactive" />;
    }

    if (state.status === "empty") {
        return <NotFound variant="business-empty" />;
    }

    // Lingua di destinazione: già nell'URL quando il refetch inizia.
    // Fallback a baseLanguage se si torna alla lingua base (URL senza /lang).
    const toastTargetLang = langFromUrl ?? state.baseLanguage;

    return (
        <PublicCatalogReady
            slug={slug!}
            data={state}
            orderingMaintenance={orderingMaintenance}
            onRetry={handleRetry}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            bannerSlot={
                isSimulation ? (
                    <div
                        style={{
                            position: "relative",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.5rem 1rem",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: "0.8rem",
                            fontWeight: 500,
                            borderBottom: "1px solid #fde68a"
                        }}
                    >
                        <span>{t("page.simulation_banner")}</span>
                        <span>
                            {new Date(effectiveSimulate!).toLocaleString("it-IT", {
                                timeZone: "Europe/Rome"
                            })}
                        </span>
                    </div>
                ) : null
            }
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
}
