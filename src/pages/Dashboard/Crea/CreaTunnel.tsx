// Il tunnel con i suoi dati: i permessi, la bozza tenuta da parte nel Calendario,
// il percorso da cui si è partiti. Il tunnel vero è in `Tunnelo`.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { usePermissions } from "@/context/usePermissions";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { canDoOnAnyActivity, canDoOnTenant, isTenantWide } from "@/lib/permissions";
import { peekAside } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CreaKind } from "./creaModel";
import { CAL_KIND } from "./creaSave";
import { useCreaData } from "./useCreaData";
import { Tunnelo } from "./Tunnelo";
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
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const { permissions } = usePermissions();
    const { data, failed, reload } = useCreaData(tenantId);
    const b = `/business/${tenantId}`;

    const canWrite = !!permissions && (kind === "menu" ? canDoOnTenant(permissions, "catalogs.write") : kind === "stile" ? canDoOnTenant(permissions, "styles.write") : canDoOnAnyActivity(permissions, kind === "evid" ? "featured.write" : "stories.write"));
    const owner = !!permissions && canDoOnAnyActivity(permissions, "scheduling.write") && isTenantWide(permissions);

    const [label, path] = ORIGIN[params.get("da") ?? ""] ?? (editId ? ORIGIN[HOME[kind]] : ORIGIN.panoramica);

    // modificare (D140): la cosa com'è oggi, letta una volta quando ci sono i dati del tunnel
    const [loaded, setLoaded] = useState<Loaded | "failed" | "system" | null>(null);
    const ready = !!data;
    useEffect(() => {
        if (!editId || !tenantId || !data || loaded) return;
        let off = false;
        loadTunnel(kind, editId, tenantId, data)
            .then(x => !off && setLoaded(x))
            .catch(error => {
                if (!(error instanceof SystemStyleError)) console.error("[Crea] la cosa da modificare non si è letta:", error);
                if (!off) setLoaded(error instanceof SystemStyleError ? "system" : "failed");
            });
        return () => {
            off = true;
        };
        // i dati si rileggono dopo ogni salvataggio: la cosa si legge una volta sola
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, editId, tenantId, ready]);
    // dal Calendario con una bozza tenuta da parte: il suo quando e il suo dove
    const [aside] = useState(() => {
        if (params.get("da") !== "calendario" || kind === "storia") return null;
        const a = peekAside();
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
    if (!canWrite) return <EmptyState title={editId ? "Non puoi modificarlo" : "Non puoi crearlo"} description={`Per ${editId ? "modificare" : "creare"} ${UN[kind]} serve il permesso di modifica. Chiedilo al proprietario.`} />;
    if (editId && loaded === "system") return <EmptyState title="Lo stile di CataloGlobe non si modifica" description="Fanne una copia da Stili, e modifica quella." />;
    if (editId && loaded === "failed") return <EmptyState title="Non si è aperto" description="Non siamo riusciti a leggerlo: forse non c'è più. Torna all'elenco e riprova." />;
    if (editId && !loaded) return <Skeleton height={420} />;
    return (
        <Tunnelo
            kind={kind}
            aside={aside}
            edit={editId ? (loaded as Loaded) : null}
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
