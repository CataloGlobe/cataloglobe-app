import { useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import WorkspaceSidebar from "./WorkspaceSidebar";
import styles from "./WorkspaceLayout.module.scss";

export default function WorkspaceLayout() {
    const mainRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    useEffect(() => {
        mainRef.current?.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className={styles.layout}>
            <WorkspaceSidebar />
            <main className={styles.main} ref={mainRef}>
                <Outlet />
            </main>
        </div>
    );
}
