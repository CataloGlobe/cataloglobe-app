import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import LanguageSelectorView from "@components/PublicCollectionView/LanguageSelector/LanguageSelectorView";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import { usePageHead } from "@/hooks/usePageHead";
import { usePublicLanguageSync } from "@/hooks/usePublicLanguageSync";
import { fetchPublicCatalog } from "@/services/publicCatalog/fetchPublicCatalog";
import type { SubmitReservationStatus } from "@/services/supabase/reservations";
import type { AvailableLanguage } from "@context/Language/LanguageContext";
import type { ResolvedStyle } from "@/types/resolvedCollections";
import ReservationHeader from "./ReservationHeader";
import ReservationForm from "./ReservationForm";
import StateCard from "./StateCard";
import SuccessRecap from "./SuccessRecap";
import { CalendarOffIcon, SearchOffIcon, WifiOffIcon } from "./icons";
import type { Brand, FormFields, ResolveState } from "./types";
import styles from "./ReservationPage.module.scss";

// Branded reservation request form served on `/:slug/prenota`. Resolves the
// venue via the public catalog payload (theme + name + cover + status +
// enable_reservations + phone for the disabled-state fallback CTA).

export default function ReservationPage() {
    const { slug, lang } = useParams<{ slug: string; lang?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation("public");
    // Fase 1: applica la lingua dall'URL (segmento `:lang` sulla route
    // lang-aware `/:slug/:lang/prenota`; assente sulla base → default "it").
    usePublicLanguageSync();
    const [resolve, setResolve] = useState<ResolveState>({ status: "loading" });
    const [successSnapshot, setSuccessSnapshot] = useState<FormFields | null>(null);
    const [successStatus, setSuccessStatus] = useState<SubmitReservationStatus>("pending");

    useEffect(() => {
        let cancelled = false;
        if (!slug) {
            setResolve({ status: "not-found" });
            return;
        }
        (async () => {
            const result = await fetchPublicCatalog({ slug });
            if (cancelled) return;
            if (result.kind === "domain_error") {
                if (result.code === "not_found" || result.code === "tenant_not_found") {
                    setResolve({ status: "not-found" });
                    return;
                }
                setResolve({ status: "network-error" });
                return;
            }
            if (result.kind === "network_error") {
                setResolve({ status: "network-error" });
                return;
            }
            const payload = result.payload as {
                business?: {
                    name?: string;
                    status?: string;
                    enable_reservations?: boolean;
                    cover_image?: string | null;
                    phone?: string | null;
                    phone_public?: boolean;
                };
                tenantLogoUrl?: string | null;
                resolved?: { style?: ResolvedStyle | null };
                opening_hours?: Brand["hours"];
                upcoming_closures?: Brand["closures"];
                // Già nel payload di resolve-public-catalog (serve al selettore
                // lingua): lista lingue attive + lingua base del tenant.
                available_languages?: AvailableLanguage[];
                base_language_code?: string | null;
            };
            const business = payload.business;
            if (!business || !business.name) {
                setResolve({ status: "not-found" });
                return;
            }
            const brand: Brand = {
                brandName: business.name,
                resolvedStyle: payload.resolved?.style ?? null,
                tenantLogoUrl: payload.tenantLogoUrl ?? null,
                coverImage: business.cover_image ?? null,
                phone: business.phone ?? null,
                phonePublic: business.phone_public ?? false,
                hours: payload.opening_hours ?? [],
                closures: payload.upcoming_closures ?? [],
                languages: payload.available_languages ?? [],
                baseLanguage: payload.base_language_code ?? "it"
            };
            if (business.status !== "active") {
                setResolve({ status: "inactive", brand });
                return;
            }
            if ((business.enable_reservations ?? false) !== true) {
                setResolve({ status: "reservations-disabled", brand });
                return;
            }
            setResolve({ status: "ready", brand });
        })();
        return () => {
            cancelled = true;
        };
    }, [slug]);

    const handleSuccess = useCallback(
        (snapshot: FormFields, status: SubmitReservationStatus) => {
            setSuccessSnapshot(snapshot);
            setSuccessStatus(status);
        },
        []
    );

    // Document <title>: aligned with the public menu's pattern via
    // usePageHead — venue name first, descriptor after (matches
    // PublicCollectionPage `${name} · Menu`).
    const brandNameForTitle: string | null =
        resolve.status === "ready" || resolve.status === "reservations-disabled"
            ? resolve.brand.brandName
            : resolve.status === "inactive"
                ? resolve.brand?.brandName ?? null
                : null;
    const pageTitle =
        resolve.status === "loading"
            ? undefined
            : brandNameForTitle
                ? t("reservation.doc_title", { brand: brandNameForTitle })
                : t("reservation.title");
    usePageHead({ title: pageTitle });

    const handleResolveErrorCode = useCallback(
        (code: "ACTIVITY_NOT_FOUND" | "ACTIVITY_NOT_ACTIVE" | "RESERVATIONS_DISABLED") => {
            if (code === "ACTIVITY_NOT_FOUND") {
                setResolve({ status: "not-found" });
                return;
            }
            if (code === "ACTIVITY_NOT_ACTIVE") {
                setResolve(prev =>
                    prev.status === "ready"
                        ? { status: "inactive", brand: prev.brand }
                        : prev
                );
                return;
            }
            if (code === "RESERVATIONS_DISABLED") {
                setResolve(prev =>
                    prev.status === "ready"
                        ? { status: "reservations-disabled", brand: prev.brand }
                        : prev
                );
            }
        },
        []
    );

    // ── Loading: reuse AppLoader, override copy (not the menu loader) ─────
    if (resolve.status === "loading") {
        return <AppLoader intent="public" message={t("reservation.loading")} />;
    }

    // ── Not-found / network-error: no brand resolved, use neutral page ────
    if (resolve.status === "not-found") {
        return (
            <div className={styles.neutralPage}>
                <div className={styles.stateWrapper}>
                    <StateCard
                        icon={<SearchOffIcon />}
                        title={t("reservation.notfound_title")}
                        text={t("reservation.notfound_text")}
                        actions={[]}
                    />
                </div>
            </div>
        );
    }

    if (resolve.status === "network-error") {
        return (
            <div className={styles.neutralPage}>
                <div className={styles.stateWrapper}>
                    <StateCard
                        icon={<WifiOffIcon />}
                        title={t("reservation.error_title")}
                        text={t("reservation.error_text")}
                        actions={[]}
                    />
                </div>
            </div>
        );
    }

    // ── Branded states ────────────────────────────────────────────────────
    const brand = resolve.brand!;
    // Lingua preservata dal segmento URL (`:lang` sulla route lang-aware;
    // assente sulla base → torna al menu in lingua base).
    const backHref = lang ? `/${slug}/${lang}` : `/${slug}`;
    const isSuccess =
        resolve.status === "ready" && successSnapshot !== null;

    // Lingua corrente dal segmento URL (normalizzata lowercase); assente sulla
    // route base → lingua base del tenant. Provider-free: il cambio naviga sul
    // segmento e `usePublicLanguageSync` applica `i18n.changeLanguage` (writer
    // unico, nessun secondo writer → nessun loop).
    const currentLang = (lang ?? brand.baseLanguage).toLowerCase();
    const languageSelector = (
        <LanguageSelectorView
            languages={brand.languages}
            currentLang={currentLang}
            variant="solid"
            onSelect={(code) => {
                const url = code === brand.baseLanguage
                    ? `/${slug}/prenota`
                    : `/${slug}/${code}/prenota`;
                navigate(url);
            }}
        />
    );

    return (
        <PublicThemeScope style={brand.resolvedStyle}>
            <main className={styles.page}>
                <ReservationHeader
                    brandName={brand.brandName}
                    tenantLogoUrl={brand.tenantLogoUrl}
                    coverImage={brand.coverImage}
                    backHref={backHref}
                    rightSlot={languageSelector}
                />

                <div className={styles.body}>
                    {resolve.status === "inactive" && (
                        <div className={styles.stateWrapper}>
                            <StateCard
                                icon={<CalendarOffIcon />}
                                title={t("reservation.inactive_title")}
                                text={t("reservation.inactive_text", { brand: brand.brandName })}
                                actions={[
                                    { kind: "secondary-link", to: backHref, label: t("reservation.back_to_menu") }
                                ]}
                            />
                        </div>
                    )}

                    {resolve.status === "reservations-disabled" && (
                        <ReservationsDisabled
                            brandName={brand.brandName}
                            phone={brand.phone}
                            phonePublic={brand.phonePublic}
                            backHref={backHref}
                        />
                    )}

                    {resolve.status === "ready" && !isSuccess && slug && (
                        <>
                            <p className={styles.tagline}>
                                {t("reservation.tagline")}
                            </p>
                            <ReservationForm
                                slug={slug}
                                hours={brand.hours}
                                closures={brand.closures}
                                onSuccess={handleSuccess}
                                onResolveErrorCode={handleResolveErrorCode}
                            />
                        </>
                    )}

                    {isSuccess && successSnapshot && slug && (
                        <SuccessRecap
                            backHref={backHref}
                            brandName={brand.brandName}
                            snapshot={successSnapshot}
                            status={successStatus}
                        />
                    )}
                </div>
            </main>
        </PublicThemeScope>
    );
}

// ── Local helper component for the disabled state ─────────────────────────

function ReservationsDisabled({
    brandName,
    phone,
    phonePublic,
    backHref
}: {
    brandName: string;
    phone: string | null;
    phonePublic: boolean;
    backHref: string;
}) {
    const { t } = useTranslation("public");
    const showPhoneCta =
        phonePublic && phone != null && phone.trim().length > 0;

    return (
        <div className={styles.stateWrapper}>
            <StateCard
                icon={<CalendarOffIcon />}
                title={t("reservation.disabled_title")}
                text={
                    <>
                        {t("reservation.disabled_text", { brand: brandName })}
                        {showPhoneCta
                            ? ` ${t("reservation.disabled_call")}`
                            : ` ${t("reservation.disabled_contact")}`}
                    </>
                }
                actions={[
                    ...(showPhoneCta
                        ? [{ kind: "primary-tel" as const, phone: phone as string, label: t("reservation.call_venue") }]
                        : []),
                    { kind: "secondary-link" as const, to: backHref, label: t("reservation.back_to_menu") }
                ]}
            />
        </div>
    );
}
