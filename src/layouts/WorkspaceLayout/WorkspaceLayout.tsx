import { Outlet } from "react-router-dom";
import WorkspaceSidebar from "./WorkspaceSidebar";
import styles from "./WorkspaceLayout.module.scss";

export default function WorkspaceLayout() {
    return (
        <div className={styles.layout}>
            <WorkspaceSidebar />
            <main className={styles.main}>
                <Outlet />
            </main>
        </div>
    );
}
