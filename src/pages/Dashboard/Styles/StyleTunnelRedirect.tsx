// Il vecchio editor dello stile non c'è più: l'editor è il tunnel (deciso da Alex
// l'11/10). Un link salvato a /styles/:styleId apre il tunnel di modifica.
import { Navigate, useParams } from "react-router-dom";

export default function StyleTunnelRedirect() {
    const { businessId, styleId } = useParams<{ businessId: string; styleId: string }>();
    return <Navigate to={`/business/${businessId}/crea/stile/${styleId}?da=stili`} replace />;
}
