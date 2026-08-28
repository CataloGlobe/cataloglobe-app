import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import { usePageHead } from "@/hooks/usePageHead";
import { usePublicLanguageSync } from "@/hooks/usePublicLanguageSync";
import { usePublicFontInjection } from "@/hooks/usePublicFontInjection";
import { fetchPublicCatalog } from "@/services/publicCatalog/fetchPublicCatalog";
import {
    cancelReservationByCustomer,
    readReservationCancellation,
    type ReservationCancellationSummary
} from "@/services/supabase/reservations";
import type { ResolvedStyle } from "@/types/resolvedCollections";
import ReservationHeader from "./ReservationHeader";
import ReservationRecap from "./ReservationRecap";
import StateCard from "./StateCard";
import { CalendarOffIcon, CheckIcon, SearchOffIcon } from "./icons";
import pageStyles from "./ReservationPage.module.scss";
import styles from "./ReservationCancelPage.module.scss";

// Pagina raggiunta dal link firmato nelle email al cliente:
// `/:slug/prenotazione/annulla?token=…` (con variante `/:slug/:lang/…`).
//
// Il caricamento NON annulla nulla. Mostra il riepilogo e chiede conferma
// esplicita, perché le email si aprono per sbaglio, si inoltrano, e alcuni
// client di posta precaricano i link per generarne l'anteprima. Un
// annullamento al primo GET sarebbe un guaio silenzioso.
//
// Il `can_cancel` che arriva dalla lettura serve solo a decidere cosa
// disegnare: la decisione vera la prende l'edge, che ricalcola il limite
// temporale dai dati della riga ad ogni chiamata.

/** Recuperato dal catalogo pubblico: serve solo a vestire la pagina. */
type Branding = {
    brandName: string;
    resolvedStyle: ResolvedStyle | null;
    tenantLogoUrl: string | null;
    coverImage: string | null;
};

type ViewState =
    | { kind: "loading" }
    /** Token assente, malformato, firma non valida o prenotazione inesistente:
     *  un solo stato, perché l'edge non distingue i casi e non deve. */
    | { kind: "invalid" }
    | { kind: "network-error" }
    | { kind: "summary"; summary: ReservationCancellationSummary }
    | { kind: "cancelled"; summary: ReservationCancellationSummary; justNow: boolean }
    | { kind: "window-closed"; summary: ReservationCancellationSummary }
    | { kind: "not-cancellable"; summary: ReservationCancellationSummary };

/**
 * Impedisce che il token finisca nell'header `Referer` di eventuali richieste
 * verso terzi partite da questa pagina.
 *
 * `vercel.json` imposta già `strict-origin-when-cross-origin` per tutto il
 * sito, che cross-origin invia solo l'origin — quindi la query string non
 * uscirebbe comunque. Questo meta è difesa in profondità: vale anche se un
 * domani quella intestazione della CDN cambia o la pagina viene servita
 * altrove.
 */
function useNoReferrer(): void {
    useEffect(() => {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "referrer");
        meta.setAttribute("content", "no-referrer");
        document.head.appendChild(meta);
        return () => {
            document.head.removeChild(meta);
        };
    }, []);
}

function errorCodeOf(err: unknown): string {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : "SERVER_ERROR";
}

function errorDetailsOf(err: unknown): Record<string, unknown> {
    const details = (err as { details?: unknown } | null)?.details;
    return details && typeof details === "object" ? (details as Record<string, unknown>) : {};
}

export default function ReservationCancelPage() {
    const { slug, lang } = useParams<{ slug: string; lang?: string }>();
    const [searchParams] = useSearchParams();
    const { t, i18n } = useTranslation("public");
    usePublicLanguageSync();
    useNoReferrer();

    const token = searchParams.get("token")?.trim() ?? "";
    const [view, setView] = useState<ViewState>({ kind: "loading" });
    const [branding, setBranding] = useState<Branding | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // ── Branding (best effort) ────────────────────────────────────────────
    // Se il catalogo non risponde la pagina resta neutra ma funzionante: la
    // disdetta non deve dipendere dal tema.
    useEffect(() => {
        let cancelled = false;
        if (!slug) return;
        (async () => {
            const result = await fetchPublicCatalog({ slug });
            if (cancelled || result.kind !== "success") return;
            const payload = result.payload as {
                business?: { name?: string; cover_image?: string | null };
                tenantLogoUrl?: string | null;
                resolved?: { style?: ResolvedStyle | null };
            };
            if (!payload.business?.name) return;
            setBranding({
                brandName: payload.business.name,
                resolvedStyle: payload.resolved?.style ?? null,
                tenantLogoUrl: payload.tenantLogoUrl ?? null,
                coverImage: payload.business.cover_image ?? null
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [slug]);

    // ── Lettura: nessuna scrittura, nessun effetto ────────────────────────
    useEffect(() => {
        let cancelled = false;
        if (token.length === 0) {
            setView({ kind: "invalid" });
            return;
        }
        (async () => {
            try {
                const result = await readReservationCancellation(token);
                if (cancelled) return;
                setView(summaryToView(result.reservation, false));
            } catch (err) {
                if (cancelled) return;
                setView(errorCodeOf(err) === "INVALID_LINK" ? { kind: "invalid" } : { kind: "network-error" });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleCancel = useCallback(async () => {
        if (isCancelling) return;
        setIsCancelling(true);
        setActionError(null);
        try {
            const result = await cancelReservationByCustomer(token);
            setView({
                kind: "cancelled",
                summary: result.reservation,
                justNow: !result.already_cancelled
            });
        } catch (err) {
            const code = errorCodeOf(err);
            if (code === "INVALID_LINK") {
                setView({ kind: "invalid" });
            } else if (code === "CANCELLATION_WINDOW_CLOSED") {
                // Il limite è scaduto tra la lettura e la conferma: rileggo il
                // telefono dai details invece di fidarmi di quanto mostrato.
                const phone = errorDetailsOf(err).venue_phone;
                setView(prev =>
                    "summary" in prev
                        ? {
                              kind: "window-closed",
                              summary: {
                                  ...prev.summary,
                                  can_cancel: false,
                                  venue_phone: typeof phone === "string" ? phone : null
                              }
                          }
                        : prev
                );
            } else if (code === "NOT_CANCELLABLE") {
                setView(prev =>
                    "summary" in prev
                        ? { kind: "not-cancellable", summary: { ...prev.summary, can_cancel: false } }
                        : prev
                );
            } else {
                setActionError(
                    code === "RATE_LIMITED" ? t("reservation.cancel.rate_limited_text") : t("reservation.cancel.error_text")
                );
            }
        } finally {
            setIsCancelling(false);
        }
    }, [isCancelling, t, token]);

    const brandName = branding?.brandName ?? summaryOf(view)?.venue_name ?? null;
    usePageHead({
        title: brandName ? t("reservation.cancel.doc_title", { brand: brandName }) : t("reservation.cancel.title")
    });
    usePublicFontInjection(branding?.resolvedStyle ?? null);

    if (view.kind === "loading") {
        return <AppLoader intent="public" message={t("reservation.cancel.loading")} />;
    }

    const backHref = lang ? `/${slug}/${lang}` : `/${slug}`;
    const backAction = { kind: "secondary-link" as const, to: backHref, label: t("reservation.back_to_menu") };
    const locale = i18n.language || "it";

    // Nessuno stato senza via d'uscita: se il numero non è pubblico (o non c'è)
    // si dice comunque cosa fare, invece di lasciare un divieto e basta.
    const phoneBlock = (summary: ReservationCancellationSummary, textKey: string) => {
        const phone = summary.venue_phone;
        const hasPhone = typeof phone === "string" && phone.trim().length > 0;
        return {
            text: (
                <>
                    {t(textKey)}{" "}
                    {hasPhone ? t("reservation.cancel.closed_call") : t("reservation.cancel.closed_contact")}
                </>
            ),
            actions: [
                ...(hasPhone
                    ? [{ kind: "primary-tel" as const, phone: phone as string, label: t("reservation.call_venue") }]
                    : []),
                backAction
            ]
        };
    };

    let content: React.ReactNode;

    if (view.kind === "invalid") {
        content = (
            <StateCard
                icon={<SearchOffIcon />}
                title={t("reservation.cancel.invalid_title")}
                text={t("reservation.cancel.invalid_text")}
                actions={[backAction]}
            />
        );
    } else if (view.kind === "network-error") {
        content = (
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.cancel.error_title")}
                text={t("reservation.cancel.error_text")}
                actions={[backAction]}
            />
        );
    } else if (view.kind === "cancelled") {
        content = (
            <div className={styles.card}>
                <div className={`${styles.icon} ${styles.iconDone}`}>
                    <CheckIcon size={30} />
                </div>
                <h1 className={styles.title}>
                    {t(view.justNow ? "reservation.cancel.done_title" : "reservation.cancel.already_title")}
                </h1>
                <p className={styles.lead}>
                    {t(view.justNow ? "reservation.cancel.done_text" : "reservation.cancel.already_text")}
                </p>
                <ReservationRecap
                    locale={locale}
                    venueName={view.summary.venue_name}
                    reservationDate={view.summary.reservation_date}
                    reservationTime={view.summary.reservation_time}
                    partySize={view.summary.party_size}
                    customerName={view.summary.customer_name}
                />
                <Link to={backHref} className={styles.secondaryCta}>
                    {t("reservation.back_to_menu")}
                </Link>
            </div>
        );
    } else if (view.kind === "window-closed") {
        const { text, actions } = phoneBlock(view.summary, "reservation.cancel.closed_text");
        content = (
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.cancel.closed_title")}
                text={text}
                actions={actions}
            />
        );
    } else if (view.kind === "not-cancellable") {
        const { text, actions } = phoneBlock(view.summary, "reservation.cancel.not_cancellable_text");
        content = (
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.cancel.not_cancellable_title")}
                text={text}
                actions={actions}
            />
        );
    } else {
        content = (
            <div className={styles.card}>
                <h1 className={styles.title}>{t("reservation.cancel.confirm_title")}</h1>
                <p className={styles.lead}>{t("reservation.cancel.confirm_text")}</p>
                <ReservationRecap
                    locale={locale}
                    venueName={view.summary.venue_name}
                    reservationDate={view.summary.reservation_date}
                    reservationTime={view.summary.reservation_time}
                    partySize={view.summary.party_size}
                    customerName={view.summary.customer_name}
                />
                {actionError && (
                    <p className={styles.error} role="alert">
                        {actionError}
                    </p>
                )}
                <button
                    type="button"
                    className={styles.dangerCta}
                    onClick={handleCancel}
                    disabled={isCancelling}
                >
                    {isCancelling
                        ? t("reservation.cancel.confirming")
                        : t("reservation.cancel.confirm_button")}
                </button>
                <Link to={backHref} className={styles.secondaryCta}>
                    {t("reservation.cancel.keep_button")}
                </Link>
            </div>
        );
    }

    const body = <div className={pageStyles.stateWrapper}>{content}</div>;

    if (!branding) {
        return <div className={pageStyles.neutralPage}>{body}</div>;
    }

    return (
        <PublicThemeScope style={branding.resolvedStyle}>
            <main className={pageStyles.page}>
                <ReservationHeader
                    brandName={branding.brandName}
                    tenantLogoUrl={branding.tenantLogoUrl}
                    coverImage={branding.coverImage}
                    backHref={backHref}
                />
                <div className={pageStyles.body}>{body}</div>
            </main>
        </PublicThemeScope>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function summaryOf(view: ViewState): ReservationCancellationSummary | null {
    return "summary" in view ? view.summary : null;
}

/** Traduce il riepilogo dell'edge nello stato che la pagina deve disegnare. */
function summaryToView(summary: ReservationCancellationSummary, justNow: boolean): ViewState {
    if (summary.status === "cancelled") {
        return { kind: "cancelled", summary, justNow };
    }
    if (summary.can_cancel) {
        return { kind: "summary", summary };
    }
    // `can_cancel` false ha due cause: lo stato non è annullabile, oppure il
    // limite temporale è passato. Solo pending/confirmed sono annullabili.
    return summary.status === "pending" || summary.status === "confirmed"
        ? { kind: "window-closed", summary }
        : { kind: "not-cancellable", summary };
}

