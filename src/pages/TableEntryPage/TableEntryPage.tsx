import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resolveTable } from "@/services/supabase/customerSessions";
import { saveCustomerSession } from "@/services/customer/customerSessionStorage";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import styles from "./TableEntryPage.module.scss";

type PageState =
    | { status: "loading" }
    | { status: "error"; message: string };

export default function TableEntryPage() {
    const { qrToken } = useParams<{ qrToken: string }>();
    const navigate = useNavigate();
    const [state, setState] = useState<PageState>({ status: "loading" });

    useEffect(() => {
        if (!qrToken) {
            setState({ status: "error", message: "Codice QR non valido" });
            return;
        }

        let cancelled = false;

        async function bootstrap() {
            try {
                const result = await resolveTable(qrToken!);
                if (cancelled) return;

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
                if (cancelled) return;
                const message =
                    err instanceof Error && err.message
                        ? err.message
                        : "Errore durante l'avvio della sessione. Riprova.";
                setState({ status: "error", message });
            }
        }

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [qrToken, navigate]);

    if (state.status === "loading") {
        return (
            <div className={styles.container}>
                <AppLoader intent="public" showMessage={false} />
                <p className={styles.message}>Avvio della tua sessione...</p>
            </div>
        );
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
