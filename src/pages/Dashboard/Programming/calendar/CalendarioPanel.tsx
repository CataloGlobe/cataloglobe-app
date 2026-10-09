import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { KIND_LABEL, durLabel, eur, hhmm, q, why, type CalEntry, type CalKind, type CalSeat, type Line, type LineSeg } from "./calendarModel";
import type { DropItem } from "./calendarWrites";
import s from "./CalendarioView.module.scss";

export type ProductInfo = { category: string | null; listPrice: number | null };

type Row = { key: string; name: string; sub: string | null; item: DropItem; eff: { price: number; strike: boolean; list: number | null } | { mode: "hide" | "disable" } };

export type CalendarioPanelProps = {
    entry: CalEntry;
    line: Line | undefined;
    seg: LineSeg | undefined;
    seat: CalSeat;
    /** «venerdì 9 ottobre» */
    dateText: string;
    sedeName: string | null;
    color: string;
    whereFor: (e: CalEntry) => string;
    whereLong: (e: CalEntry) => string;
    products: ReadonlyMap<string, ProductInfo>;
    formatNames: ReadonlyMap<string, string>;
    /** Lo stile che oggi sta nella stessa regola del menù (e viceversa). */
    pairedName: string | null;
    writable: boolean;
    onClose: () => void;
    onFull: () => void;
    onDrop: (item?: DropItem) => Promise<void>;
};

const fH = (g: { from: number; to: number }) => hhmm(g.from) + "–" + hhmm(g.to);
const isDish = (k: CalKind) => k === "price" || k === "visibility";

/* ---------- il pannello piccolo: com'è adesso, perché, e i ritocchi ---------- */
export function CalendarioPanel(p: CalendarioPanelProps) {
    const { entry: e, line: ln, seg: g, seat } = p;
    const k = e.kind;
    const [confirm, setConfirm] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const drop = async (item?: DropItem) => {
        setBusy(true);
        try {
            await p.onDrop(item);
            setConfirm(null);
        } finally {
            setBusy(false);
        }
    };

    const rows: Row[] = [];
    if (k === "price")
        for (const o of e.rule.price_overrides) {
            const info = p.products.get(o.product_id);
            const fmt = o.option_value_id ? p.formatNames.get(o.option_value_id) : null;
            rows.push({
                key: o.product_id + ":" + (o.option_value_id ?? ""),
                name: o.product_name ?? "Prodotto",
                sub: fmt ?? info?.category ?? null,
                item: { kind: "price", productId: o.product_id, optionValueId: o.option_value_id ?? null },
                eff: { price: o.override_price, strike: o.show_original_price, list: fmt ? null : (info?.listPrice ?? null) }
            });
        }
    if (k === "visibility")
        for (const o of e.rule.visibility_overrides)
            rows.push({
                key: o.product_id,
                name: o.product_name ?? "Prodotto",
                sub: p.products.get(o.product_id)?.category ?? null,
                item: { kind: "visibility", productId: o.product_id },
                eff: { mode: o.mode === "disable" ? "disable" : "hide" }
            });

    const where = p.sedeName ? (
        <>
            {" "}a <b>{p.sedeName}</b>,
        </>
    ) : null;

    let why1: ReactNode = null;
    if (g && ln) {
        if (g.state === "off")
            why1 = (
                <>
                    <h4>Perché non si vede</h4>
                    <p>
                        Vince {q(g.by)}
                        {g.self && g.win ? ", che " + why(g.win, g.self, seat, p.whereFor) : ""}.
                    </p>
                </>
            );
        else if (isDish(k)) why1 = null;
        else if (ln.add)
            why1 = (
                <>
                    <h4>Perché si vede</h4>
                    <p>Si aggiunge: non toglie niente.{g.with.length ? " Insieme c'è " + g.with.map(q).join(", ") + "." : ""}</p>
                </>
            );
        else if (g.covers.length)
            why1 = (
                <>
                    <h4>Perché vince</h4>
                    <ul>
                        {g.covers.map(x => {
                            const l = g.reps.find(r => r.thing === x);
                            return (
                                <li key={x}>
                                    Su {q(x)}: {g.win && l ? why(g.win, l, seat, p.whereFor) : "vince lui"}.
                                </li>
                            );
                        })}
                    </ul>
                </>
            );
        else
            why1 = (
                <>
                    <h4>Perché si vede</h4>
                    <p className={s.muted}>In quelle ore non c'è nessun altro {KIND_LABEL[k].toLowerCase()}.</p>
                </>
            );
    }

    const whereTxt = p.sedeName ? " · " + p.whereLong(e) : "";
    const dish = isDish(k);
    const askAll = confirm === "all";

    return (
        <aside className={`${s.hpanel} ${s.ipanel}`} aria-label={e.thing}>
            <div className={s.hph}>
                <span className={s.tag} style={{ "--c": p.color } as CSSProperties}>
                    {KIND_LABEL[k]}
                </span>
                <b data-tip={e.thing}>{e.thing}</b>
                <IconButton size="sm" icon={<X size={16} />} aria-label="Chiudi il pannello" onClick={p.onClose} />
            </div>
            <div className={s.hpb}>
                {g && (
                    <p>
                        {g.state === "on" ? "In onda" : "C'è"}
                        {where} {p.dateText}, {fH(g)}
                        {g.state === "on" ? "." : ", ma non si vede."}
                    </p>
                )}
                {why1}
                {dish ? (
                    <>
                        <h4>I piatti di questa data</h4>
                        <p className={s.muted}>
                            {durLabel(e.when)}
                            {whereTxt}
                        </p>
                        <div className={s.ilist}>
                            {rows.map(r =>
                                confirm === r.key ? (
                                    <div key={r.key} className={`${s.irow} ${s.conf}`}>
                                        <span>
                                            <b>Togliere {r.name}?</b> {k === "price" ? "Torna al prezzo di listino." : "Torna visibile."}
                                        </span>
                                        <span className={s.hfa}>
                                            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
                                                Annulla
                                            </Button>
                                            <Button size="sm" variant="danger" loading={busy} onClick={() => drop(r.item)}>
                                                Togli
                                            </Button>
                                        </span>
                                    </div>
                                ) : (
                                    <div key={r.key} className={s.irow}>
                                        <span className={s.hnm}>
                                            <span>{r.name}</span>
                                            {r.sub && <span className={s.hsub}>{r.sub}</span>}
                                        </span>
                                        <span className={s.heff}>
                                            {"price" in r.eff ? (
                                                <span className={s.hpr}>
                                                    {r.eff.strike && r.eff.list != null && <s>{eur(r.eff.list)}</s>} <b>{eur(r.eff.price)}</b>
                                                </span>
                                            ) : (
                                                <span className={`${s.badge} ${r.eff.mode === "disable" ? s.warn : ""}`}>
                                                    {r.eff.mode === "disable" ? "Non ordinabile" : "Non si vede"}
                                                </span>
                                            )}
                                        </span>
                                        <span className={s.iacts}>
                                            <IconButton size="sm" icon={<Pencil size={14} />} aria-label={`Modifica ${r.name}`} data-tip="Modifica questo piatto" onClick={p.onFull} />
                                            {p.writable && (
                                                <IconButton size="sm" icon={<X size={14} />} aria-label={`Togli ${r.name}`} data-tip="Togli questo piatto" onClick={() => setConfirm(r.key)} />
                                            )}
                                        </span>
                                    </div>
                                )
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <h4>Quando e dove</h4>
                        <p>
                            {durLabel(e.when)}
                            {whereTxt}
                        </p>
                        {k === "menu" && <p className={s.muted}>Menù classico: nelle sue ore i clienti vedono solo questo.</p>}
                    </>
                )}
            </div>
            <div className={s.hpf}>
                {askAll ? (
                    <>
                        <span>
                            <b>Togliere dal calendario?</b> {dish ? "Questi piatti tornano come da listino." : "Non andrà più in onda."}
                            {p.pairedName && ` Si toglie anche ${k === "menu" ? "lo stile" : "il menù"} ${q(p.pairedName)}, che oggi sta nella stessa regola.`}
                        </span>
                        <span className={s.hfa}>
                            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
                                Annulla
                            </Button>
                            <Button size="sm" variant="danger" loading={busy} onClick={() => drop(k === "featured" ? featuredItem(e) : undefined)}>
                                Togli
                            </Button>
                        </span>
                    </>
                ) : (
                    <>
                        {p.writable && (
                            <Button size="sm" variant="ghost" className={s.dangerT} leftIcon={<Trash2 size={16} />} aria-label="Togli dal calendario" onClick={() => setConfirm("all")}>
                                Togli
                            </Button>
                        )}
                        <Button size="sm" variant="primary" rightIcon={<ArrowRight size={16} />} onClick={p.onFull} className={s.hfa}>
                            Modifica completa
                        </Button>
                    </>
                )}
            </div>
        </aside>
    );
}

// In evidenza: ogni contenuto è una voce sua; «Togli» toglie quello.
const featuredItem = (e: CalEntry): DropItem | undefined => {
    const id = e.id.split(":featured:")[1];
    return id ? { kind: "featured", contentId: id } : undefined;
};

