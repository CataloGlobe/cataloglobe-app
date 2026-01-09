import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import PublicCollectionView from "@/components/PublicCollectionView/PublicCollectionView";

import { getBusinessBySlug } from "@/services/supabase/businesses";
import { getPublicBusinessCollection } from "@/services/supabase/collections";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";

import type { PublicCollection } from "@/types/collectionPublic";
import type { Business } from "@/types/database";
import CollectionView from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { DEFAULT_PUBLIC_STYLE } from "@/utils/getDefaultPublicStyle";
import { getEmptyCopy } from "@/utils/getEmptyCopy";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
          status: "ready";
          business: Business;
          collection: PublicCollection;
          overlayCollection: PublicCollection | null;
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

                if (!resolved.primary) {
                    setState({
                        status: "empty",
                        business
                    });
                    return;
                }

                /* ============================
                   3) COLLECTION PRIMARY
                ============================ */
                const collection = await getPublicBusinessCollection(business.id, resolved.primary);

                /* ============================
                   4) OVERLAY (opzionale)
                ============================ */
                let overlayCollection: PublicCollection | null = null;

                if (resolved.overlay) {
                    overlayCollection = await getPublicBusinessCollection(
                        business.id,
                        resolved.overlay
                    );
                }

                if (cancelled) return;

                setState({
                    status: "ready",
                    business,
                    collection,
                    overlayCollection
                });
            } catch (err) {
                if (cancelled) return;

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

    /* ============================
       RENDER
    ============================ */

    if (state.status === "loading") {
        return <AppLoader message="Stiamo caricando il catalogo" />;
    }

    if (state.status === "error") {
        return (
            <main>
                <Text variant="body" colorVariant="warning">
                    {state.message}
                </Text>
            </main>
        );
    }

    if (state.status === "empty") {
        return (
            <CollectionView
                mode="public"
                businessName={state.business.name}
                businessImage={state.business.cover_image ?? null}
                collectionTitle="Menu"
                sections={[]}
                style={DEFAULT_PUBLIC_STYLE}
                emptyState={getEmptyCopy(state.business)}
            />
        );
    }

    return (
        <PublicCollectionView
            business={state.business}
            collection={state.collection}
            overlayCollection={state.overlayCollection}
        />
    );
}
