// Aggiungere un piatto a una sezione: uno che c'è già, o uno nuovo col prezzo.
import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { type PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { priceText } from "./creaModel";
import s from "./Crea.module.scss";

const parsePrice = (x: string) => {
    const n = parseFloat(x.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function DishAdder({ pick, onAdd, taken }: { pick: readonly PickProduct[]; onAdd: (d: { productId: string | null; name: string; price: number | null }) => void; taken: ReadonlySet<string> }) {
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(0);
    const nameId = useId();
    const sugg = useMemo(() => {
        const n = name.trim().toLowerCase();
        if (!n) return [];
        return pick.filter(p => !taken.has(p.id) && p.name.toLowerCase().includes(n)).slice(0, 8);
    }, [name, pick, taken]);
    const add = (p?: PickProduct) => {
        const n = name.trim();
        const exact = p ?? pick.find(x => !taken.has(x.id) && x.name.trim().toLowerCase() === n.toLowerCase());
        if (exact) onAdd({ productId: exact.id, name: exact.name, price: parsePrice(price) ?? exact.listPrice });
        else if (n) onAdd({ productId: null, name: n, price: parsePrice(price) });
        else return;
        setName("");
        setPrice("");
        setOpen(false);
        setSel(0);
    };
    return (
        <div className={s.addrow}>
            <input
                className={cx(s.in, s.sm)}
                id={nameId}
                placeholder="Nome del piatto"
                autoComplete="off"
                aria-label="Nome del piatto"
                role="combobox"
                aria-expanded={open && sugg.length > 0}
                value={name}
                onChange={e => {
                    setName(e.target.value);
                    setOpen(true);
                    setSel(0);
                }}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onKeyDown={e => {
                    if (e.key === "ArrowDown" && sugg.length) {
                        e.preventDefault();
                        setSel(i => Math.min(sugg.length - 1, i + 1));
                    } else if (e.key === "ArrowUp" && sugg.length) {
                        e.preventDefault();
                        setSel(i => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        add(open && sugg.length ? sugg[sel] : undefined);
                    } else if (e.key === "Escape") setOpen(false);
                }}
            />
            <input className={cx(s.in, s.sm, s.num)} placeholder="Prezzo" inputMode="decimal" aria-label="Prezzo" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} />
            <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={() => add()}>
                Aggiungi
            </Button>
            {open && sugg.length > 0 && (
                <div className={s.sugg} role="listbox" aria-label="Prodotti che avete">
                    {sugg.map((p, i) => (
                        <button key={p.id} type="button" role="option" aria-selected={i === sel} onMouseDown={e => e.preventDefault()} onClick={() => add(p)}>
                            <span>{p.name}</span>
                            <span>{priceText(p.listPrice)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
