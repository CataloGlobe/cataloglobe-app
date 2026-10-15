import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Link as LinkIcon, Store } from "lucide-react";
import { FamilyName } from "@/components/ui/FamilyName/FamilyName";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { useToast } from "@/context/Toast/ToastContext";
import type { ActiveCatalogMeta, BusinessWithCapabilities } from "@/types/Businesses";
import { formatInactiveReason } from "@/utils/activityStatus";
import { buildPublicUrl } from "@/utils/publicUrl";
import { Facciata } from "./Facciata";
import s from "./SediD.module.scss";

/** Una sede in «Tutte le sedi» nella D (copia `.sd-card`): si tocca per aprire la Scheda. */
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

export function SedeCard({ b, cat, sospesa, noMenu, nonDisp, index, order, businessId, pending, ready, onDelete }: CardProps) {
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
