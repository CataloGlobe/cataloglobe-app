// Il menù disegnato nel telefono del tunnel: due piatti per sezione, coi colori dello stile.
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { euro } from "./creaModel";
import s from "./Crea.module.scss";

export type SampleSection = { name: string; dishes: { name: string; price: number | null }[] };
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const price = (p: number | null) => (p == null ? "" : euro(p));

export function DishRow({ name, p, tk }: { name: string; p: number | null; tk: StyleTokenModel }) {
    const card = tk.card.productStyle === "card", photo = card && tk.card.image.mode === "show";
    return (
        <div className={cx(s.pDish, card && photo && s.card, !card && s.compact)}>
            {photo && <span className={s.ph} />}
            <span className={s.dn}>{name}</span>
            <span className={s.pr}>{price(p)}</span>
        </div>
    );
}

export function MenuSample({ sample, tk, hl }: { sample: SampleSection[]; tk: StyleTokenModel; hl?: boolean }) {
    if (!sample.length) return <div className={s.pEmpty}>I piatti del menù</div>;
    return (
        <div className={cx(s.pSec, hl && s.hl)}>
            {sample.map(sec => (
                <div key={sec.name} className={s.pSec}>
                    <div className={s.pH}>{sec.name}</div>
                    {sec.dishes.map(d => (
                        <DishRow key={d.name} name={d.name} p={d.price} tk={tk} />
                    ))}
                </div>
            ))}
        </div>
    );
}
