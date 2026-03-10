/**
 * @deprecated
 * Business creation is now a drawer flow launched from /workspace.
 * This page is kept only for backward compatibility with any existing links.
 */
import { Navigate } from "react-router-dom";

export default function CreateBusiness() {
    return <Navigate to="/workspace" replace />;
}
