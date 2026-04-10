import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@context/AuthProvider";
import { NotificationsProvider } from "@context/NotificationsProvider";
import { ThemeProvider } from "@/context/Theme/ThemeProvider";
import { ToastProvider } from "@/context/Toast/ToastProvider";
import { TooltipProvider } from "@/context/Tooltip/TooltipProvider";
import App from "./App";
import "@styles/global.scss";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <TooltipProvider>
                <BrowserRouter>
                    <AuthProvider>
                        <ToastProvider>
                            <NotificationsProvider>
                                <App />
                            </NotificationsProvider>
                        </ToastProvider>
                    </AuthProvider>
                </BrowserRouter>
            </TooltipProvider>
        </ThemeProvider>
    </React.StrictMode>
);
