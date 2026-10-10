// I tunnel di creazione (D124 → B): dentro l'app, come «Aggiungi» del
// Calendario. In alto il percorso, il titolo, i passi in fila con Indietro e
// Avanti accanto; a sinistra il passo, a destra il telefono (o, nel Quando e
// nel Dove, la settimana del Calendario).
import { Navigate, useParams } from "react-router-dom";
import { PageGate } from "@/components/PageGate/PageGate";
import { kindOfSlug, type CreaKind } from "./creaModel";
import { CreaTunnel } from "./CreaTunnel";

const READ: Record<CreaKind, string> = { menu: "catalogs.read", stile: "styles.read", evid: "featured.read", storia: "stories.read" };

export default function CreaPage() {
    const { kind: slug, id } = useParams<{ kind: string; id?: string }>();
    const kind = kindOfSlug(slug);
    if (!kind) return <Navigate to="../overview" replace />;
    return <PageGate readPermission={READ[kind]}>{() => <CreaTunnel key={kind + (id ?? "")} kind={kind} editId={id} />}</PageGate>;
}
