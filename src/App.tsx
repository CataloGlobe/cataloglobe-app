import { Routes, Route } from "react-router-dom";
import MainLayout from "@layouts/MainLayout/MainLayout";
import { ProtectedRoute } from "@/components/Routes/ProtectedRoute";
import { GuestRoute } from "./components/Routes/GuestRoute";
import { OtpRoute } from "./components/Routes/OtpRoute";

// Auth pages
import Login from "./pages/Auth/Login";
import VerifyOtp from "./pages/Auth/VerifyOtp";
import SignUp from "./pages/Auth/SignUp";
import CheckEmail from "./pages/Auth/CheckEmail";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import UpdatePassword from "./pages/Auth/UpdatePassword";

// Dashboard pages
import Overview from "@pages/Dashboard/Overview/Overview";
import Businesses from "./pages/Dashboard/Businesses/Businesses";
import Collections from "./pages/Dashboard/Collections/Collections";
import Reviews from "@pages/Dashboard/Reviews/Reviews";
import Analytics from "@pages/Dashboard/Analytics/Analytics";
import Settings from "@/pages/Dashboard/Settings/Settings";

// Public pages
import PublicCollectionPage from "./pages/PublicCollectionPage/PublicCollectionPage";
import Home from "./pages/Home/Home";
import NotFound from "./pages/NotFound/NotFound";

export default function App() {
    return (
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
                    <GuestRoute>
                        <ResetPassword />
                    </GuestRoute>
                }
            />

            {/* Private dashboard area */}
            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Overview />} />

                <Route path="businesses" element={<Businesses />} />

                <Route path="collections" element={<Collections />} />

                <Route path="reviews" element={<Reviews />} />

                <Route path="analytics" element={<Analytics />} />

                <Route path="settings" element={<Settings />} />

                <Route path="settings/security" element={<UpdatePassword />} />
            </Route>

            {/* PUBLIC BUSINESS */}
            <Route path="/:slug" element={<PublicCollectionPage />} />

            {/* Global 404 → dashboard */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
