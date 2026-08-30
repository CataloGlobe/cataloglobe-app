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
    confirmReservationAttendance,
    readReservationAttendance,
    type ReservationAttendanceSummary
} from "@/services/supabase/reservations";
import type { ResolvedStyle } from "@/types/resolvedCollections";
import ReservationHeader from "./ReservationHeader";
import ReservationRecap from "./ReservationRecap";
import StateCard from "./StateCard";
import { CalendarOffIcon, CheckIcon, SearchOffIcon } from "./icons";
import pageStyles from "./ReservationPage.module.scss";
import styles from "./ReservationConfirmPage.module.scss";

// Pagina raggiunta dal pulsante "confermo che vengo" nel promemoria della sera
// prima: `/:slug/prenotazione/conferma?token=…` (con variante `/:slug/:lang/…`).
//
// ── Perché una pagina separata da quella di disdetta ────────────────────────
// La pagina di disdetta è disegnata attorno a un'azione distruttiva: bottone
// in tono di allarme, avviso che l'annullamento è definitivo, uscita di
// sicurezza "no, mantienila". Confermare la presenza è l'affordance opposta —
// un solo tocco, nessuna conseguenza da spiegare, nessuna via di fuga da
// offrire. Condividere una pagina significherebbe ramificare ogni stato su un
// `mode`, e le due schermate non hanno in comune altro che il riepilogo, che
// infatti è già un componente condiviso.
//
// ── Perché serve comunque un tocco ──────────────────────────────────────────
// Confermare non è distruttivo e sarebbe tecnicamente innocuo farlo al
// caricamento. Non si fa lo stesso: i client di posta precaricano i link per
// generare l'anteprima, e una conferma registrata da un prefetch darebbe alla
// sala un segnale che il cliente non ha mai dato. Un segnale falso è peggio di
// nessun segnale.

type Branding = {
    brandName: string;
    resolvedStyle: ResolvedStyle | null;
    tenantLogoUrl: string | null;
    coverImage: string | null;
};

type ViewState =
    | { kind: "loading" }
    | { kind: "invalid" }
    | { kind: "network-error" }
    /** Confermabile: riepilogo + pulsante. */
    | { kind: "ready"; summary: ReservationAttendanceSummary }
    /** Confermata, ora o in precedenza. */
    | { kind: "confirmed"; summary: ReservationAttendanceSummary; justNow: boolean }
    /** Annullata, rifiutata o comunque non più in piedi. */
    | { kind: "not-confirmable"; summary: ReservationAttendanceSummary };

/** Vedi la nota in ReservationCancelPage: difesa in profondità sul Referer. */
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

function summaryToView(summary: ReservationAttendanceSummary, justNow: boolean): ViewState {
    if (summary.guest_confirmed_at) {
        return { kind: "confirmed", summary, justNow };
    }
    return summary.can_confirm
        ? { kind: "ready", summary }
        : { kind: "not-confirmable", summary };
}

export default function ReservationConfirmPage() {
    const { slug, lang } = useParams<{ slug: string; lang?: string }>();
    const [searchParams] = useSearchParams();
    const { t, i18n } = useTranslation("public");
    usePublicLanguageSync();
    useNoReferrer();

    const token = searchParams.get("token")?.trim() ?? "";
    const [view, setView] = useState<ViewState>({ kind: "loading" });
    const [branding, setBranding] = useState<Branding | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

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

    useEffect(() => {
        let cancelled = false;
        if (token.length === 0) {
            setView({ kind: "invalid" });
            return;
        }
        (async () => {
            try {
                const result = await readReservationAttendance(token);
                if (cancelled) return;
                setView(summaryToView(result.reservation, false));
            } catch (err) {
                if (cancelled) return;
                setView(
                    errorCodeOf(err) === "INVALID_LINK"
                        ? { kind: "invalid" }
                        : { kind: "network-error" }
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleConfirm = useCallback(async () => {
        if (isConfirming) return;
        setIsConfirming(true);
        setActionError(null);
        try {
            const result = await confirmReservationAttendance(token);
            setView({
                kind: "confirmed",
                summary: result.reservation,
                justNow: !result.already_confirmed
            });
        } catch (err) {
            const code = errorCodeOf(err);
            if (code === "INVALID_LINK") {
                setView({ kind: "invalid" });
            } else if (code === "NOT_CONFIRMABLE") {
                setView(prev =>
                    "summary" in prev
                        ? { kind: "not-confirmable", summary: { ...prev.summary, can_confirm: false } }
                        : prev
                );
            } else {
                setActionError(
                    code === "RATE_LIMITED"
                        ? t("reservation.confirm.rate_limited_text")
                        : t("reservation.confirm.error_text")
                );
            }
        } finally {
            setIsConfirming(false);
        }
    }, [isConfirming, t, token]);

    const brandName =
        branding?.brandName ?? ("summary" in view ? view.summary.venue_name : null);
    usePageHead({
        title: brandName
            ? t("reservation.confirm.doc_title", { brand: brandName })
            : t("reservation.confirm.title")
    });
    usePublicFontInjection(branding?.resolvedStyle ?? null);

    if (view.kind === "loading") {
        return <AppLoader intent="public" message={t("reservation.confirm.loading")} />;
    }

    const backHref = lang ? `/${slug}/${lang}` : `/${slug}`;
    const backAction = {
        kind: "secondary-link" as const,
        to: backHref,
        label: t("reservation.back_to_menu")
    };
    const locale = i18n.language || "it";

    let content: React.ReactNode;

    if (view.kind === "invalid") {
        content = (
            <StateCard
                icon={<SearchOffIcon />}
                title={t("reservation.confirm.invalid_title")}
                text={t("reservation.confirm.invalid_text")}
                actions={[backAction]}
            />
        );
    } else if (view.kind === "network-error") {
        content = (
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.confirm.error_title")}
                text={t("reservation.confirm.error_text")}
                actions={[backAction]}
            />
        );
    } else if (view.kind === "not-confirmable") {
        content = (
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.confirm.not_confirmable_title")}
                text={t("reservation.confirm.not_confirmable_text")}
                actions={[backAction]}
            />
        );
    } else if (view.kind === "confirmed") {
        content = (
            <div className={styles.card}>
                <div className={`${styles.icon} ${styles.iconDone}`}>
                    <CheckIcon size={30} />
                </div>
                <h1 className={styles.title}>
                    {t(
                        view.justNow
                            ? "reservation.confirm.done_title"
                            : "reservation.confirm.already_title"
                    )}
                </h1>
                <p className={styles.lead}>
                    {t(
                        view.justNow
                            ? "reservation.confirm.done_text"
                            : "reservation.confirm.already_text"
                    )}
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
    } else {
        content = (
            <div className={styles.card}>
                <h1 className={styles.title}>{t("reservation.confirm.ready_title")}</h1>
                <p className={styles.lead}>{t("reservation.confirm.ready_text")}</p>
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
                    className={styles.primaryCta}
                    onClick={handleConfirm}
                    disabled={isConfirming}
                >
                    {isConfirming
                        ? t("reservation.confirm.confirming")
                        : t("reservation.confirm.confirm_button")}
                </button>
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
