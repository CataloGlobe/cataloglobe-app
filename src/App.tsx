import { Navigate, Routes, Route, useNavigate } from "react-router-dom";
import ScrollToTop from "@/components/ScrollToTop/ScrollToTop";
import { lazy, Suspense, useEffect } from "react";
import { supabase } from "@/services/supabase/client";
import MainLayout from "@layouts/MainLayout/MainLayout";
import WorkspaceLayout from "@layouts/WorkspaceLayout/WorkspaceLayout";
import { ProtectedRoute } from "@/components/Routes/ProtectedRoute";
import { GuestRoute } from "./components/Routes/GuestRoute";
import { OtpRoute } from "./components/Routes/OtpRoute";
import { RecoveryRoute } from "./components/Routes/RecoveryRoute";
import { TenantProvider } from "@context/TenantProvider";
import { DashboardRedirect } from "./components/Routes/DashboardRedirect";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";

// Auth pages — eager (percorso critico per utenti non autenticati)
import Login from "./pages/Auth/Login";
import VerifyOtp from "./pages/Auth/VerifyOtp";
import SignUp from "./pages/Auth/SignUp";
import CheckEmail from "./pages/Auth/CheckEmail";
import EmailConfirmed from "./pages/Auth/EmailConfirmed";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

// Public pages — eager (entry point visitatori anonimi)
import PublicCollectionPage from "./pages/PublicCollectionPage/PublicCollectionPage";
import Home from "./pages/Home/Home";
import NotFound from "./pages/NotFound/NotFound";
import InvitePage from "./pages/Invite/InvitePage";
import PrivacyPolicyPage from "./pages/Legal/PrivacyPolicyPage";
import TermsPage from "./pages/Legal/TermsPage";

// Workspace — lazy (solo utenti autenticati)
const WorkspacePage = lazy(() => import("./pages/Workspace/WorkspacePage"));
const BillingPage = lazy(() => import("./pages/Workspace/BillingPage"));
const WorkspaceSettingsPage = lazy(() => import("./pages/Workspace/WorkspaceSettingsPage"));

// Onboarding — lazy
const CreateBusiness = lazy(() => import("./pages/Onboarding/CreateBusiness"));
const ActivateTrial = lazy(() => import("./pages/Onboarding/ActivateTrial"));

// Business pages — lazy (solo utenti autenticati con tenant selezionato)
const Overview = lazy(() => import("@/pages/Business/OverviewPage"));
const Businesses = lazy(() => import("./pages/Dashboard/Businesses/Businesses"));
const Catalogs = lazy(() => import("./pages/Dashboard/Catalogs/Catalogs"));
const CatalogEngine = lazy(() => import("./pages/Dashboard/Catalogs/CatalogEngine"));
const Reviews = lazy(() => import("@pages/Dashboard/Reviews/Reviews"));
const AnalyticsPage = lazy(() => import("@pages/Dashboard/Analytics/AnalyticsPage"));
const BusinessSettingsPage = lazy(() => import("./pages/Business/BusinessSettingsPage"));
const BusinessTeamPage = lazy(() => import("./pages/Business/TeamPage"));
const Programming = lazy(() => import("./pages/Dashboard/Programming/Programming"));
const ProgrammingRuleDetail = lazy(() => import("./pages/Dashboard/Programming/ProgrammingRuleDetail"));
const FeaturedRuleDetail = lazy(() => import("./pages/Dashboard/Programming/FeaturedRuleDetail"));
const Products = lazy(() => import("./pages/Dashboard/Products/Products"));
const ProductPage = lazy(() => import("./pages/Dashboard/Products/ProductPage"));
const Highlights = lazy(() => import("./pages/Dashboard/Highlights/Highlights"));
const FeaturedContentDetailPage = lazy(() => import("./pages/Dashboard/Highlights/FeaturedContentDetailPage"));
const Styles = lazy(() => import("./pages/Dashboard/Styles/Styles"));
const StyleEditorPage = lazy(() => import("./pages/Dashboard/Styles/StyleEditorPage"));
const Attributes = lazy(() => import("./pages/Dashboard/Attributes/Attributes"));
const ActivityDetailPage = lazy(() => import("./pages/Operativita/Attivita/ActivityDetailPage"));
const SubscriptionPage = lazy(() => import("./pages/Business/SubscriptionPage"));

export default function App() {
    const navigate = useNavigate();

    useEffect(() => {
        if (!window.location.hash) return;

        if (window.location.pathname === "/email-confirmed") {
            return;
        }

        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const type = params.get("type");

        if (accessToken && type === "signup") {
            supabase.auth.getSession().finally(() => navigate("/login", { replace: true }));
        }
    }, [navigate]);

    return (
        <>
        <ScrollToTop />
        <Suspense fallback={<AppLoader intent="dashboard" />}>
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />

            {/* Auth routes */}
            <Route
                path="/login"
                element={
                    <GuestRoute>
                        <Login />
                    </GuestRoute>
                }
            />
            <Route
                path="/verify-otp"
                element={
                    <OtpRoute>
                        <VerifyOtp />
                    </OtpRoute>
                }
            />
            <Route
                path="/sign-up"
                element={
                    <GuestRoute>
                        <SignUp />
                    </GuestRoute>
                }
            />
            <Route
                path="/check-email"
                element={
                    <GuestRoute>
                        <CheckEmail />
                    </GuestRoute>
                }
            />
            <Route path="/email-confirmed" element={<EmailConfirmed />} />
            <Route
                path="/forgot-password"
                element={
                    <GuestRoute>
                        <ForgotPassword />
                    </GuestRoute>
                }
            />
            <Route
                path="/reset-password"
                element={
                    <RecoveryRoute>
                        <ResetPassword />
                    </RecoveryRoute>
                }
            />

            {/* Workspace area */}
            <Route
                path="/workspace"
                element={
                    <ProtectedRoute>
                        <WorkspaceLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<WorkspacePage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<WorkspaceSettingsPage />} />
            </Route>

            {/* Onboarding (no tenant required) */}
            <Route
                path="/onboarding/create-business"
                element={
                    <ProtectedRoute>
                        <CreateBusiness />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/onboarding/activate-trial"
                element={
                    <ProtectedRoute>
                        <ActivateTrial />
                    </ProtectedRoute>
                }
            />
            <Route path="/select-business" element={<Navigate to="/workspace" replace />} />

            {/* Business-level area */}
            <Route
                path="/business/:businessId"
                element={
                    <ProtectedRoute>
                        <TenantProvider>
                            <MainLayout />
                        </TenantProvider>
                    </ProtectedRoute>
                }
            >
                {/* Default: redirect /business/:id → /business/:id/overview */}
                <Route index element={<Navigate to="overview" replace />} />

                <Route path="overview" element={<Overview />} />

                <Route path="locations" element={<Businesses />} />
                <Route path="locations/:activityId" element={<ActivityDetailPage />} />

                <Route path="scheduling" element={<Programming />} />
                <Route path="scheduling/:ruleId" element={<ProgrammingRuleDetail />} />
                <Route path="scheduling/featured/:ruleId" element={<FeaturedRuleDetail />} />

                <Route path="catalogs" element={<Catalogs />} />
                <Route path="catalogs/:id" element={<CatalogEngine />} />

                <Route path="products" element={<Products />} />
                <Route path="products/:productId" element={<ProductPage />} />

                <Route path="featured">
                    <Route index element={<Highlights />} />
                    <Route path=":featuredId" element={<FeaturedContentDetailPage />} />
                </Route>

                <Route path="styles">
                    <Route index element={<Styles />} />
                    <Route path=":styleId" element={<StyleEditorPage />} />
                </Route>

                <Route path="attributes" element={<Attributes />} />

                <Route path="reviews" element={<Reviews />} />
                <Route path="analytics" element={<AnalyticsPage />} />

                <Route path="team" element={<BusinessTeamPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
                <Route path="settings" element={<BusinessSettingsPage />} />
            </Route>

            {/* Legacy backward-compatibility redirects */}
            <Route path="/dashboard">
                <Route index element={<DashboardRedirect />} />
                <Route path="*" element={<DashboardRedirect />} />
            </Route>

            {/* Invite */}
            <Route path="/invite/:token" element={<InvitePage />} />

            {/* Legal pages */}
            <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/legal/termini" element={<TermsPage />} />

            {/* PUBLIC BUSINESS */}
            <Route path="/:slug" element={<PublicCollectionPage />} />

            {/* Global 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </>
    );
}
