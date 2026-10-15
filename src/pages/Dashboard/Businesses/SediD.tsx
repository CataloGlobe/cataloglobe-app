import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Link as LinkIcon, Store } from "lucide-react";
import { FamilyName } from "@/components/ui/FamilyName/FamilyName";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { useToast } from "@/context/Toast/ToastContext";
import type { ActiveCatalogMeta, BusinessWithCapabilities } from "@/types/Businesses";
import type { CatalogFetchStatus } from "@/utils/activeCatalogStatus";
import { formatInactiveReason } from "@/utils/activityStatus";
import { buildPublicUrl } from "@/utils/publicUrl";
import { VetrinaHead } from "../Vetrina/VetrinaHead";
import { VetrinaNone } from "../Vetrina/VetrinaCard";
import { useCompactHead } from "../Vetrina/useCompactHead";
import type { LeadPart } from "../Vetrina/vetrinaModel";
import vs from "../Vetrina/Vetrina.module.scss";
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
            ) : p.loading ? null : shown.length ? (
                <div className={s.grid} role="list" aria-label="Sedi">
                    {shown.map((x, i) => (
                        <SedeCard key={x.b.id} {...x} index={info.indexOf(x)} order={i} businessId={businessId ?? ""} pending={p.pendingReservationsMap[x.b.id] ?? 0} ready={ready} onDelete={p.onDelete} />
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

type CardProps = {
    b: BusinessWithCapabilities;
    cat: ActiveCatalogMeta | undefined;
    sospesa: boolean;
    noMenu: boolean;
    nonDisp: number;
    index: number;
    order: number;
    businessId: string;
    pending: number;
    ready: boolean;
    onDelete?: (id: string) => void;
};

function SedeCard({ b, cat, sospesa, noMenu, nonDisp, index, order, businessId, pending, ready, onDelete }: CardProps) {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const sede = `/business/${businessId}/locations/${b.id}`;
    const scheda = `${sede}/anagrafica`;
    const publicUrl = buildPublicUrl(b.slug);
    const stato = sospesa ? `Sospesa${b.inactive_reason ? ` · ${formatInactiveReason(b.inactive_reason)}` : ""}` : "Online";

    const vede = sospesa ? (
        <>Chi apre il link legge «{b.inactive_reason ? formatInactiveReason(b.inactive_reason) : "Sospesa"}»</>
    ) : noMenu ? (
        <em>Nessun menù in onda</em>
    ) : cat?.hasActiveCatalog && cat.catalogName ? (
        <>
            I clienti vedono <FamilyName family="menu">{cat.catalogName}</FamilyName>
        </>
    ) : ready ? null : (
        <>&nbsp;</>
    );

    const issues: { label: string; to: string }[] = sospesa
        ? [{ label: "Riporta online", to: scheda }]
        : [
              ...(noMenu ? [{ label: "Metti in onda un menù", to: `/business/${businessId}/scheduling?vista=calendario` }] : []),
              ...(pending > 0 ? [{ label: pending === 1 ? "Una prenotazione da confermare" : `${pending} prenotazioni da confermare`, to: `${sede}/prenotazioni` }] : []),
              ...(nonDisp > 0 ? [{ label: nonDisp === 1 ? "Un prodotto non disponibile" : `${nonDisp} prodotti non disponibili`, to: `${sede}/cosa-vedono` }] : [])
          ];

    return (
        <div role="listitem" className={`${s.card} ${sospesa ? s.off : ""}`} style={{ "--c": `var(--sede-${index % 5})`, "--i": order } as CSSProperties}>
            <Link className={s.hit} to={scheda} aria-label={`Apri la scheda di ${b.name}`}>
                <span className={s.cov}>
                    {b.cover_image ? <img src={b.cover_image} alt="" loading="lazy" /> : <Facciata />}
                    <span className={`${s.st} ${sospesa ? "" : s.ready}`}>{stato}</span>
                </span>
                <span className={s.tx}>
                    <b className={s.n}>{b.name}</b>
                    <small>{[b.address, b.city].filter(Boolean).join(", ")}</small>
                </span>
            </Link>
            <p className={s.v}>{vede}</p>
            <div className={s.ft}>
                {issues.length ? (
                    issues.map(x => (
                        <Link key={x.label} className={s.al} to={x.to}>
                            {x.label}
                        </Link>
                    ))
                ) : (
                    <span className={s.ok}>Niente da guardare</span>
                )}
                <i className={s.fl} />
                <TableRowActions
                    ariaLabel={`Altro per ${b.name}`}
                    actions={[
                        { label: "Apri la scheda", icon: Store, onClick: () => navigate(scheda) },
                        {
                            label: "Copia il link",
                            icon: LinkIcon,
                            onClick: () => {
                                void navigator.clipboard.writeText(publicUrl);
                                showToast({ message: `Link di ${b.name} copiato.`, type: "success" });
                            }
                        },
                        { label: "Apri la pagina pubblica", icon: ExternalLink, onClick: () => window.open(publicUrl, "_blank", "noopener,noreferrer") },
                        rowAction.remove(() => onDelete?.(b.id), { hidden: !onDelete })
                    ]}
                />
            </div>
        </div>
    );
}

/** La facciata disegnata della copia (`SDCOV`), quando la sede non ha copertina. */
function Facciata() {
    return (
        <svg viewBox="0 0 120 72" aria-hidden="true">
            <path className={s.w} d="M16 30h88v42H16z" />
            <path className={s.a} d="M10 16h100l-6 14H16z" />
            <path d="M27 16l-5 14M44 16l-3 14M60 16v14M76 16l3 14M93 16l5 14" />
            <path className={s.d} d="M52 44h16v28H52z" />
            <path className={s.g} d="M24 40h20v16H24zM76 40h20v16H76z" />
        </svg>
    );
}
