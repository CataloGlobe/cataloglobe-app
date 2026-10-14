// Da «E adesso?» (D194): sedi e orari arrivano da ciò che hai appena creato.
// Prima di andare avanti si confermano, o si cambiano.
import { CircleCheck, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { perText, whereText, type DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { durLabel, q } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { effWhen, type Tunnel } from "./creaModel";
import type { U } from "./CreaSteps";
import s from "./Crea.module.scss";

export function InhBox({ t, u, k, L }: { t: Tunnel; u: U; k: "dove" | "quando"; L: DraftLookups }) {
    if (!t.from) return null;
    const dove = k === "dove", v = dove ? t.inhD : t.inhQ, n = q(t.from.name);
    const set = (x: "si" | "cambio") => u(d => void (dove ? (d.inhD = x) : (d.inhQ = x)));
    const sum = dove ? whereText(t.where, L) : t.per ? perText(t.per, L) : durLabel(effWhen(t));
    const title = dove ? `Stesse sedi di ${n}` : `Stessi orari di ${n}`;
    if (v === "cambio")
        return (
            <p className={s.hint}>
                <Link2 size={13} aria-hidden style={{ verticalAlign: -2 }} /> {dove ? "Partono dalle sedi" : "Partono dagli orari"} di {n}: cambia quello che serve.
            </p>
        );
    if (v === "si")
        return (
            <div className={`${s.inhq} ${s.ok}`}>
                <CircleCheck size={18} aria-hidden />
                <div className={s.ih}>
                    <b>{title}</b>
                    <span>{sum}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => set("cambio")}>
                    Cambia
                </Button>
            </div>
        );
    return (
        <div className={s.inhq} role="group" aria-label={title} data-bad={dove ? "inhd" : "inhq"}>
            <div className={s.ih}>
                <Link2 size={16} aria-hidden />
                <div>
                    <b>{title}?</b>
                    <span>{sum}</span>
                    <span className={s.ihw}>{dove ? "Le hai appena scelte" : "Li hai appena scelti"} per {n}.</span>
                </div>
            </div>
            <div className={s.ib}>
                <Button size="sm" variant="primary" onClick={() => set("si")}>
                    {dove ? "Sì, le stesse" : "Sì, gli stessi"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => set("cambio")}>
                    {dove ? "Cambio sedi" : "Cambio orari"}
                </Button>
            </div>
        </div>
    );
}
