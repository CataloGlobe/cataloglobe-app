import React from "react";
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { serializeTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { ResolvedCollections } from "@/types/resolvedCollections";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import PublicCollectionRenderer from "@/features/public/components/PublicCollectionRenderer";
import { createMockPublicCollection } from "@/features/public/mock/mockPublicCollection";

type Props = {
    model: StyleTokenModel;
};

/**
 * Renders the real public catalog UI (PublicCollectionRenderer) inside a
 * scoped theme (PublicThemeScope) using mock data.
 *
 * The active style tokens are serialized and embedded in `resolved.style.config`
 * so that PublicCollectionRenderer can derive token-dependent behavior
 * (e.g. card layout grid/list) correctly during preview.
 */
export default function RealRendererPreview({ model }: Props) {
    const mock = createMockPublicCollection();

    // Embed serialized tokens so the renderer's internal parseTokens call
    // produces the same model the editor is currently showing.
    const resolved: ResolvedCollections = {
        ...mock.resolved,
        style: {
            id: "preview",
            name: "preview",
            config: serializeTokens(model)
        }
    };

    return (
        <div style={{ maxHeight: "600px", overflowY: "auto" }}>
            <PublicThemeScope tokens={model}>
                <PublicCollectionRenderer business={mock.business} resolved={resolved} />
            </PublicThemeScope>
        </div>
    );
}
