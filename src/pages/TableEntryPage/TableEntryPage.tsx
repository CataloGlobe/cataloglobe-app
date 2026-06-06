import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resolveTable } from "@/services/supabase/customerSessions";
import { saveCustomerSession } from "@/services/customer/customerSessionStorage";
import { getOrCreateDeviceId } from "@/services/customer/deviceId";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { ResolveTableOrderingUnavailableError } from "@/types/orders";
import type { OrderingStateReason } from "@/types/orders";
import TableUnavailablePage from "./TableUnavailablePage";
import styles from "./TableEntryPage.module.scss";

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "unavailable"; reason: OrderingStateReason; message: string };

export default function TableEntryPage() {
    const { qrToken } = useParams<{ qrToken: string }>();
    const navigate = useNavigate();
    const [state, setState] = useState<PageState>({ status: "loading" });

    // Guard contro double-invoke dell'effect (StrictMode dev, suspense
    // rimount). La protezione vera contro session duplicate e' lato server
    // (Edge resolve-table riconosce device_id), ma questo guard evita
    // anche la chiamata di rete extra in dev. Belt-and-braces.
    const calledRef = useRef(false);

    useEffect(() => {
        if (!qrToken) {
            setState({ status: "error", message: "Codice QR non valido" });
            return;
        }
        if (calledRef.current) return;
        calledRef.current = true;

        // Niente flag `cancelled` qui: il useRef guard garantisce che
        // bootstrap parta UNA sola volta in tutto il ciclo di vita della
        // pagina. Aggiungere un `cancelled` con cleanup darebbe il bug
        // opposto in StrictMode: Run 1 partirebbe, lo StrictMode cleanup
        // setterebbe cancelled=true, Run 2 verrebbe bloccata dal useRef
        // e la Run 1 risolverebbe per poi auto-bailare prima di
        // saveCustomerSession + navigate → loading infinito.
        async function bootstrap() {
            try {
                const deviceId = getOrCreateDeviceId();
                const result = await resolveTable(qrToken!, { deviceId });

                saveCustomerSession({
                    jwt: result.jwt,
                    expiresAt: result.expires_at,
                    sessionId: result.session_id,
                    tableId: result.table.id,
                    tableLabel: result.table.label,
                    tableZone: result.table.zone ?? null,
                    activityId: result.activity.id,
                    tenantId: result.tenant_id,
                    customerName: null,
                });

                navigate(`/${result.activity.slug}`, { replace: true });
            } catch (err) {
                // 423 ORDERING_UNAVAILABLE: discrimina canViewMenu + reason.
                // - canViewMenu=true:
                //     * ordering_disabled → redirect pulito a /:slug.
                //       Verita lato server via payload resolve-public-catalog
                //       (business.ordering_enabled). NO URL param.
                //     * table_maintenance (+ future canViewMenu reasons) →
                //       URL param ?maintenance=table_maintenance. Verra
                //       migrato a React Router state in step successivo.
                // - canViewMenu=false (subscription_inactive, tenant_deleted,
                //   activity_inactive, table_deleted): full-page error.
                if (err instanceof ResolveTableOrderingUnavailableError) {
                    if (err.payload.canViewMenu) {
                        if (err.payload.reason === "ordering_disabled") {
                            // ordering_disabled: nessun state, payload server-side decide.
                            navigate(
                                `/${err.payload.activity.slug}`,
                                { replace: true }
                            );
                        } else {
                            // table_maintenance e future reason canViewMenu=true:
                            // veicolate via Router state (non shareable, persistono
                            // a refresh come l'URL param ma non bookmarkable).
                            navigate(
                                `/${err.payload.activity.slug}`,
                                {
                                    replace: true,
                                    state: {
                                        tableMaintenance: {
                                            reason: err.payload.reason,
                                            message: err.payload.message,
                                        },
                                    },
                                }
                            );
                        }
                        return;
                    }
                    setState({
                        status: "unavailable",
                        reason: err.payload.reason,
                        message: err.payload.message,
                    });
                    return;
                }

                const message =
                    err instanceof Error && err.message
                        ? err.message
                        : "Errore durante l'avvio della sessione. Riprova.";
                setState({ status: "error", message });
            }
        }

        void bootstrap();
    }, [qrToken, navigate]);

    if (state.status === "loading") {
        return (
            <div className={styles.container}>
                <AppLoader intent="public" showMessage={false} />
                <p className={styles.message}>Avvio della tua sessione...</p>
            </div>
        );
    }

    if (state.status === "unavailable") {
        return <TableUnavailablePage reason={state.reason} message={state.message} />;
    }

    return (
        <div className={styles.container}>
            <div className={styles.errorBox}>
                <h1 className={styles.errorTitle}>Ops</h1>
                <p className={styles.errorMessage}>{state.message}</p>
            </div>
        </div>
    );
}
