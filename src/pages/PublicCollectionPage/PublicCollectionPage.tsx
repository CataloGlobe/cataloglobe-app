import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PublicCollectionRenderer from "@/features/public/components/PublicCollectionRenderer";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";

import { getBusinessBySlug } from "@/services/supabase/businesses";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";

import type { Business } from "@/types/database";
import { DEFAULT_PUBLIC_STYLE } from "@/utils/getDefaultPublicStyle";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import NotFound from "../NotFound/NotFound";
import { ResolvedCollections } from "@/services/supabase/v2/resolveActivityCatalogsV2";

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
          status: "ready";
          business: Business;
          resolved: ResolvedCollections;
      }
    | {
          status: "empty";
          business: Business;
      };

export default function PublicCollectionPage() {
    const { slug } = useParams<{ slug: string }>();
    const [state, setState] = useState<PageState>({ status: "loading" });

    useEffect(() => {
        if (!slug) {
            setState({
                status: "error",
                message: "Link non valido."
            });
            return;
        }

        const businessSlug = slug;
        let cancelled = false;

        async function load() {
            try {
                setState({ status: "loading" });

                /* ============================
                   1) BUSINESS
                ============================ */
                const business = await getBusinessBySlug(businessSlug);

                if (!business) {
                    throw new Error("Attività non trovata.");
                }

                /* ============================
                   2) RESOLVER
                ============================ */
                const resolved = await resolveBusinessCollections(business.id);

                if (
                    !resolved.catalog &&
                    (!resolved.featured?.hero || resolved.featured.hero.length === 0) &&
                    (!resolved.featured?.before_catalog ||
                        resolved.featured.before_catalog.length === 0) &&
                    (!resolved.featured?.after_catalog ||
                        resolved.featured.after_catalog.length === 0)
                ) {
                    setState({
                        status: "empty",
                        business
                    });
                    return;
                }

                if (cancelled) return;

                setState({
                    status: "ready",
                    business,
                    resolved
                });
            } catch (err) {
                if (cancelled) return;

                console.error("[PublicCollectionPage] loading error:", err);

                setState({
                    status: "error",
                    message: err instanceof Error ? err.message : "Errore di caricamento."
                });
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [slug]);

    useEffect(() => {
        if (state.status === "ready") {
            document.title = `${state.business.name} | CataloGlobe`;
        }
    }, [state]);

    /* ============================
       RENDER
    ============================ */

    if (state.status === "loading") {
        return <AppLoader message="Stiamo caricando il catalogo" />;
    }

    if (state.status === "error") {
        return <NotFound variant="business" />;
    }

    if (state.status === "empty") {
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100vh",
                    padding: "24px",
                    textAlign: "center"
                }}
            >
                <h2>{state.business.name}</h2>
                <p>Nessun menu disponibile al momento.</p>
            </div>
        );
    }

    return (
        <PublicThemeScope style={state.resolved.style}>
            <PublicCollectionRenderer business={state.business} resolved={state.resolved} />
        </PublicThemeScope>
    );
}
