import { Navigate, useLocation } from "react-router-dom";

const STORAGE_KEY = "cg_v2_selected_tenant_id";

/**
 * Legacy backward-compatibility redirect.
 *
 * Translates old /dashboard/* URLs to the new /business/:id/* equivalents.
 * If no tenant is stored, falls back to /workspace.
 *
 * Mapping:
 *   /dashboard                    → /business/:id/overview
 *   /dashboard/attivita/*         → /business/:id/locations/*
 *   /dashboard/programmazione/*   → /business/:id/scheduling/*
 *   /dashboard/cataloghi/*        → /business/:id/catalogs/*
 *   /dashboard/prodotti/*         → /business/:id/products/*
 *   /dashboard/contenuti-in-evidenza/* → /business/:id/featured/*
 *   /dashboard/stili/*            → /business/:id/styles/*
 *   /dashboard/attributi          → /business/:id/attributes
 *   /dashboard/recensioni         → /business/:id/reviews
 *   /dashboard/analitiche         → /business/:id/analytics
 *   /dashboard/impostazioni/*     → /business/:id/settings/*
 */

const PATH_MAP: Record<string, string> = {
    attivita: "locations",
    programmazione: "scheduling",
    cataloghi: "catalogs",
    prodotti: "products",
    "contenuti-in-evidenza": "featured",
    stili: "styles",
    attributi: "attributes",
    recensioni: "reviews",
    analitiche: "analytics",
    impostazioni: "settings"
};

export function DashboardRedirect() {
    const location = useLocation();
    const storedId = localStorage.getItem(STORAGE_KEY);

    if (!storedId) {
        return <Navigate to="/workspace" replace />;
    }

    // Strip the /dashboard prefix
    const raw = location.pathname.replace(/^\/dashboard\/?/, "");

    // /dashboard → /business/:id/overview
    if (!raw) {
        return <Navigate to={`/business/${storedId}/overview`} replace />;
    }

    const [first, ...rest] = raw.split("/");
    const mapped = PATH_MAP[first] ?? first;
    const newPath =
        rest.length > 0
            ? `/business/${storedId}/${mapped}/${rest.join("/")}`
            : `/business/${storedId}/${mapped}`;

    return <Navigate to={newPath} replace />;
}
