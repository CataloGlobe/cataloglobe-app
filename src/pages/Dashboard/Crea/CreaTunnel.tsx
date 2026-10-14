// Il tunnel con i suoi dati: i permessi, la bozza tenuta da parte nel Calendario,
// il percorso da cui si è partiti. Il tunnel vero è in `Tunnelo`.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { usePermissions } from "@/context/usePermissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { canDoOnAnyActivity, canDoOnTenant, isTenantWide } from "@/lib/permissions";
import { peekAside } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { asInside, type CreaKind } from "./creaModel";
import { CAL_KIND } from "./creaSave";
import { useCreaData } from "./useCreaData";
import { Tunnelo } from "./Tunnelo";
import { StileGuarda } from "./StileGuarda";
import { loadTunnel, SystemStyleError, type Loaded } from "./creaLoad";

/** La pagina da cui si arriva a modificare, se `?da=` non lo dice. */
const HOME: Record<CreaKind, string> = { menu: "menu", stile: "stili", evid: "evidenza", storia: "storie" };

/** «un menù», «uno stile»: l'articolo giusto per ogni cosa. */
const UN: Record<CreaKind, string> = { menu: "un menù", stile: "uno stile", evid: "un contenuto in evidenza", storia: "una storia" };

/** Da dove si è partiti (`?da=`): lì riporta il percorso, e «Esci». */
const ORIGIN: Record<string, [string, string]> = {
    panoramica: ["Panoramica", "overview"],
    menu: ["Menù", "catalogs"],
    stili: ["Stili", "styles"],
    evidenza: ["In evidenza", "featured"],
    storie: ["Storie", "stories"],
    calendario: ["Calendario", "scheduling"]
};

export function CreaTunnel({ kind, editId }: { kind: CreaKind; editId?: string }) {
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { businessId } = useParams<{ businessId: string }>();
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    const { data, failed, reload } = useCreaData(tenantId);
    const b = `/business/${tenantId}`;

    const canWrite = !!permissions && (kind === "menu" ? canDoOnTenant(permissions, "catalogs.write") : kind === "stile" ? canDoOnTenant(permissions, "styles.write") : canDoOnAnyActivity(permissions, kind === "evid" ? "featured.write" : "stories.write"));
    const owner = !!permissions && canDoOnAnyActivity(permissions, "scheduling.write") && isTenantWide(permissions);

    const [label, path] = ORIGIN[params.get("da") ?? ""] ?? (editId ? ORIGIN[HOME[kind]] : ORIGIN.panoramica);

    // modificare (D140): la cosa com'è oggi, letta una volta quando ci sono i dati del tunnel
    const [loaded, setLoaded] = useState<Loaded | "failed" | "system" | null>(null);
    const [tries, setTries] = useState(0);
    const ready = !!data;
    useEffect(() => {
        if (!editId || !tenantId || !data || loaded) return;
        let off = false;
        loadTunnel(kind, editId, tenantId, data)
            .then(x => !off && setLoaded(params.get("dentro") ? { ...x, t: asInside(x.t) } : x))
            .catch(error => {
                if (!(error instanceof SystemStyleError)) console.error("[Crea] la cosa da modificare non si è letta:", error);
                if (!off) setLoaded(error instanceof SystemStyleError ? "system" : "failed");
            });
        return () => {
            off = true;
        };
        // i dati si rileggono dopo ogni salvataggio: la cosa si legge una volta sola
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, editId, tenantId, ready, tries]);
    // dal Calendario con una bozza tenuta da parte: il suo quando e il suo dove
    const [aside] = useState(() => {
        if (params.get("da") !== "calendario" || kind === "storia") return null;
        // l'azienda dall'indirizzo: al primo disegno quella scelta può non essere ancora arrivata
        const a = businessId ? peekAside(businessId) : null;
        return a && a.kind === CAL_KIND[kind] ? a : null;
    });
    // in alto solo la pagina da cui si è partiti: il percorso intero è nella testa del
    // tunnel, come «Aggiungi» del Calendario
    const crumbs = useMemo(() => [{ label }], [label]);
    useBreadcrumbItems(crumbs);

    if (failed)
        return (
            <EmptyState
                title="Il tunnel non si è aperto"
                description="Non siamo riusciti a leggere i menù, gli stili e il calendario. Riprova tra poco."
                action={<Button onClick={() => void reload()}>Riprova</Button>}
            />
        );
    if (!data || !tenantId) return <Skeleton height={420} />;
    // chi non può modificare uno stile lo guarda: le stesse parti e lo stesso telefono, spenti.
    // Così anche con l'abbonamento fermo: si guarda, e non si arriva a un Salva che si ferma.
    const paused = !!selectedTenant && !canEdit;
    const look = (!canWrite || paused) && kind === "stile" && editId ? data.styles.find(x => x.id === editId) : null;
    if (look) return <StileGuarda style={look} tenantId={tenantId} business={selectedTenant?.name ?? ""} menu="" why={canWrite ? "abbonamento" : "permesso"} back={() => navigate(`${b}/${path}`)} />;
    if (!canWrite) return <EmptyState title={editId ? "Non puoi modificarlo" : "Non puoi crearlo"} description={`Per ${editId ? "modificare" : "creare"} ${UN[kind]} serve il permesso di modifica. Chiedilo al proprietario.`} />;
    // come il vecchio editor: si torna all'elenco o si riprova (rilettura #472, punto 7)
    if (editId && loaded === "failed")
        return (
            <EmptyState
                title="Non si è aperto"
                description="Non siamo riusciti a leggerlo: forse non c'è più. Torna all'elenco e riprova."
                action={
                    <>
                        <Button variant="secondary" onClick={() => navigate(`${b}/${path}`)}>
                            Torna all'elenco
                        </Button>
                        <Button
                            onClick={() => {
                                setLoaded(null);
                                setTries(n => n + 1);
                            }}
                        >
                            Riprova
                        </Button>
                    </>
                }
            />
        );
    if (editId && !loaded) return <Skeleton height={420} />;
    return (
        <Tunnelo
            kind={kind}
            aside={aside}
            // uno stile di CataloGlobe non si modifica: se ne fa uno proprio partendo da lui (D186, 4A)
            edit={editId && loaded !== "system" ? (loaded as Loaded) : null}
            fromStyle={loaded === "system" ? editId : null}
            data={data}
            tenantId={tenantId}
            owner={owner}
            origin={{ label, to: `${b}/${path}` }}
            business={selectedTenant?.name ?? ""}
            reload={reload}
            navigate={navigate}
            showToast={showToast}
            b={b}
        />
    );
}
