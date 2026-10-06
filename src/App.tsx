import { Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import ScrollToTop from "@/components/ScrollToTop/ScrollToTop";
import { PromoCaptureRoot } from "@/components/PromoCaptureRoot/PromoCaptureRoot";
import { lazy, Suspense, useEffect } from "react";
import { supabase } from "@/services/supabase/client";
import MainLayout from "@layouts/MainLayout/MainLayout";
import WorkspaceLayout from "@layouts/WorkspaceLayout/WorkspaceLayout";
import AdminLayout from "@layouts/AdminLayout/AdminLayout";
import { ProtectedRoute } from "@/components/Routes/ProtectedRoute";
import { GuestRoute } from "./components/Routes/GuestRoute";
import { OtpRoute } from "./components/Routes/OtpRoute";
import { RecoveryRoute } from "./components/Routes/RecoveryRoute";
import { AdminRoute } from "./components/Routes/AdminRoute";
import { TenantProvider } from "@context/TenantProvider";
import { PermissionsProvider } from "@context/PermissionsContext";
import { DashboardRedirect } from "./components/Routes/DashboardRedirect";
import { BusinessPathRedirect } from "./components/Routes/BusinessPathRedirect";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { publicRoutes } from "@/routes/publicRoutes";

// Auth pages — eager (percorso critico per utenti non autenticati)
import Login from "./pages/Auth/Login";
import VerifyOtp from "./pages/Auth/VerifyOtp";
import SignUp from "./pages/Auth/SignUp";
import CheckEmail from "./pages/Auth/CheckEmail";
import EmailConfirmed from "./pages/Auth/EmailConfirmed";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

// Public pages — eager (entry point visitatori anonimi, evita round-trip extra del lazy chunk)
import TableEntryPage from "./pages/TableEntryPage/TableEntryPage";
import LandingFallback from "@pages/CampaignLanding/LandingFallback";
import { loadCampaignLanding, preloadCampaignLandingIfLanding } from "@pages/CampaignLanding/preload";
import NotFound from "./pages/NotFound/NotFound";
import InvitePage from "./pages/Invite/InvitePage";
import PrivacyPolicyPage from "./pages/Legal/PrivacyPolicyPage";
import TermsPage from "./pages/Legal/TermsPage";
import StatusPage from "./pages/Status/StatusPage";

// Admin (lazy: solo Lorenzo lo carica)
const StatusIncidentsAdminPage = lazy(
    () => import("./pages/Admin/StatusIncidents/StatusIncidentsPage")
);
const SupportQueuePage = lazy(() => import("./pages/Admin/Support/SupportQueuePage"));
const SupportTicketAdminPage = lazy(
    () => import("./pages/Admin/Support/SupportTicketAdminPage")
);
const CrmLeadsPage = lazy(() => import("./pages/Admin/Crm/LeadsPage"));
const CrmLeadDetailPage = lazy(() => import("./pages/Admin/Crm/LeadDetailPage"));
const CrmAgentsPage = lazy(() => import("./pages/Admin/Crm/AgentsPage"));
const CrmHomePage = lazy(() => import("./pages/Admin/Crm/HomePage"));
const CrmMorePage = lazy(() => import("./pages/Admin/Crm/MorePage"));
const CrmCostsPage = lazy(() => import("./pages/Admin/Costs/CostsPage"));
const CrmAgendaPage = lazy(() => import("./pages/Admin/Crm/AgendaPage"));
const CrmClientsPage = lazy(() => import("./pages/Admin/Crm/ClientsPage"));

// Workspace — lazy (solo utenti autenticati)
const WorkspacePage = lazy(() => import("./pages/Workspace/WorkspacePage"));
const BillingPage = lazy(() => import("./pages/Workspace/BillingPage"));
const WorkspaceSettingsPage = lazy(() => import("./pages/Workspace/WorkspaceSettingsPage"));

// Onboarding — lazy
const CreateBusiness = lazy(() => import("./pages/Onboarding/CreateBusiness"));

// Setup guidato — lazy (percorso a schermo pieno, fuori da MainLayout)
const SetupWizardPage = lazy(() => import("./pages/Setup/SetupWizardPage"));

// Business pages — lazy (solo utenti autenticati con tenant selezionato)
const Overview = lazy(() => import("@/pages/Business/OverviewPage"));
const Businesses = lazy(() => import("./pages/Dashboard/Businesses/Businesses"));
const Orders = lazy(() => import("./pages/Dashboard/Orders/Orders"));
const OrdersHistory = lazy(() => import("./pages/Dashboard/Orders/OrdersHistory"));
const Servizio = lazy(() => import("./pages/Dashboard/Servizio/Servizio"));
const Reservations = lazy(() => import("./pages/Dashboard/Reservations/Reservations"));
const Guests = lazy(() => import("./pages/Dashboard/Guests/Guests"));
const Catalogs = lazy(() => import("./pages/Dashboard/Catalogs/Catalogs"));
const CatalogEngine = lazy(() => import("./pages/Dashboard/Catalogs/CatalogEngine"));
const Reviews = lazy(() => import("@pages/Dashboard/Reviews/Reviews"));
const AnalyticsPage = lazy(() => import("@pages/Dashboard/Analytics/AnalyticsPage"));
const BusinessSettingsPage = lazy(() => import("./pages/Business/BusinessSettingsPage"));
const SettingsLanguages = lazy(() => import("./pages/Business/SettingsLanguages"));
const BusinessTeamPage = lazy(() => import("./pages/Business/TeamPage"));
const Programming = lazy(() => import("./pages/Dashboard/Programming/Programming"));
const RuleDetailPage = lazy(() => import("./pages/Dashboard/Programming/RuleDetailPage"));
const Products = lazy(() => import("./pages/Dashboard/Products/Products"));
const ProductPage = lazy(() => import("./pages/Dashboard/Products/ProductPage"));
const Highlights = lazy(() => import("./pages/Dashboard/Highlights/Highlights"));
const FeaturedContentDetailPage = lazy(() => import("./pages/Dashboard/Highlights/FeaturedContentDetailPage"));
const Stories = lazy(() => import("./pages/Dashboard/Stories/Stories"));
const StoryDetailPage = lazy(() => import("./pages/Dashboard/Stories/StoryDetailPage"));
const Support = lazy(() => import("./pages/Dashboard/Support/Support"));
const SupportTicketPage = lazy(() => import("./pages/Dashboard/Support/SupportTicketPage"));
const Styles = lazy(() => import("./pages/Dashboard/Styles/Styles"));
const StyleEditorPage = lazy(() => import("./pages/Dashboard/Styles/StyleEditorPage"));
const ActivityDetailPage = lazy(() => import("./pages/Operativita/Attivita/ActivityDetailPage"));
const ActivityAnagraficaRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivityAnagraficaRoute"));
const ActivityOrariRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivityOrariRoute"));
const ActivityOrdiniPrenotazioniRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivityOrdiniPrenotazioniRoute"));
const ActivitySectionRedirect = lazy(() => import("./pages/Operativita/Attivita/routes/ActivitySectionRedirect"));
const ActivitySalaRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivitySalaRoute"));
const OrdiniPrenotazioniRedirect = lazy(() => import("./pages/Operativita/Attivita/routes/OrdiniPrenotazioniRedirect"));
const SedeRedirect = lazy(() => import("./components/layout/SedeRedirect/SedeRedirect"));
const BusinessHomeRedirect = lazy(() => import("./components/layout/LandingRedirect/BusinessHomeRedirect"));
const SedeHomeRedirect = lazy(() => import("./components/layout/LandingRedirect/SedeHomeRedirect"));
const SingleSedeRoute = lazy(() => import("./components/layout/LandingRedirect/SingleSedeRoute"));
const ActivityPubblicazioneRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivityPubblicazioneRoute"));
const ActivityCosaVedonoRoute = lazy(() => import("./pages/Operativita/Attivita/routes/ActivityCosaVedonoRoute"));
const SubscriptionPage = lazy(() => import("./pages/Business/SubscriptionPage"));

// Landing di campagna su / (variante form) e /b (variante signup, noindex).
// In produzione / e /b sono serviti da dist/index.html e dist/b.html,
// prerenderizzati al build e idratati da src/entry-landing.tsx
// (scripts/prerender-landing.mjs, vercel.json): queste route restano per il dev server
// e come rete di sicurezza. /landing-dev e /landing-dev/b fanno 301 in
// vercel.json; qui restano come redirect per la navigazione interna. Chunk e
// font partono al caricamento del modulo, prima che React monti la route.
preloadCampaignLandingIfLanding();
const CampaignLandingPage = lazy(loadCampaignLanding);

// Galleria dei componenti — solo sviluppo. Il ternario su import.meta.env.DEV
// è statico al build: in produzione l'import() sparisce e il chunk non esiste.
const DevUiPage = import.meta.env.DEV ? lazy(() => import("./dev/ui/DevUiPage")) : null;

export default function App() {
    const navigate = useNavigate();
    const { search } = useLocation();

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
        <PromoCaptureRoot />
        <ScrollToTop />
        <Suspense fallback={<AppLoader intent="dashboard" />}>
        <Routes>
            {/* Public routes */}
            {/* Suspense proprio: il fallback globale parla di «dashboard» */}
            <Route
                path="/"
                element={
                    <Suspense fallback={<LandingFallback />}>
                        <CampaignLandingPage variante="form" />
                    </Suspense>
                }
            />
            <Route
                path="/b"
                element={
                    <Suspense fallback={<LandingFallback />}>
                        <CampaignLandingPage variante="signup" />
                    </Suspense>
                }
            />

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
            <Route path="/select-business" element={<Navigate to="/workspace" replace />} />

            {/* Setup guidato — stessi provider dell'area business, senza MainLayout:
                percorso a schermo pieno, niente sidebar né AppHeader. */}
            <Route
                path="/business/:businessId/setup"
                element={
                    <ProtectedRoute>
                        <TenantProvider>
                            <PermissionsProvider>
                                <SetupWizardPage />
                            </PermissionsProvider>
                        </TenantProvider>
                    </ProtectedRoute>
                }
            />

            {/* Business-level area */}
            <Route
                path="/business/:businessId"
                element={
                    <ProtectedRoute>
                        <TenantProvider>
                            <PermissionsProvider>
                                <MainLayout />
                            </PermissionsProvider>
                        </TenantProvider>
                    </ProtectedRoute>
                }
            >
                {/* L'ingresso nell'azienda (§51.6): chi configura la
                    Panoramica, staff e viewer la loro sede o Sedi. */}
                <Route index element={<BusinessHomeRedirect />} />

                <Route path="overview" element={<Overview />} />

                {/* Con una sede sola non c'è la pagina Sedi (§51.3). */}
                <Route
                    path="locations"
                    element={
                        <SingleSedeRoute segment="anagrafica">
                            <Businesses />
                        </SingleSedeRoute>
                    }
                />
                <Route path="locations/:activityId">
                    {/* Entrando nella sede (§51.6): la Scheda per chi la
                        gestisce, Operatività per gli altri; i vecchi `?tab=`
                        portano alla loro sezione. */}
                    <Route index element={<SedeHomeRedirect />} />
                    {/* Le voci della sede che non sono la scheda: montate
                        dentro il contesto, con la sede presa dal path (§46.1),
                        fuori dal parent della scheda, di cui non devono
                        ereditare testata e draft. */}
                    <Route path="servizio" element={<Servizio />} />
                    <Route path="comande" element={<Orders />} />
                    <Route path="storico" element={<OrdersHistory />} />
                    <Route path="prenotazioni" element={<Reservations />} />
                    <Route path="cosa-vedono" element={<ActivityCosaVedonoRoute />} />
                    {/* Andamento della sede (§51.10): stesse pagine d'azienda,
                        la sede dal path. */}
                    <Route path="analitiche" element={<AnalyticsPage />} />
                    <Route path="recensioni" element={<Reviews />} />
                    {/* Il vecchio nome (Disponibilità, §50.14): link e preferiti restano buoni. */}
                    <Route path="disponibilita" element={<ActivitySectionRedirect to="cosa-vedono" keepHash keepSearch />} />
                    {/* La scheda della sede: quattro pagine (§31). */}
                    <Route element={<ActivityDetailPage />}>
                        <Route path="anagrafica" element={<ActivityAnagraficaRoute />} />
                        <Route path="orari" element={<ActivityOrariRoute />} />
                        {/* Correzioni UI T5: una cosa per tab (O1) e la Sala dalla
                            Scheda (SV3, era il modo «Gestisci la sala» di Servizio). */}
                        <Route path="ordini-al-tavolo" element={<ActivityOrdiniPrenotazioniRoute part="ordini" />} />
                        <Route path="prenotazioni-online" element={<ActivityOrdiniPrenotazioniRoute part="prenotazioni" />} />
                        <Route path="sala" element={<ActivitySalaRoute />} />
                        {/* La vecchia tab unica: l'ancora dice quale delle due. */}
                        <Route path="ordini-prenotazioni" element={<OrdiniPrenotazioniRedirect />} />
                        <Route path="canali" element={<OrdiniPrenotazioniRedirect />} />
                        <Route path="pubblicazione" element={<ActivityPubblicazioneRoute />} />
                        {/* Un segmento sconosciuto sotto la sede apre l'Anagrafica:
                            un link vecchio o storto resta dentro la scheda invece di
                            finire sulla pagina "non trovata" di tutto il sito. */}
                        <Route path="*" element={<ActivitySectionRedirect to="anagrafica" />} />
                    </Route>
                </Route>

                {/* Le comande sono di una sede: il vecchio indirizzo d'azienda
                    porta dentro il contesto (§46.1). */}
                <Route path="orders" element={<SedeRedirect routeKey="orders" segment="comande" />} />
                <Route path="reservations" element={<SedeRedirect routeKey="reservations" segment="prenotazioni" />} />
                <Route path="guests" element={<Guests />} />

                <Route path="scheduling" element={<Programming />} />
                <Route path="scheduling/:ruleId" element={<RuleDetailPage />} />
                <Route path="scheduling/featured/:ruleId" element={<RuleDetailPage />} />

                <Route path="catalogs" element={<Catalogs />} />
                <Route path="catalogs/:id" element={<CatalogEngine />} />

                <Route path="products" element={<Products />} />
                <Route path="products/:productId" element={<ProductPage />} />

                <Route path="featured">
                    <Route index element={<Highlights />} />
                    <Route path=":featuredId" element={<FeaturedContentDetailPage />} />
                </Route>

                <Route path="stories">
                    <Route index element={<Stories />} />
                    <Route path=":storyId" element={<StoryDetailPage />} />
                </Route>

                <Route path="styles">
                    <Route index element={<Styles />} />
                    <Route path=":styleId" element={<StyleEditorPage />} />
                </Route>

                <Route path="languages" element={<SettingsLanguages />} />

                <Route path="attributes" element={<Navigate to="../products?tab=attributes" replace />} />

                <Route path="support">
                    <Route index element={<Support />} />
                    <Route path=":ticketId" element={<SupportTicketPage />} />
                </Route>

                {/* Il totale delle sedi leggibili; con una sede la rotta di sede (§51.14). */}
                <Route
                    path="reviews"
                    element={
                        <SingleSedeRoute segment="recensioni">
                            <Reviews />
                        </SingleSedeRoute>
                    }
                />
                <Route
                    path="analytics"
                    element={
                        <SingleSedeRoute segment="analitiche">
                            <AnalyticsPage />
                        </SingleSedeRoute>
                    }
                />

                {/* Impostazioni: Azienda · Team · Abbonamento (§51.12). I
                    vecchi indirizzi portano alle tab, con query e ancora
                    (ritorni da Stripe, link nelle email). */}
                <Route path="settings" element={<BusinessSettingsPage />} />
                <Route path="settings/team" element={<BusinessTeamPage />} />
                <Route path="settings/abbonamento" element={<SubscriptionPage />} />
                <Route path="team" element={<BusinessPathRedirect to="settings/team" />} />
                <Route path="subscription" element={<BusinessPathRedirect to="settings/abbonamento" />} />
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

            {/* Status page pubblica — DEVE stare prima del catch-all /:slug */}
            <Route path="/status" element={<StatusPage />} />

            {/* Vecchi indirizzi della landing (301 in vercel.json), prima del catch-all /:slug */}
            <Route path="/landing-dev" element={<Navigate to={{ pathname: "/", search }} replace />} />
            <Route path="/landing-dev/b" element={<Navigate to={{ pathname: "/b", search }} replace />} />

            {/* Admin (cross-tenant) — gate via platform_admins / is_platform_admin() */}
            <Route
                path="/admin"
                element={
                    <AdminRoute>
                        <AdminLayout />
                    </AdminRoute>
                }
            >
                <Route index element={<CrmHomePage />} />
                <Route path="status-incidents" element={<StatusIncidentsAdminPage />} />
                <Route path="supporto">
                    <Route index element={<SupportQueuePage />} />
                    <Route path=":ticketId" element={<SupportTicketAdminPage />} />
                </Route>
                <Route path="lead">
                    <Route index element={<CrmLeadsPage />} />
                    <Route path=":venueId" element={<CrmLeadDetailPage />} />
                </Route>
                <Route path="agenda" element={<CrmAgendaPage />} />
                <Route path="clienti" element={<CrmClientsPage />} />
                <Route path="agenti" element={<CrmAgentsPage />} />
                <Route path="costi" element={<CrmCostsPage />} />
                <Route path="altro" element={<CrmMorePage />} />
            </Route>

            {/* Galleria UI — solo sviluppo (vedi DevUiPage sopra) */}
            {DevUiPage && <Route path="/dev/ui" element={<DevUiPage />} />}

            {/* CUSTOMER ORDERING — QR bootstrap (DEVE precedere /:slug catch-all) */}
            <Route path="/t/:qrToken" element={<TableEntryPage />} />

            {/* PUBLIC — prenotazione + catalogo. Dichiarate in
                routes/publicRoutes.tsx, condivise con entry-client.tsx (bundle
                di hydration SSR): una route pubblica nuova va aggiunta LÌ. */}
            {publicRoutes()}

            {/* Global 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </>
    );
}
