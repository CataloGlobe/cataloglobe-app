import { Navigate, Routes, Route, useNavigate } from "react-router-dom";
import ScrollToTop from "@/components/ScrollToTop/ScrollToTop";
import { useEffect } from "react";
import { supabase } from "@/services/supabase/client";
import MainLayout from "@layouts/MainLayout/MainLayout";
import WorkspaceLayout from "@layouts/WorkspaceLayout/WorkspaceLayout";
import { ProtectedRoute } from "@/components/Routes/ProtectedRoute";
import { GuestRoute } from "./components/Routes/GuestRoute";
import { OtpRoute } from "./components/Routes/OtpRoute";
import { RecoveryRoute } from "./components/Routes/RecoveryRoute";
import { TenantProvider } from "@context/TenantProvider";
import { DashboardRedirect } from "./components/Routes/DashboardRedirect";

// Auth pages
import Login from "./pages/Auth/Login";
import VerifyOtp from "./pages/Auth/VerifyOtp";
import SignUp from "./pages/Auth/SignUp";
import CheckEmail from "./pages/Auth/CheckEmail";
import EmailConfirmed from "./pages/Auth/EmailConfirmed";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

// Workspace
import WorkspacePage from "./pages/Workspace/WorkspacePage";
import BillingPage from "./pages/Workspace/BillingPage";
import WorkspaceSettingsPage from "./pages/Workspace/WorkspaceSettingsPage";

// Business pages (reused from former dashboard)
import Overview from "@/pages/Business/OverviewPage";
import Businesses from "./pages/Dashboard/Businesses/Businesses";
import Catalogs from "./pages/Dashboard/Catalogs/Catalogs";
import CatalogEngine from "./pages/Dashboard/Catalogs/CatalogEngine";
import Reviews from "@pages/Dashboard/Reviews/Reviews";
import AnalyticsPage from "@pages/Dashboard/Analytics/AnalyticsPage";
import BusinessSettingsPage from "./pages/Business/BusinessSettingsPage";
import BusinessTeamPage from "./pages/Business/TeamPage";
import Programming from "./pages/Dashboard/Programming/Programming";
import ProgrammingRuleDetail from "./pages/Dashboard/Programming/ProgrammingRuleDetail";
import FeaturedRuleDetail from "./pages/Dashboard/Programming/FeaturedRuleDetail";
import Products from "./pages/Dashboard/Products/Products";
import ProductPage from "./pages/Dashboard/Products/ProductPage";
import Highlights from "./pages/Dashboard/Highlights/Highlights";
import FeaturedContentDetailPage from "./pages/Dashboard/Highlights/FeaturedContentDetailPage";
import Styles from "./pages/Dashboard/Styles/Styles";
import StyleEditorPage from "./pages/Dashboard/Styles/StyleEditorPage";
import Attributes from "./pages/Dashboard/Attributes/Attributes";
import ActivityDetailPage from "./pages/Operativita/Attivita/ActivityDetailPage";

// Onboarding pages
import CreateBusiness from "./pages/Onboarding/CreateBusiness";
import ActivateTrial from "./pages/Onboarding/ActivateTrial";

// Subscription
import SubscriptionPage from "./pages/Business/SubscriptionPage";

// Public pages
import PublicCollectionPage from "./pages/PublicCollectionPage/PublicCollectionPage";
import Home from "./pages/Home/Home";
import NotFound from "./pages/NotFound/NotFound";
import InvitePage from "./pages/Invite/InvitePage";
import PrivacyPolicyPage from "./pages/Legal/PrivacyPolicyPage";
import TermsPage from "./pages/Legal/TermsPage";

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
        </>
    );
}
