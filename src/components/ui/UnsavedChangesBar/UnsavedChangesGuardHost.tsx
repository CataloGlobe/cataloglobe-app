import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
import { useHasUnsavedChanges } from "./useUnsavedChangesGuard";

/**
 * Host unico della guardia (vedi `useUnsavedChangesGuard`). Va montato una
 * volta dentro il layout, sotto il RouterProvider: intercetta la navigazione
 * interna con `useBlocker` e mostra il dialogo «Resta» / «Esci senza salvare»;
 * per refresh e chiusura tab usa il prompt nativo di `beforeunload`.
 */
export function UnsavedChangesGuardHost() {
    const hasUnsavedChanges = useHasUnsavedChanges();

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Alcuni browser richiedono returnValue impostato per mostrare il prompt.
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasUnsavedChanges]);

    // Se le modifiche vengono salvate/annullate mentre il dialogo è aperto,
    // il blocco non ha più motivo di esistere.
    useEffect(() => {
        if (blocker.state === "blocked" && !hasUnsavedChanges) blocker.reset();
    }, [blocker, hasUnsavedChanges]);

    return (
        <UnsavedChangesDialog
            isOpen={blocker.state === "blocked"}
            cancelLabel="Resta"
            message="Hai modifiche non salvate. Se esci ora, andranno perse."
            onCancel={() => {
                if (blocker.state === "blocked") blocker.reset();
            }}
            onDiscard={() => {
                if (blocker.state === "blocked") blocker.proceed();
            }}
        />
    );
}

export default UnsavedChangesGuardHost;
