import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { PublicMenu } from "@/types/resolvedCollections";
import { markOwnBack } from "./menuPassage";
import { defaultMenu, findMenu, shouldChoose } from "./menuList";

/** Il menu scelto sta in `?menu=<slug>` (spec §12, v38): stesso indirizzo, nessun caricamento. */
export const MENU_PARAM = "menu";

export type MenuChoice = {
    /** La pagina «Scegli il menu» è a vista. */
    choosing: boolean;
    /** Il menu da rendere sotto (o dopo) la scelta; undefined senza elenco dei menu. */
    menu: PublicMenu | undefined;
    /** Dalla scelta entra in push (indietro torna alla scelta); dal foglio dei menu sostituisce. */
    choose: (slug: string, from: "chooser" | "sheet") => void;
    /** «Tutti i menu»: torna alla scelta. */
    backToChooser: () => void;
};

/**
 * Quale menu mostrare e quando mostrare la scelta. `?menu=` si legge solo dopo il
 * primo disegno: il server non vede la query (`api/ssr-render`), quindi rende la
 * scelta, e il primo disegno del browser deve uguagliarlo. Un link diretto valido
 * salta la scelta; uno sconosciuto o di un menu di più tardi torna alla scelta.
 */
const subscribeNever = () => () => {};

export function useMenuChoice(menus: PublicMenu[] | undefined, mode: { preview: boolean }): MenuChoice {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    // Falso solo nell'idratazione (come il server); in una navigazione nel browser vale subito.
    const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

    const slug = mounted ? params.get(MENU_PARAM) : null;
    const canChoose = shouldChoose(menus, mode);
    const picked = canChoose ? findMenu(menus, slug) : undefined;

    // C'è la scelta subito dietro nella cronologia? Allora «Tutti i menu» è un passo indietro.
    const chooserBehind = useRef(false);
    useEffect(() => {
        if (!slug) chooserBehind.current = false;
    }, [slug]);

    const writeMenu = useCallback(
        (value: string | null, replace: boolean) => {
            setParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (value) next.set(MENU_PARAM, value);
                    else next.delete(MENU_PARAM);
                    return next;
                },
                // Lo stato del router porta l'avviso «tavolo in manutenzione» (PublicCollectionPage): non va perso.
                { replace, state: location.state }
            );
        },
        [setParams, location.state]
    );

    const choose = useCallback(
        (value: string, from: "chooser" | "sheet") => {
            if (from === "chooser") chooserBehind.current = true;
            writeMenu(value, from === "sheet");
        },
        [writeMenu]
    );

    const backToChooser = useCallback(() => {
        if (chooserBehind.current) {
            chooserBehind.current = false;
            markOwnBack();
            navigate(-1);
        } else {
            writeMenu(null, false);
        }
    }, [navigate, writeMenu]);

    return { choosing: canChoose && !picked, menu: picked ?? defaultMenu(menus), choose, backToChooser };
}
