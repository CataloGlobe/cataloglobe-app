// Lo stile per chi non può modificarlo (D186): le stesse sei parti e lo stesso
// telefono del tunnel, spenti. Si guarda, non si cambia.
import { useMemo } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import type { FontFamily } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { V2Style } from "@/services/supabase/styles";
import { FONTS, newTunnel } from "./creaModel";
import { tokensOf, useFonts } from "./creaStyle";
import { StileAspetto } from "./StileAspetto";
import { StilePhone } from "./StilePhone";
import s from "./StileAspetto.module.scss";

const FONT_ALL = Object.keys(FONTS) as FontFamily[];
const nothing = () => undefined;

/** Perché si guarda e basta: il permesso che manca, o l'abbonamento fermo. */
const WHY = {
    permesso: "Puoi guardare questo stile, non cambiarlo: per modificarlo serve il permesso. Chiedilo al proprietario.",
    abbonamento: "Puoi guardare questo stile, non cambiarlo: l'abbonamento non è attivo. Riattivalo dalla pagina Abbonamento per modificarlo."
} as const;

export function StileGuarda({ style, tenantId, business, menu, back, why = "permesso" }: { style: V2Style; tenantId: string; business: string; menu: string; back: () => void; why?: keyof typeof WHY }) {
    const t = useMemo(() => ({ ...newTunnel("stile", { all: true, activityIds: [], groupIds: [] }), name: style.name, look: structuredClone(tokensOf(style)) }), [style]);
    useFonts(FONT_ALL);
    return (
        <div className={s.guarda}>
            <div className={s.gtop}>
                <h2>{style.name}</h2>
                <Button variant="secondary" size="sm" onClick={back}>
                    Torna agli stili
                </Button>
            </div>
            <p className={s.gnote} role="status">
                <Lock size={15} aria-hidden />
                {WHY[why]}
            </p>
            <div className={s.ggrid}>
                <fieldset className={s.gset} disabled>
                    <StileAspetto t={t} u={nothing} tenantId={tenantId} rules={0} onPeek={nothing} readOnly />
                </fieldset>
                <aside className={s.gside} aria-label="Così lo vede il cliente">
                    <StilePhone look={t.look} business={business} menu={menu} />
                </aside>
            </div>
        </div>
    );
}
