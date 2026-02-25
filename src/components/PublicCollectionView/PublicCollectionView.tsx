import React, { useEffect } from "react";
import type { Business } from "@/types/database";
import { ResolvedCollections } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import FeaturedBlock from "./FeaturedBlock/FeaturedBlock";
import PublicCatalogTree from "./PublicCatalogTree/PublicCatalogTree";
import styles from "./PublicCollectionView.module.scss";

type Props = {
    business: Pick<Business, "name" | "cover_image">;
    resolved: ResolvedCollections;
};

function generateStyleVars(config: any): React.CSSProperties {
    if (!config) return {};

    // Very basic CSS var generation from config based on existing logic.
    // The exact properties depend on the JSON saved in style_versions.
    const vars: Record<string, string> = {};
    if (config.primaryColor) vars["--color-primary"] = config.primaryColor;
    if (config.backgroundColor) vars["--color-background"] = config.backgroundColor;
    if (config.textColor) vars["--color-text"] = config.textColor;

    return vars as React.CSSProperties;
}

export default function PublicCollectionView({ business, resolved }: Props) {
    const { style, featured, catalog } = resolved;
    const styleVars = style?.config ? generateStyleVars(style.config) : {};

    return (
        <div className={styles.publicCollectionContainer} style={styleVars}>
            {/* Header placeholder (using business info if needed) */}
            <header className={styles.header}>
                <h1 className={styles.businessName}>{business.name}</h1>
                {business.cover_image && (
                    <img src={business.cover_image} alt="Copertina" className={styles.coverImage} />
                )}
            </header>

            <main className={styles.mainContent}>
                {featured?.hero && featured.hero.length > 0 && (
                    <section className={styles.heroSection}>
                        <FeaturedBlock blocks={featured.hero} />
                    </section>
                )}

                {featured?.before_catalog && featured.before_catalog.length > 0 && (
                    <section className={styles.beforeCatalogSection}>
                        <FeaturedBlock blocks={featured.before_catalog} />
                    </section>
                )}

                {catalog && (
                    <section className={styles.catalogSection}>
                        <h2 className={styles.catalogTitle}>{catalog.name}</h2>

                        {/* Placeholder for now. We will replace this with the hierarchical rendering */}
                        <div className={styles.catalogTreeContainer}>
                            {catalog.categories?.map(category => (
                                <PublicCatalogTree key={category.id} category={category} />
                            ))}
                        </div>
                    </section>
                )}

                {featured?.after_catalog && featured.after_catalog.length > 0 && (
                    <section className={styles.afterCatalogSection}>
                        <FeaturedBlock blocks={featured.after_catalog} />
                    </section>
                )}
            </main>
        </div>
    );
}
