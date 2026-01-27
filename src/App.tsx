import { Routes, Route } from "react-router-dom";
import MainLayout from "@layouts/MainLayout/MainLayout";
import { ProtectedRoute } from "@components/ProtectedRoute";

// Auth pages
import Login from "./pages/Auth/Login";
import VerifyOtp from "./pages/Auth/VerifyOtp";
import SignUp from "./pages/Auth/SignUp";
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
            <Route path="/login" element={<Login />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />

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
            </Route>

            {/* PUBLIC BUSINESS */}
            <Route path="/:slug" element={<PublicCollectionPage />} />

            {/* Global 404 → dashboard */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
