// Il telefono de «L'aspetto» dello stile (D186, 1A): la pagina vera del cliente,
// la stessa dell'editor dello stile, con l'aspetto che si sta scegliendo.
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { StylePreview } from "@/pages/Dashboard/Styles/Editor/StylePreview";
import { cleanLook } from "./stileLook";
import s from "./StileAspetto.module.scss";

export function StilePhone({ look, business, menu }: { look: StyleTokenModel; business: string; menu: string }) {
    return (
        <div className={s.phone}>
            <StylePreview model={cleanLook(look)} viewMode="mobile" businessName={business || "Il tuo locale"} catalogName={menu || "Il tuo menù"} />
        </div>
    );
}
