import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { ProdottoOrdine } from "./prodottiModel";
import s from "./Vetrina.module.scss";

export type ProdottoRiga = ProdottoOrdine & {
    id: string;
    /** Dove porta il clic sulla riga: la pagina del prodotto. */
    to: string;
    /** Il gruppo (il primo, se sono più d'uno). */
    group: string | null;
    /** «16,00 €», «da 3,00 €»; `null` quando manca. */
    priceText: string | null;
    /** I nomi dei menù in cui compare. */
    menus: string[];
    /** Il ⋮ della riga. */
    actions?: ReactNode;
};

type Props = {
    rows: readonly ProdottoRiga[];
    ariaLabel: string;
    productLabel: string;
    catalogLabelPlural: string;
    /** «In nessun menù». */
    noneLabel: string;
};

/**
 * La tabella di Prodotti nella D (Visual Redesign 2, `pPrd`): prodotto,
 * gruppo, prezzo e i menù in cui compare. Tutta la riga apre il prodotto
 * (v32) e al computer l'intestazione resta ferma sotto la riga dei comandi
 * (v34). Stretta, ogni prodotto diventa una scheda: il nome intero, il prezzo
 * a destra, sotto il gruppo e i menù. Lì `display: grid` toglie a Safari la
 * lettura come tabella: i ruoli scritti la tengono per VoiceOver.
 */
export function ProdottiTabella({ rows, ariaLabel, productLabel, catalogLabelPlural, noneLabel }: Props) {
    const navigate = useNavigate();
    return (
        <section className={s.tabWrap}>
            <table className={s.tab} aria-label={ariaLabel} role="table">
                <thead role="rowgroup">
                    <tr role="row">
                        <th scope="col" role="columnheader">{productLabel}</th>
                        <th scope="col" role="columnheader">Gruppo</th>
                        <th scope="col" role="columnheader" className={s.pz}>
                            Prezzo
                        </th>
                        <th scope="col" role="columnheader">{`Nei ${catalogLabelPlural.toLowerCase()}`}</th>
                        <th scope="col" role="columnheader">
                            <span className={s.sr}>Azioni</span>
                        </th>
                    </tr>
                </thead>
                <tbody role="rowgroup">
                    {rows.map(row => (
                        <tr key={row.id} role="row" onClick={() => navigate(row.to)}>
                            <td role="cell" className={s.pn}>
                                <Link to={row.to} onClick={e => e.stopPropagation()}>
                                    {row.name}
                                </Link>
                            </td>
                            <td role="cell" className={s.gr}>{row.group ?? "Senza gruppo"}</td>
                            <td role="cell" className={s.pz}>
                                {row.priceText ?? <StatusBadge variant="danger" label="Senza prezzo" />}
                            </td>
                            <td role="cell" className={s.tags}>
                                {row.menus.length > 0 ? (
                                    row.menus.map(m => (
                                        <span key={m} className={s.tag}>
                                            {m}
                                        </span>
                                    ))
                                ) : (
                                    <span className={s.mu}>{noneLabel}</span>
                                )}
                            </td>
                            <td role="cell" className={s.more} onClick={e => e.stopPropagation()}>
                                {row.actions}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
