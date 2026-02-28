import React from "react";
import styles from "../CatalogEngine.module.scss";

type CatalogSplitLayoutProps = {
    tree: React.ReactNode;
    content: React.ReactNode;
};

export function CatalogSplitLayout({ tree, content }: CatalogSplitLayoutProps) {
    return (
        <div className={styles.catalogLayout}>
            <aside className={styles.catalogTreePane}>{tree}</aside>
            <section className={styles.catalogContentPane}>{content}</section>
        </div>
    );
}

