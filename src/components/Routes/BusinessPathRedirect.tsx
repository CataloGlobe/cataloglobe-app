import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * Un indirizzo vecchio dell'azienda che porta alla pagina che oggi fa la
 * stessa cosa (§51.14), con `replace` e con query e ancora: i link salvati,
 * le email e i ritorni da Stripe arrivano dove chiedevano.
 */
export function BusinessPathRedirect({ to }: { to: string }) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { search, hash } = useLocation();
    return <Navigate to={{ pathname: `/business/${businessId}/${to}`, search, hash }} replace />;
}
