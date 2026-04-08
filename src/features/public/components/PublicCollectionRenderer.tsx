import React from "react";
import type { Business } from "@/types/database";
import type { ResolvedCollections } from "@/types/resolvedCollections";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import FeaturedBlock from "@/components/PublicCollectionView/FeaturedBlock/FeaturedBlock";
import PublicCatalogTree from "@/components/PublicCollectionView/PublicCatalogTree/PublicCatalogTree";
import styles from "@/components/PublicCollectionView/PublicCollectionView.module.scss";

type Props = {
    business: Pick<Business, "name" | "cover_image">;
    resolved: ResolvedCollections;
};

export default function PublicCollectionRenderer({ business, resolved }: Props) {
    const { style, featured, catalog } = resolved;

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
