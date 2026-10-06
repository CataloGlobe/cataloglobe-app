import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { AppHeaderWorkspace } from "@/components/layout/AppHeader/AppHeaderWorkspace";
import { PageHeaderSlot } from "@/components/layout/PageHeaderSlot";
import styles from "../shared/layoutShell.module.scss";

/**
 * Il Workspace è una porta (T17 WS3): niente sidebar. Le attività stanno in
 * pagina, l'account nel menu dell'avatar (Account · Esci).
 */
export default function WorkspaceLayout() {
    usePageTitle('Workspace');
    const contentRef = useRef<HTMLDivElement>(null);
    const { pathname } = useLocation();

    useEffect(() => {
        contentRef.current?.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className={styles.appLayout}>
            <BreadcrumbProvider>
                <PageHeaderProvider>
                    <header className={styles.globalHeader}>
                        <AppHeaderWorkspace />
                    </header>
                    <div className={styles.body}>
                        <main className={styles.main}>
                            <PageHeaderSlot scrollContainerRef={contentRef} />
                            <div ref={contentRef} className={styles.content}>
                                <Outlet />
                            </div>
                        </main>
                    </div>
                </PageHeaderProvider>
            </BreadcrumbProvider>
        </div>
    );
}
