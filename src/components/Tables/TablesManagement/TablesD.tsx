import { useMemo, type CSSProperties } from "react";
import { Layers, Plus, QrCode, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { VetrinaHead } from "@/pages/Dashboard/Vetrina/VetrinaHead";
import { useCompactHead } from "@/pages/Dashboard/Vetrina/useCompactHead";
import type { LeadPart } from "@/pages/Dashboard/Vetrina/vetrinaModel";
import vs from "@/pages/Dashboard/Vetrina/Vetrina.module.scss";
import type { V2Table, V2TableWithState } from "@/types/orders";
import s from "./TablesD.module.scss";

type Props = {
    items: V2TableWithState[];
    loading: boolean;
    /** Il nome della sede, nella frase: «… posti a San Pietro». */
    activityName?: string;
    orderingEnabled: boolean;
    reservationsEnabled: boolean;
    canManage: boolean;
    disabled: boolean;
    query: string;
    onQuery: (q: string) => void;
    generatingAll: boolean;
    generatingId: string | null;
    onZones: () => void;
    onQrAll: () => void;
    onCreate: () => void;
    onEdit: (t: V2Table) => void;
    onQrPreview: (t: V2TableWithState) => void;
    onQrSingle: (t: V2Table) => void;
    onRegen: (t: V2Table) => void;
    onDelete: (t: V2Table) => void;
    /** Capienza non dichiarata: il motore non lo propone alle prenotazioni (v73). */
    isExcluded: (t: V2TableWithState) => boolean;
    /** Le caselle e «Elimina N tavoli» (v73), solo con il permesso. */
    selected: string[];
    onSelected: (ids: string[]) => void;
    onBulkDelete: (ids: string[]) => void;
};

const tavoli = (n: number) => (n === 1 ? "un tavolo" : `${n} tavoli`);
const posti = (list: V2TableWithState[]) => list.reduce((a, t) => a + (t.seats ?? 0), 0);

/**
 * Sale e tavoli nella D (Visual Redesign 2, PR 11c; copia `salPage`): la
 * frase coi numeri della sala, la riga dei comandi e una card per zona, con
 * una riga per tavolo. I pannelli (tavolo, QR, zone) restano quelli di oggi.
 */
export function TablesD(p: Props) {
    const { compact, setTop } = useCompactHead();
    const q = p.query.trim().toLowerCase();

    const zones = useMemo(() => {
        const names = [...new Set(p.items.map(t => t.zone_name).filter((z): z is string => !!z))].sort((a, b) => a.localeCompare(b, "it"));
        const all = [...names.map(z => ({ name: z, list: p.items.filter(t => t.zone_name === z) })), { name: null, list: p.items.filter(t => !t.zone_name) }];
        return { count: names.length, cards: all.map(z => ({ ...z, list: z.list.filter(t => !q || t.label.toLowerCase().includes(q)) })).filter(z => z.list.length) };
    }, [p.items, q]);

    const lead = useMemo<LeadPart[]>(() => {
        const n = p.items.length;
        if (!n) return [{ text: "Ancora nessun tavolo. Ogni tavolo avrà il suo QR: chi lo inquadra apre il menù." }];
        return [
            { strong: n === 1 ? "Un tavolo" : `${n} tavoli` },
            {
                text:
                    `${zones.count ? ` in ${zones.count === 1 ? "una zona" : `${zones.count} zone`}` : ""}, ${posti(p.items)} posti${p.activityName ? ` a ${p.activityName}` : ""}.` +
                    (p.orderingEnabled ? " Ogni tavolo ha il suo QR: chi lo inquadra apre il menù e ordina da lì." : "")
            }
        ];
    }, [p.items, zones.count, p.activityName, p.orderingEnabled]);

    const crea = (
        <>
            {p.orderingEnabled && (
                <Button variant="secondary" size="sm" leftIcon={<QrCode size={16} />} onClick={p.onQrAll} disabled={p.disabled || !p.items.length || p.generatingAll}>
                    {p.generatingAll ? "Generazione…" : "QR di tutti in PDF"}
                </Button>
            )}
            {p.canManage && (
                <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus size={16} />}
                    onClick={() => {
                        p.onSelected([]);
                        p.onCreate();
                    }}
                    disabled={p.disabled}
                >
                    Nuovo tavolo
                </Button>
            )}
        </>
    );

    let order = 0;
    return (
        <div className={`${vs.page} ${s.page}`}>
            <VetrinaHead
                family="menu"
                lead={p.loading ? null : lead}
                before={
                    p.canManage ? (
                        <Button variant="secondary" size="sm" leftIcon={<Layers size={16} />} onClick={p.onZones} disabled={p.disabled}>
                            Zone e accostamenti
                        </Button>
                    ) : undefined
                }
                filter="tutti"
                onFilter={() => undefined}
                filterOptions={[]}
                filterAll="tutti"
                query={p.query}
                onQuery={p.onQuery}
                placeholder="Cerca un tavolo"
                crea={<span className={s.crea}>{crea}</span>}
                compact={compact}
                setTop={setTop}
            />
            {p.canManage && p.selected.length > 0 && (
                <div className={s.sel} role="region" aria-label="Tavoli selezionati">
                    <b>{p.selected.length === 1 ? "1 tavolo selezionato" : `${p.selected.length} tavoli selezionati`}</b>
                    <i className={s.fl} />
                    <Button variant="ghost" size="sm" onClick={() => p.onSelected([])}>
                        Annulla
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => p.onBulkDelete(p.selected)} disabled={p.disabled}>
                        {p.selected.length === 1 ? "Elimina 1 tavolo" : `Elimina ${p.selected.length} tavoli`}
                    </Button>
                </div>
            )}
            {p.loading ? null : zones.cards.length ? (
                <div className={s.zones} role="group" aria-label="Tavoli">
                    {zones.cards.map(z => (
                        <section key={z.name ?? ""} className={s.zone} aria-label={z.name ?? "Senza zona"}>
                            <div className={s.hd}>
                                <h3>{z.name ?? "Senza zona"}</h3>
                                <span>
                                    {tavoli(z.list.length)} · {posti(z.list)} posti
                                </span>
                            </div>
                            {z.list.map(t => (
                                <div key={t.id} className={`${s.row}${p.canManage ? ` ${s.rowCk}` : ""}`} style={{ "--i": order++ } as CSSProperties}>
                                    {p.canManage && (
                                        <label className={s.ck} title="Seleziona">
                                            <input
                                                type="checkbox"
                                                aria-label={`Seleziona il tavolo ${t.label}`}
                                                checked={p.selected.includes(t.id)}
                                                onChange={e => p.onSelected(e.target.checked ? [...p.selected, t.id] : p.selected.filter(id => id !== t.id))}
                                            />
                                        </label>
                                    )}
                                    <button
                                        type="button"
                                        className={s.hit}
                                        onClick={() => {
                                            p.onSelected([]);
                                            p.onEdit(t);
                                        }}
                                        disabled={!p.canManage}
                                    >
                                        <b>
                                            {t.label}
                                            {p.isExcluded(t) && (
                                                <span
                                                    className={s.tri}
                                                    title="Capienza non dichiarata (né posti né capienza massima): il motore di assegnazione automatica non propone questo tavolo alle prenotazioni. Resta assegnabile a mano."
                                                    aria-label="Escluso dall'assegnazione automatica"
                                                    role="img"
                                                >
                                                    <TriangleAlert size={16} strokeWidth={1.9} aria-hidden />
                                                </span>
                                            )}
                                        </b>
                                        <small>
                                            {t.seats ? `${t.seats} posti` : "posti non indicati"}
                                            {p.reservationsEnabled && t.max_seats ? ` · fino a ${t.max_seats}` : ""}
                                            {p.reservationsEnabled && t.combination_group_name ? ` · si unisce a ${t.combination_group_name}` : ""}
                                        </small>
                                    </button>
                                    <span className={s.tags}>
                                        {p.reservationsEnabled && !t.bookable_online && <span className={s.tag}>Solo senza prenotazione</span>}
                                        {(t.active_sessions_count ?? 0) > 0 && <StatusBadge variant="success" label="Aperto adesso" />}
                                    </span>
                                    <span className={s.acts}>
                                        {p.orderingEnabled && (
                                            <Tooltip content="Anteprima QR">
                                                <IconButton icon={<QrCode size={16} />} aria-label="Anteprima QR" variant="ghost" onClick={() => p.onQrPreview(t)} />
                                            </Tooltip>
                                        )}
                                        {p.canManage && (
                                            <TableRowActions
                                                actions={[
                                                    rowAction.edit(() => p.onEdit(t)),
                                                    ...(p.orderingEnabled
                                                        ? [
                                                              { label: p.generatingId === t.id ? "Generazione..." : "Genera QR", icon: QrCode, onClick: () => p.onQrSingle(t) },
                                                              { label: "Fai un QR nuovo", icon: RotateCw, onClick: () => p.onRegen(t) }
                                                          ]
                                                        : []),
                                                    rowAction.remove(() => p.onDelete(t))
                                                ]}
                                            />
                                        )}
                                    </span>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            ) : (
                <section className={vs.empty}>
                    <b>{p.items.length ? "Nessun tavolo" : "Ancora nessun tavolo"}</b>
                    <span>{p.items.length ? "Prova con un altro nome." : p.canManage ? "Aggiungete il primo con «Nuovo tavolo»." : "Qui compariranno i tavoli della sede."}</span>
                </section>
            )}
        </div>
    );
}
