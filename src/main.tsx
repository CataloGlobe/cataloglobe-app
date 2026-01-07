import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@context/AuthProvider";
import { ThemeProvider } from "@/context/Theme/ThemeProvider";
import { ToastProvider } from "@/context/Toast/ToastProvider";
import App from "./App";
import "@styles/global.scss";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <BrowserRouter>
                <AuthProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </AuthProvider>
            </BrowserRouter>
        </ThemeProvider>
    </React.StrictMode>
);
