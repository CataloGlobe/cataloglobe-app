import React from "react";
import ReactDOM from "react-dom/client";
import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
    RouterProvider
} from "react-router-dom";
import { AuthProvider } from "@context/AuthProvider";
import { NotificationsProvider } from "@context/NotificationsProvider";
import { ThemeProvider } from "@/context/Theme/ThemeProvider";
import { ToastProvider } from "@/context/Toast/ToastProvider";
import { TooltipProvider } from "@/context/Tooltip/TooltipProvider";
import App from "./App";
import MotionProvider from "@/components/motion/MotionProvider";
import { LOOK_D } from "@styles/lookD";
import { installStaleChunkReload } from "@/utils/reloadOnStaleChunk";
import "@styles/global.scss";
import "@styles/kinds.scss";
import "./i18n";

// Dopo un deploy i pezzi della versione di prima spariscono: si ricarica la pagina.
installStaleChunkReload();

// Grafica nuova del back office (direzione D) dietro l'interruttore: la radice
// porta `data-look="d"` prima del primo render, così non c'è un lampo dello stile vecchio.
if (LOOK_D) document.documentElement.dataset.look = "d";

// Data router (createBrowserRouter) al posto di <BrowserRouter>: serve a
// `useBlocker` (guardia "modifiche non salvate" sulla navigazione interna).
// L'albero delle route resta in App.tsx come <Routes> discendente sotto un'unica
// route splat: nessun loader, nessuna action. I provider che stavano dentro
// <BrowserRouter> restano dentro il router (elemento della route), nello
// stesso ordine di prima.
const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path="*"
            element={
                <AuthProvider>
                    <ToastProvider>
                        <NotificationsProvider>
                            <App />
                        </NotificationsProvider>
                    </ToastProvider>
                </AuthProvider>
            }
        />
    )
);

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <TooltipProvider>
                <MotionProvider>
                    <RouterProvider router={router} />
                </MotionProvider>
            </TooltipProvider>
        </ThemeProvider>
    </React.StrictMode>
);
