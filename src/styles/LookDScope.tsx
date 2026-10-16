import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { lookDOn } from "./lookD";

/** Mette o toglie `data-look="d"` sulla radice a ogni cambio di pagina. */
export function LookDScope() {
    const { pathname } = useLocation();
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (lookDOn(pathname)) root.dataset.look = "d";
        else delete root.dataset.look;
    }, [pathname]);
    return null;
}
