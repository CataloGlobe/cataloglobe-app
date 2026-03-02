import React from "react";
import type { Business } from "@/types/database";
import { ResolvedCollections } from "@/services/supabase/v2/resolveActivityCatalogsV2";
import { useRuntimeStyle } from "@/hooks/useRuntimeStyle";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import FeaturedBlock from "./FeaturedBlock/FeaturedBlock";
import PublicCatalogTree from "./PublicCatalogTree/PublicCatalogTree";
import styles from "./PublicCollectionView.module.scss";

type Props = {
    business: Pick<Business, "name" | "cover_image">;
    resolved: ResolvedCollections;
};

export default function PublicCollectionView({ business, resolved }: Props) {
    const { style, featured, catalog } = resolved;

    // Injects --pub-* CSS variables on :root from the active schedule's style.
    // Falls back to DEFAULT_STYLE_TOKENS when style is null.
    // Cleans up on unmount (so dashboard is unaffected).
    useRuntimeStyle(style);

    const tokens = parseTokens(style?.config);

    return (
        <div className={styles.page}>
            <a href="#main-content" className={styles.skipLink}>
                Vai al contenuto
            </a>

            <div className={styles.container}>
                <header className={styles.header}>
                    <h1 className={styles.businessName}>{business.name}</h1>
                    {business.cover_image && (
                        <img
                            src={business.cover_image}
                            alt="Copertina"
                            className={styles.coverImage}
                        />
                    )}
                </header>

                <main id="main-content">
                    {featured?.hero && featured.hero.length > 0 && (
                        <section className={styles.section}>
                            <FeaturedBlock blocks={featured.hero} />
                        </section>
                    )}

                    {featured?.before_catalog && featured.before_catalog.length > 0 && (
                        <section className={styles.section}>
                            <FeaturedBlock blocks={featured.before_catalog} />
                        </section>
                    )}

                    {catalog && (
                        <section className={styles.section}>
                            <h2 className={styles.catalogTitle}>{catalog.name}</h2>
                            <div className={styles.catalogTree}>
                                {catalog.categories?.map(category => (
                                    <PublicCatalogTree
                                        key={category.id}
                                        category={category}
                                        tokens={tokens}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {featured?.after_catalog && featured.after_catalog.length > 0 && (
                        <section className={styles.section}>
                            <FeaturedBlock blocks={featured.after_catalog} />
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}
