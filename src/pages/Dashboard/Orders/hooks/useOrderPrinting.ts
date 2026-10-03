import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useToast } from "@/context/Toast/ToastContext";
import { listPrinters, reprintOrder, PrinterServiceError } from "@/services/supabase/printers";
import type { V2OrderWithItems } from "@/types/orders";

/**
 * La stampa di una comanda, uguale da Comande e dallo Storico.
 *
 * Con una stampante cloud Sunmi attiva la sede ristampa sulla stampante
 * (`reprintOrder`, risposta reale, non ottimistica); senza, si apre il
 * dialogo del browser sullo scontrino nascosto. La pagina rende
 * `PrintReceipt` con `printRef` quando `orderToPrint` c'è.
 *
 * `hasPrinters`: `null` finché la lettura non torna, così «nessuna
 * stampante» non lampeggia prima della risposta.
 */
export function useOrderPrinting(tenantId: string | null | undefined, activityId: string | null | undefined) {
    const { showToast } = useToast();
    const [hasPrinters, setHasPrinters] = useState<boolean | null>(null);
    const [orderToPrint, setOrderToPrint] = useState<V2OrderWithItems | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    const loadPrinters = useCallback(async () => {
        if (!tenantId || !activityId) {
            setHasPrinters(null);
            return;
        }
        setHasPrinters(null);
        try {
            const data = await listPrinters(tenantId, activityId);
            setHasPrinters(data.some(p => p.is_active));
        } catch {
            /* silent: resta null, senza risposta non si afferma "nessuna stampante". */
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        void loadPrinters();
    }, [loadPrinters]);

    // La stampante spenta NON è un errore: Sunmi accetta il lavoro e lo
    // consegna alla riaccensione.
    const handleReprint = useCallback(
        async (order: V2OrderWithItems) => {
            if (!tenantId) return;
            try {
                const res = await reprintOrder(order.id, tenantId);
                if (res.printed === 0) {
                    showToast({ message: "Ristampa non riuscita su nessuna stampante. Riprova tra poco.", type: "error" });
                } else if (res.failed > 0) {
                    showToast({
                        message: `Ristampa inviata a ${res.printed} di ${res.total} stampanti. Se una stampante è spenta, la comanda uscirà alla riaccensione.`,
                        type: "info"
                    });
                } else {
                    showToast({
                        message: "Ristampa inviata. Se la stampante è spenta, la comanda uscirà alla riaccensione.",
                        type: "success"
                    });
                }
            } catch (err) {
                showToast({
                    message: err instanceof PrinterServiceError ? err.message : "Errore durante la ristampa.",
                    type: "error"
                });
            }
        },
        [tenantId, showToast]
    );

    const handlePrint = useCallback(
        (order: V2OrderWithItems) => {
            if (hasPrinters === true) {
                void handleReprint(order);
                return;
            }
            // flushSync: lo scontrino è nel DOM prima di window.print().
            flushSync(() => setOrderToPrint(order));
            if (printRef.current) {
                printRef.current.setAttribute("data-printing", "true");
                window.print();
                printRef.current.removeAttribute("data-printing");
            }
            setOrderToPrint(null);
        },
        [hasPrinters, handleReprint]
    );

    return { hasPrinters, orderToPrint, printRef, handlePrint, handleReprint };
}
