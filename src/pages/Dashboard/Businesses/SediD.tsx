import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { ActiveCatalogMeta, BusinessWithCapabilities } from "@/types/Businesses";
import type { CatalogFetchStatus } from "@/utils/activeCatalogStatus";
import { VetrinaHead } from "../Vetrina/VetrinaHead";
import { VetrinaNone } from "../Vetrina/VetrinaCard";
import { useCompactHead } from "../Vetrina/useCompactHead";
import type { LeadPart } from "../Vetrina/vetrinaModel";
import vs from "../Vetrina/Vetrina.module.scss";
import { SedeCard } from "./SedeCard";
import s from "./SediD.module.scss";

export type SediTab = "activities" | "groups";
type SediFilter = "tutti" | "problema" | "sospese";

type Props = {
    businesses: BusinessWithCapabilities[];
    loading: boolean;
    activeCatalogsMap: Record<string, ActiveCatalogMeta>;
    catalogsStatus: CatalogFetchStatus;
    pendingReservationsMap: Record<string, number>;
    tab: SediTab;
    onTab: (t: SediTab) => void;
    query: string;
    onQuery: (q: string) => void;
    /** «Aggiungi sede» o «Aggiungi gruppo», secondo la scheda. */
    crea: ReactNode;
    /** I gruppi di sedi: la sezione di oggi. */
    groups: ReactNode;
    onDelete?: (id: string) => void;
    /** «Aggiungi la prima sede» quando non ce n'è nessuna; senza, solo il testo. */
    onAdd?: () => void;
};

const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`);

/**
 * «Tutte le sedi» nella D (Visual Redesign 2, PR 11a; copia `pSdAll`): la
 * frase, «Sedi · Gruppi di sedi», i filtri e una card per sede. La card si
 * tocca per aprire la Scheda; sotto, solo i problemi veri, ognuno porta dove
 * si risolve.
 */
export function SediD(p: Props) {
    const { businessId } = useParams<{ businessId: string }>();
    const { compact, setTop } = useCompactHead();
    const [filter, setFilter] = useState<SediFilter>("tutti");
    const ready = p.catalogsStatus === "ready";
    const failed = p.catalogsStatus === "error";

    const info = useMemo(
        () =>
            p.businesses.map(b => {
                const cat = p.activeCatalogsMap[b.id];
                const sospesa = b.status === "inactive";
                const noMenu = !sospesa && ready && !cat?.hasActiveCatalog;
                const nonDisp = sospesa ? 0 : (cat?.unavailableCount ?? 0);
                return { b, cat, sospesa, noMenu, nonDisp, problema: sospesa || noMenu || nonDisp > 0 };
            }),
        [p.businesses, p.activeCatalogsMap, ready]
    );

    const q = p.query.trim().toLowerCase();
    const shown = info.filter(
        x =>
            (!q || [x.b.name, x.b.slug, x.b.city, x.b.address].some(v => v?.toLowerCase().includes(q))) &&
            (filter === "tutti" || (filter === "problema" ? x.problema : x.sospesa))
    );

    const groupsTab = p.tab === "groups";
    const lead = useMemo<LeadPart[]>(() => {
        if (groupsTab) return [{ text: "Un gruppo raccoglie più sedi: nel Calendario una regola può valere per tutto il gruppo." }];
        const sosp = info.filter(x => x.sospesa).map(x => x.b.name);
        const noMenu = info.filter(x => x.noMenu).map(x => x.b.name);
        const n = info.length;
        return [
            { strong: n === 1 ? "Una sede" : `${n} sedi` },
            { text: `, ${n - sosp.length === 1 ? "una online" : `${n - sosp.length} online`}.` },
            ...(noMenu.length ? [{ text: " " }, { down: names(noMenu) }, { text: noMenu.length === 1 ? " non mostra nessun menù." : " non mostrano nessun menù." }] : []),
            ...(sosp.length ? [{ text: " " }, { down: names(sosp) }, { text: sosp.length === 1 ? " è sospesa." : " sono sospese." }] : [])
        ];
    }, [groupsTab, info]);

    const tabs = (
        <SegmentedControl<SediTab>
            size="sm"
            label="Sedi o gruppi"
            value={p.tab}
            onChange={t => {
                setFilter("tutti");
                p.onTab(t);
            }}
            options={[
                { value: "activities", label: "Sedi" },
                { value: "groups", label: "Gruppi di sedi" }
            ]}
        />
    );

    return (
        <div className={`${vs.page} ${s.page}`}>
            <VetrinaHead<SediFilter>
                family="menu"
                lead={p.loading ? null : lead}
                before={tabs}
                filter={filter}
                onFilter={setFilter}
                filterOptions={
                    groupsTab
                        ? []
                        : [
                              { value: "tutti", label: "Tutte", count: info.length },
                              { value: "problema", label: "Con un problema", count: info.filter(x => x.problema).length },
                              { value: "sospese", label: "Sospese", count: info.filter(x => x.sospesa).length }
                          ]
                }
                filterAll="tutti"
                query={p.query}
                onQuery={p.onQuery}
                placeholder={groupsTab ? "Cerca un gruppo" : "Cerca una sede"}
                crea={p.crea}
                compact={compact}
                setTop={setTop}
            />
            {groupsTab ? (
                <section className={s.groups}>{p.groups}</section>
            ) : p.loading ? null : info.length === 0 ? (
                <EmptyState
                    icon={<Store />}
                    title="Aggiungi la prima sede"
                    description="Le sedi sono i locali che i clienti raggiungono con il QR: ognuna ha il suo indirizzo e il suo link pubblico."
                    action={
                        p.onAdd ? (
                            <Button variant="primary" onClick={p.onAdd}>
                                Aggiungi la prima sede
                            </Button>
                        ) : undefined
                    }
                />
            ) : shown.length ? (
                <div className={s.grid} role="list" aria-label="Sedi">
                    {shown.map((x, i) => (
                        <SedeCard key={x.b.id} {...x} index={info.indexOf(x)} order={i} businessId={businessId ?? ""} pending={p.pendingReservationsMap[x.b.id] ?? 0} ready={ready} failed={failed} onDelete={p.onDelete} />
                    ))}
                </div>
            ) : (
                <VetrinaNone
                    onClear={() => {
                        setFilter("tutti");
                        p.onQuery("");
                    }}
                />
            )}
        </div>
    );
}
