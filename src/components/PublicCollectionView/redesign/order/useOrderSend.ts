import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OrderingContext } from "../slots";
import { useSheetState } from "../sheets/sheetStack";
import type { SendFailure } from "./orderSend";

/**
 * L'invio alla cucina, condiviso fra la pagina «Il tuo ordine» (avviso, esito)
 * e il suo piede (pulsante). Vive nel foglio: l'errore si spegne quando la
 * pagina rientra nella pila.
 */
export function useOrderSend(ordering: OrderingContext | undefined) {
    const { t } = useTranslation("public");
    const [sending, setSending] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    /** Sale a ogni invio riuscito: la pagina lo annuncia e porta il fuoco in cima. */
    const [sentCount, setSentCount] = useState(0);
    // Due tocchi nello stesso frame vedono ancora `sending` falso: il ref no.
    const inFlight = useRef(false);
    const inStack = useSheetState().pages.some(page => page.key === "order");
    const [wasInStack, setWasInStack] = useState(inStack);
    if (inStack !== wasInStack) {
        setWasInStack(inStack);
        if (inStack) setFailure(null);
    }

    const messageOf = (result: SendFailure): string => {
        switch (result.kind) {
            case "maintenance":
            case "closed":
                return result.message;
            case "session":
                return t("ordering.err_session_expired_table");
            case "items":
                return t("ordering.err_items_unavailable");
            case "empty":
                return t("ordering.err_empty_cart");
            case "other":
                return result.message ?? t("ordering.err_submit");
        }
    };

    const send = async () => {
        if (!ordering || inFlight.current) return;
        inFlight.current = true;
        setSending(true);
        setFailure(null);
        try {
            const result = await ordering.send();
            if (result) setFailure(messageOf(result));
            else setSentCount(count => count + 1);
        } finally {
            inFlight.current = false;
            setSending(false);
        }
    };

    return { sending, failure, sentCount, send };
}

export type OrderSendState = ReturnType<typeof useOrderSend>;
