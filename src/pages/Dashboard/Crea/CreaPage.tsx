// I tunnel di creazione (D124 → B): dentro l'app, come «Aggiungi» del
// Calendario. In alto il percorso, il titolo, i passi in fila con Indietro e
// Avanti accanto; a sinistra il passo, a destra il telefono (o, nel Quando e
// nel Dove, la settimana del Calendario).
import { Navigate, useParams } from "react-router-dom";
import { PageGate } from "@/components/PageGate/PageGate";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { usePermissions } from "@/context/usePermissions";
import { useTenantId } from "@/context/useTenantId";
import { kindOfSlug } from "./creaModel";
import { CREA_READ, creaAccess } from "./creaAccess";
import { CreaTunnel } from "./CreaTunnel";

export default function CreaPage() {
    const { kind: slug, id } = useParams<{ kind: string; id?: string }>();
    const { permissions, loading, refresh } = usePermissions();
    const tenantId = useTenantId();
    const kind = kindOfSlug(slug);
    if (!kind) return <Navigate to="../overview" replace />;
    // senza il permesso di lettura il tunnel non parte nemmeno: niente letture prima del blocco
    const access = creaAccess(kind, permissions, loading);
    // i permessi non si sono letti (c'è solo il toast): senza «Riprova» resterebbe lo scheletro (rilettura #472, punto 6)
    if (access === "wait" && !loading && tenantId)
        return <EmptyState title="I permessi non si sono letti" description="Senza i permessi il tunnel non parte. Riprova tra poco." action={<Button onClick={() => void refresh()}>Riprova</Button>} />;
    if (access === "wait") return <Skeleton height={420} />;
    return <PageGate readPermission={CREA_READ[kind]}>{() => (access === "open" ? <CreaTunnel key={kind + (id ?? "")} kind={kind} editId={id} /> : null)}</PageGate>;
}
