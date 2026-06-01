import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import PublicCollectionHeader from "@components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader";
import { fetchPublicCatalog } from "@/services/publicCatalog/fetchPublicCatalog";
import { submitReservation } from "@/services/supabase/reservations";
import type { ResolvedStyle } from "@/types/resolvedCollections";
import styles from "./ReservationPage.module.scss";

// Branded reservation request form served on `/:slug/prenota`. Resolves the
// venue via the public catalog payload (theme + name + cover + status +
// enable_reservations + phone for the disabled-state fallback CTA), then
// submits via the `submit-reservation` edge function service wrapper.

type Brand = {
    brandName: string;
    resolvedStyle: ResolvedStyle | null;
    tenantLogoUrl: string | null;
    coverImage: string | null;
    phone: string | null;
    phonePublic: boolean;
};

type ResolveState =
    | { status: "loading" }
    | { status: "not-found" }
    | { status: "network-error" }
    | { status: "inactive"; brand: Brand | null }
    | { status: "reservations-disabled"; brand: Brand }
    | { status: "ready"; brand: Brand };

type FormFields = {
    reservation_date: string;
    reservation_time: string;
    party_size: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes: string;
};

const EMPTY_FORM: FormFields = {
    reservation_date: "",
    reservation_time: "",
    party_size: "2",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: ""
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const PARTY_PILL_VALUES = ["2", "3", "4", "5", "6", "7+"] as const;

function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Field-level client validation. Mirror of submit-reservation edge guards so
// the customer doesn't discover problems only after submit.
function validateField(name: keyof FormFields, value: string): string | null {
    const v = value.trim();
    if (name === "reservation_date") {
        if (!v || !DATE_RE.test(v)) return "Inserisci una data valida.";
        if (v < todayIsoDate()) return "La data non può essere nel passato.";
        return null;
    }
    if (name === "reservation_time") {
        if (!v || !TIME_RE.test(v)) return "Inserisci un orario valido.";
        return null;
    }
    if (name === "party_size") {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
            return "Numero di persone tra 1 e 50.";
        }
        return null;
    }
    if (name === "customer_name") {
        if (!v) return "Il nome è obbligatorio.";
        if (v.length > 200) return "Il nome è troppo lungo.";
        return null;
    }
    if (name === "customer_email") {
        if (!v) return "L'email è obbligatoria.";
        if (!EMAIL_RE.test(v) || v.length > 320) return "Inserisci un'email valida.";
        return null;
    }
    if (name === "customer_phone") {
        if (!v) return "Il telefono è obbligatorio.";
        if (v.length > 50) return "Il telefono è troppo lungo.";
        return null;
    }
    if (name === "notes") {
        if (v.length > 500) return "Massimo 500 caratteri.";
        return null;
    }
    return null;
}

type Phase = "form" | "submitting" | "success";

function CheckIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M5 12.5l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function CalendarOffIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 3v4M16 3v4M3 9h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 18l12-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export default function ReservationPage() {
    const { slug } = useParams<{ slug: string }>();
    const [resolve, setResolve] = useState<ResolveState>({ status: "loading" });
    const [form, setForm] = useState<FormFields>(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("form");

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
                phonePublic: business.phone_public ?? false
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

    const handleChange = useCallback(
        (name: keyof FormFields, value: string) => {
            setForm(prev => ({ ...prev, [name]: value }));
            setFieldErrors(prev => {
                if (!(name in prev)) return prev;
                const next = { ...prev };
                delete next[name];
                return next;
            });
        },
        []
    );

    const handleBlur = useCallback(
        (name: keyof FormFields) => {
            const err = validateField(name, form[name]);
            setFieldErrors(prev => ({ ...prev, [name]: err ?? undefined }));
        },
        [form]
    );

    const minDate = useMemo(() => todayIsoDate(), []);

    // ── Party-size pills ─────────────────────────────────────────────────
    // pills 2/3/4/5/6 set party_size to that value. "7+" enables a numeric
    // input for the exact count (>=7, <=50) so groups beyond 6 can be sent.
    const currentPartyNum = Number(form.party_size);
    const isExplicitPill =
        Number.isInteger(currentPartyNum) &&
        currentPartyNum >= 2 &&
        currentPartyNum <= 6;
    const isOpenSeven = !isExplicitPill && currentPartyNum >= 7;

    const handlePartyPill = useCallback(
        (val: string) => {
            if (val === "7+") {
                handleChange("party_size", "7");
            } else {
                handleChange("party_size", val);
            }
        },
        [handleChange]
    );

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (resolve.status !== "ready" || !slug) return;

            // Run full validation pass before submit.
            const next: Partial<Record<keyof FormFields, string>> = {};
            (Object.keys(form) as (keyof FormFields)[]).forEach(k => {
                const err = validateField(k, form[k]);
                if (err) next[k] = err;
            });
            setFieldErrors(next);
            if (Object.values(next).some(v => v)) return;

            setSubmitError(null);
            setPhase("submitting");
            try {
                await submitReservation({
                    slug,
                    reservation_date: form.reservation_date.trim(),
                    reservation_time: form.reservation_time.trim(),
                    party_size: Number(form.party_size),
                    customer_name: form.customer_name.trim(),
                    customer_email: form.customer_email.trim(),
                    customer_phone: form.customer_phone.trim(),
                    ...(form.notes.trim() ? { notes: form.notes.trim() } : {})
                });
                setPhase("success");
            } catch (err) {
                const code = (err as Error & { code?: string }).code ?? "SERVER_ERROR";
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
                    return;
                }
                const message =
                    (err as Error).message && (err as Error).message !== code
                        ? (err as Error).message
                        : "Si è verificato un errore. Riprova tra qualche istante.";
                setSubmitError(message);
                setPhase("form");
            }
        },
        [resolve, slug, form]
    );

    // ── Simple states without branding ────────────────────────────────────

    if (resolve.status === "loading") {
        return (
            <div className={styles.page}>
                <p className={styles.pageMessage}>Caricamento…</p>
            </div>
        );
    }

    if (resolve.status === "not-found") {
        return (
            <div className={styles.page}>
                <div className={`${styles.container} ${styles.containerTop}`}>
                    <div className={styles.stateCard}>
                        <h1 className={styles.stateTitle}>Pagina non trovata</h1>
                        <p className={styles.stateText}>
                            La sede che stai cercando non esiste o ha cambiato indirizzo.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (resolve.status === "network-error") {
        return (
            <div className={styles.page}>
                <div className={`${styles.container} ${styles.containerTop}`}>
                    <div className={styles.stateCard}>
                        <h1 className={styles.stateTitle}>Caricamento non riuscito</h1>
                        <p className={styles.stateText}>
                            Verifica la connessione e ricarica la pagina.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Branded states (need PublicThemeScope) ────────────────────────────

    const brand = resolve.brand!;
    const showPhoneCta =
        resolve.status === "reservations-disabled" &&
        brand.phonePublic &&
        brand.phone != null &&
        brand.phone.trim().length > 0;

    return (
        <PublicThemeScope style={brand.resolvedStyle}>
            <main className={styles.page}>
                <PublicCollectionHeader
                    logoUrl={brand.tenantLogoUrl}
                    activityName={brand.brandName}
                    catalogName="Prenotazione"
                    showCatalogName
                    coverImageUrl={brand.coverImage}
                    showCoverImage
                    showLogo
                    mode="public"
                    showHubTabs={false}
                    showLanguageSelector={false}
                    actionSlot={
                        <Link to={`/${slug}`} className={styles.headerActionLink}>
                            Menu
                        </Link>
                    }
                />

                {/* ── Inactive state ─────────────────────────────────────── */}
                {resolve.status === "inactive" && (
                    <div className={styles.container}>
                        <div className={styles.stateCard}>
                            <div className={styles.stateIcon}>
                                <CalendarOffIcon />
                            </div>
                            <h1 className={styles.stateTitle}>Sede non disponibile</h1>
                            <p className={styles.stateText}>
                                {brand.brandName} non è al momento attivo sulla piattaforma.
                            </p>
                            <div className={styles.stateActions}>
                                <Link to={`/${slug}`} className={styles.linkButtonSecondary}>
                                    Torna al menu
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Reservations-disabled state ────────────────────────── */}
                {resolve.status === "reservations-disabled" && (
                    <div className={styles.container}>
                        <div className={styles.stateCard}>
                            <div className={styles.stateIcon}>
                                <CalendarOffIcon />
                            </div>
                            <h1 className={styles.stateTitle}>Prenotazioni non attive</h1>
                            <p className={styles.stateText}>
                                {brand.brandName} non accetta prenotazioni online al momento.
                                {showPhoneCta
                                    ? " Puoi chiamare direttamente il locale per richiedere un tavolo."
                                    : " Per richiedere un tavolo contatta direttamente la sede."}
                            </p>
                            <div className={styles.stateActions}>
                                {showPhoneCta && (
                                    <a
                                        href={`tel:${brand.phone}`}
                                        className={styles.linkButton}
                                    >
                                        Chiama il locale
                                    </a>
                                )}
                                <Link to={`/${slug}`} className={styles.linkButtonSecondary}>
                                    Torna al menu
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Ready: success or form ─────────────────────────────── */}
                {resolve.status === "ready" && phase === "success" && (
                    <div className={styles.container}>
                        <div className={styles.stateCard}>
                            <div className={styles.stateIcon}>
                                <CheckIcon />
                            </div>
                            <h1 className={styles.stateTitle}>Richiesta inviata</h1>
                            <p className={styles.stateText}>
                                Abbiamo ricevuto la tua richiesta di prenotazione presso {brand.brandName}.
                                Riceverai una conferma via email non appena la sede approverà.
                            </p>
                            <div className={styles.stateActions}>
                                <Link to={`/${slug}`} className={styles.linkButton}>
                                    Torna al menu
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {resolve.status === "ready" && phase !== "success" && (
                    <div className={styles.container}>
                        <div className={styles.intro}>
                            <p className={styles.eyebrow}>Prenotazione</p>
                            <h1 className={styles.title}>Prenota un tavolo</h1>
                            <p className={styles.subtitle}>
                                Compila il modulo, riceverai una conferma via email.
                            </p>
                        </div>

                        {submitError && (
                            <div className={styles.bannerError} role="alert">
                                {submitError}
                            </div>
                        )}

                        <form
                            className={styles.card}
                            onSubmit={handleSubmit}
                            noValidate
                            aria-busy={phase === "submitting"}
                        >
                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label htmlFor="reservation_date" className={styles.label}>
                                        Data
                                    </label>
                                    <input
                                        id="reservation_date"
                                        type="date"
                                        required
                                        className={styles.input}
                                        value={form.reservation_date}
                                        min={minDate}
                                        onChange={e => handleChange("reservation_date", e.target.value)}
                                        onBlur={() => handleBlur("reservation_date")}
                                        aria-invalid={fieldErrors.reservation_date ? "true" : undefined}
                                        aria-describedby={
                                            fieldErrors.reservation_date ? "err-reservation_date" : undefined
                                        }
                                    />
                                    {fieldErrors.reservation_date && (
                                        <span id="err-reservation_date" className={styles.fieldError}>
                                            {fieldErrors.reservation_date}
                                        </span>
                                    )}
                                </div>
                                <div className={styles.field}>
                                    <label htmlFor="reservation_time" className={styles.label}>
                                        Ora
                                    </label>
                                    <input
                                        id="reservation_time"
                                        type="time"
                                        required
                                        className={styles.input}
                                        value={form.reservation_time}
                                        onChange={e => handleChange("reservation_time", e.target.value)}
                                        onBlur={() => handleBlur("reservation_time")}
                                        aria-invalid={fieldErrors.reservation_time ? "true" : undefined}
                                        aria-describedby={
                                            fieldErrors.reservation_time ? "err-reservation_time" : undefined
                                        }
                                    />
                                    {fieldErrors.reservation_time && (
                                        <span id="err-reservation_time" className={styles.fieldError}>
                                            {fieldErrors.reservation_time}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className={styles.field}>
                                <span className={styles.label}>Persone</span>
                                <div className={styles.partyPills} role="group" aria-label="Persone">
                                    {PARTY_PILL_VALUES.map(v => {
                                        const isActive =
                                            v === "7+"
                                                ? isOpenSeven
                                                : form.party_size === v && isExplicitPill;
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                className={`${styles.partyPill} ${
                                                    isActive ? styles.partyPillActive : ""
                                                }`}
                                                onClick={() => handlePartyPill(v)}
                                                aria-pressed={isActive}
                                            >
                                                {v}
                                            </button>
                                        );
                                    })}
                                </div>
                                {isOpenSeven && (
                                    <div className={styles.partyPlusField}>
                                        <label htmlFor="party_size_exact" className={styles.label}>
                                            <span className={styles.labelHint}>Indica il numero esatto</span>
                                        </label>
                                        <input
                                            id="party_size_exact"
                                            type="number"
                                            min={7}
                                            max={50}
                                            required
                                            className={styles.input}
                                            value={form.party_size}
                                            onChange={e => handleChange("party_size", e.target.value)}
                                            onBlur={() => handleBlur("party_size")}
                                            aria-invalid={fieldErrors.party_size ? "true" : undefined}
                                            aria-describedby={
                                                fieldErrors.party_size ? "err-party_size" : undefined
                                            }
                                        />
                                    </div>
                                )}
                                {fieldErrors.party_size && (
                                    <span id="err-party_size" className={styles.fieldError}>
                                        {fieldErrors.party_size}
                                    </span>
                                )}
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="customer_name" className={styles.label}>
                                    Nome e cognome
                                </label>
                                <input
                                    id="customer_name"
                                    type="text"
                                    required
                                    autoComplete="name"
                                    className={styles.input}
                                    value={form.customer_name}
                                    onChange={e => handleChange("customer_name", e.target.value)}
                                    onBlur={() => handleBlur("customer_name")}
                                    aria-invalid={fieldErrors.customer_name ? "true" : undefined}
                                    aria-describedby={
                                        fieldErrors.customer_name ? "err-customer_name" : undefined
                                    }
                                />
                                {fieldErrors.customer_name && (
                                    <span id="err-customer_name" className={styles.fieldError}>
                                        {fieldErrors.customer_name}
                                    </span>
                                )}
                            </div>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label htmlFor="customer_email" className={styles.label}>
                                        Email
                                    </label>
                                    <input
                                        id="customer_email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        className={styles.input}
                                        value={form.customer_email}
                                        onChange={e => handleChange("customer_email", e.target.value)}
                                        onBlur={() => handleBlur("customer_email")}
                                        aria-invalid={fieldErrors.customer_email ? "true" : undefined}
                                        aria-describedby={
                                            fieldErrors.customer_email ? "err-customer_email" : undefined
                                        }
                                    />
                                    {fieldErrors.customer_email && (
                                        <span id="err-customer_email" className={styles.fieldError}>
                                            {fieldErrors.customer_email}
                                        </span>
                                    )}
                                </div>
                                <div className={styles.field}>
                                    <label htmlFor="customer_phone" className={styles.label}>
                                        Telefono
                                    </label>
                                    <input
                                        id="customer_phone"
                                        type="tel"
                                        required
                                        autoComplete="tel"
                                        className={styles.input}
                                        value={form.customer_phone}
                                        onChange={e => handleChange("customer_phone", e.target.value)}
                                        onBlur={() => handleBlur("customer_phone")}
                                        aria-invalid={fieldErrors.customer_phone ? "true" : undefined}
                                        aria-describedby={
                                            fieldErrors.customer_phone ? "err-customer_phone" : undefined
                                        }
                                    />
                                    {fieldErrors.customer_phone && (
                                        <span id="err-customer_phone" className={styles.fieldError}>
                                            {fieldErrors.customer_phone}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="notes" className={styles.label}>
                                    Note <span className={styles.labelHint}>(facoltativo)</span>
                                </label>
                                <textarea
                                    id="notes"
                                    rows={3}
                                    maxLength={500}
                                    className={styles.textarea}
                                    value={form.notes}
                                    onChange={e => handleChange("notes", e.target.value)}
                                    onBlur={() => handleBlur("notes")}
                                    aria-invalid={fieldErrors.notes ? "true" : undefined}
                                    aria-describedby={fieldErrors.notes ? "err-notes" : undefined}
                                    placeholder="Allergie, esigenze particolari, occasioni speciali…"
                                />
                                {fieldErrors.notes && (
                                    <span id="err-notes" className={styles.fieldError}>
                                        {fieldErrors.notes}
                                    </span>
                                )}
                            </div>

                            <button
                                type="submit"
                                className={styles.submit}
                                disabled={phase === "submitting"}
                            >
                                {phase === "submitting" ? "Invio in corso…" : "Invia richiesta"}
                            </button>

                            <p className={styles.privacy}>
                                Inviando la richiesta accetti il trattamento dei dati per gestire la prenotazione.{" "}
                                <Link to="/legal/privacy">Privacy</Link>
                            </p>
                        </form>
                    </div>
                )}

            </main>
        </PublicThemeScope>
    );
}
