import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import StarRating from "../StarRating/StarRating";
import styles from "./ReviewsView.module.scss";

/* ── Props ───────────────────────────────────────────── */

export type ReviewsViewProps = {
    googleReviewUrl: string | null;
    activityId: string;
    sessionId: string;
    supabaseUrl: string;
    /** Notifica il parent dopo un submit riuscito (per nascondere il FAB). */
    onReviewSubmitted?: () => void;
    /** Voto pre-impostato (dal widget stelle in footer): apre direttamente sulla
     *  schermata "feedback", saltando "stars". Assente → flow normale da "stars". */
    initialRating?: number;
};

/* ── Rating config ──────────────────────────────────── */

type RatingConfig = {
    colorClass: string;
};

const RATING_CONFIG: Record<number, RatingConfig> = {
    1: { colorClass: "ratingRed" },
    2: { colorClass: "ratingOrange" },
    3: { colorClass: "ratingYellow" },
    4: { colorClass: "ratingGreen" },
    5: { colorClass: "ratingGreenDark" },
};

function ratingCategory(rating: number): "positive" | "neutral" | "negative" {
    if (rating >= 4) return "positive";
    if (rating === 3) return "neutral";
    return "negative";
}

type Phase = "stars" | "feedback" | "submitting" | "thanks";

/* ── Google Icon SVG ─────────────────────────────────── */

function GoogleIcon({ size = 24 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

/* ── Component ───────────────────────────────────────── */

export default function ReviewsView({
    googleReviewUrl,
    activityId,
    sessionId,
    supabaseUrl,
    onReviewSubmitted,
    initialRating,
}: ReviewsViewProps) {
    const { t } = useTranslation("public");
    // ── Check se ha già recensito nelle ultime 24h ──────────────────────────
    const [alreadyReviewed] = useState(() => {
        try {
            const ts = localStorage.getItem(`fab_reviewed_${activityId}`);
            return !!ts && (Date.now() - parseInt(ts, 10)) < 24 * 60 * 60 * 1000;
        } catch { return false; }
    });

    // initialRating (dal widget footer) → apre direttamente su "feedback" col voto
    // già selezionato. Il caller (CollectionView) forza il remount dell'istanza con
    // `key` quando initialRating cambia — qui basta l'init lazy, nessun effect di sync.
    const [phase, setPhase] = useState<Phase>(initialRating ? "feedback" : "stars");
    const [selectedStars, setSelectedStars] = useState(initialRating ?? 0);
    const [feedback, setFeedback] = useState("");
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showGoogleCard, setShowGoogleCard] = useState(false);

    const isLowRating = selectedStars >= 1 && selectedStars <= 3;
    const isHighRating = selectedStars >= 4;
    const submitDisabled = isLowRating && feedback.trim().length === 0;

    /* ── Handle star click ──────────────────────────── */
    function handleStarClick(n: number) {
        setSelectedStars(n);
        // Touch device: transizione immediata.
        // Desktop: 300ms delay — breve pausa percettiva prima di passare al form.
        const isTouch = window.matchMedia("(hover: none)").matches;
        if (isTouch) {
            setPhase("feedback");
        } else {
            setTimeout(() => setPhase("feedback"), 300);
        }
    }

    /* ── Handle back ────────────────────────────────── */
    function handleBack() {
        setSelectedStars(0);
        setFeedback("");
        setSubmitError(null);
        setPhase("stars");
    }

    /* ── Submit handler ─────────────────────────────── */
    async function handleSubmit() {
        setSubmitError(null);
        setPhase("submitting");

        try {
            const res = await fetch(`${supabaseUrl}/functions/v1/submit-review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    activity_id: activityId,
                    rating: selectedStars,
                    comment: feedback.trim() || undefined,
                    session_id: sessionId,
                }),
            });

            if (res.ok) {
                const body = await res.json();
                if (body.success) {
                    trackEvent(activityId, "review_submitted", {
                        rating: selectedStars,
                        rating_category: ratingCategory(selectedStars),
                        has_feedback_text: feedback.trim().length > 0
                    });
                    setPhase("thanks");
                    onReviewSubmitted?.();
                    return;
                }
            }

            // Read structured error from edge (Prompt 12: error_code + error legacy).
            let errorCode = "SERVER_ERROR";
            let legacyMessage: string | undefined;
            try {
                const errBody = await res.json();
                if (typeof errBody?.error_code === "string") errorCode = errBody.error_code;
                if (typeof errBody?.error === "string") legacyMessage = errBody.error;
            } catch {
                // body not JSON → keep defaults
            }

            const i18nMessage = t(`reviews.${errorCode}`, {
                ns: "errors",
                defaultValue: legacyMessage ?? t("error_generic", { ns: "common" })
            });
            setSubmitError(i18nMessage);
            setPhase("feedback");
        } catch {
            setSubmitError(t("error_generic", { ns: "common" }));
            setPhase("feedback");
        }
    }

    /* ── Show Google card with delay ────────────────── */
    useEffect(() => {
        if (phase !== "thanks" || !isHighRating || !googleReviewUrl) return;
        const timer = setTimeout(() => setShowGoogleCard(true), 600);
        return () => clearTimeout(timer);
    }, [phase, isHighRating, googleReviewUrl]);

    /* ── Already reviewed in last 24h ─────────────────── */
    if (alreadyReviewed) {
        return (
            <div className={styles.root}>
                <div className={styles.thanksPhase}>
                    <div className={styles.checkCircle}>
                        <svg viewBox="0 0 24 24" className={styles.checkIcon}>
                            <path
                                d="M20 6L9 17l-5-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <h2 className={styles.thanksTitle}>{t("reviews.thanks_title")}</h2>
                    <p className={styles.thanksSubtitle}>
                        {t("reviews.already_reviewed_subtitle")}
                    </p>
                </div>
            </div>
        );
    }

    /* ── PHASE: stars ───────────────────────────────── */
    if (phase === "stars") {
        return (
            <div className={styles.root}>
                <div className={styles.starsPhase}>
                    <h2 className={styles.title}>
                        {t("reviews.title_question")}
                    </h2>
                    <p className={styles.subtitle}>
                        {t("reviews.subtitle")}
                    </p>

                    <StarRating
                        value={selectedStars}
                        onSelect={handleStarClick}
                        ariaLabel={t("reviews.rating_group_aria")}
                        getStarAriaLabel={(n) => t("reviews.stars_aria", { count: n })}
                    />
                </div>
            </div>
        );
    }

    /* ── PHASE: feedback ────────────────────────────── */
    if (phase === "feedback") {
        const config = RATING_CONFIG[selectedStars];
        const summaryLabel = t(`reviews.rating_labels.${selectedStars}`);

        let textareaLabel: string;
        let privacyNote: string;
        let placeholder: string;

        if (selectedStars <= 2) {
            textareaLabel = t("reviews.feedback_label_low");
            privacyNote = t("reviews.privacy_note_low");
            placeholder = t("reviews.placeholder_low");
        } else if (selectedStars === 3) {
            textareaLabel = t("reviews.feedback_label_neutral");
            privacyNote = t("reviews.privacy_note_neutral");
            placeholder = t("reviews.placeholder_neutral");
        } else {
            textareaLabel = t("reviews.feedback_label_high");
            privacyNote = t("reviews.privacy_note_high");
            placeholder = t("reviews.placeholder_high");
        }

        return (
            <div className={styles.root}>
                <div className={styles.feedbackPhase}>
                    <button
                        type="button"
                        className={styles.backLink}
                        onClick={handleBack}
                    >
                        {t("reviews.back")}
                    </button>

                    {/* Rating summary card — stelle neutre (token --pub-*) +
                        label testuale, colore semantico solo sul testo. */}
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryStars}>
                            <StarRating value={selectedStars} size="mini" />
                        </div>
                        <span className={[styles.summaryLabel, styles[config.colorClass]].join(" ")}>
                            {summaryLabel}
                        </span>
                    </div>

                    {/* Textarea */}
                    <div className={styles.feedbackForm}>
                        <label className={styles.feedbackLabel}>
                            {textareaLabel}
                        </label>
                        <p className={styles.feedbackNote}>{privacyNote}</p>
                        <textarea
                            className={styles.textarea}
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder={placeholder}
                            rows={4}
                            maxLength={2000}
                            autoFocus
                        />
                        <div className={styles.subline}>
                            <p className={styles.caption}>
                                {t("reviews.personal_data_hint")}{" "}
                                {t("reviews.privacy_disclaimer_prefix")}
                                <a
                                    href="/legal/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {t("reviews.privacy_disclaimer_link")}
                                </a>
                                {t("reviews.privacy_disclaimer_suffix")}
                            </p>
                            <span className={styles.charCount}>
                                {feedback.length} / 2000
                            </span>
                        </div>
                    </div>

                    {submitError && (
                        <p className={styles.errorMsg}>{submitError}</p>
                    )}

                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={handleSubmit}
                        disabled={submitDisabled}
                    >
                        {t("reviews.submit")}
                    </button>
                </div>
            </div>
        );
    }

    /* ── PHASE: submitting ──────────────────────────── */
    if (phase === "submitting") {
        return (
            <div className={styles.root}>
                <div className={styles.submittingPhase}>
                    <div className={styles.spinner} />
                    <p className={styles.submittingText}>{t("reviews.submitting")}</p>
                </div>
            </div>
        );
    }

    /* ── PHASE: thanks ──────────────────────────────── */
    return (
        <div className={styles.root}>
            <div className={styles.thanksPhase}>
                <div className={styles.checkCircle}>
                    <svg viewBox="0 0 24 24" className={styles.checkIcon}>
                        <path
                            d="M20 6L9 17l-5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                <h2 className={styles.thanksTitle}>
                    {t("reviews.thanks_title")}
                </h2>
                <p className={styles.thanksSubtitle}>
                    {isHighRating
                        ? t("reviews.thanks_subtitle_high")
                        : t("reviews.thanks_subtitle_low")}
                </p>

                {showGoogleCard && googleReviewUrl && (
                    <div className={styles.googleCard}>
                        <div className={styles.googleIcon}>
                            <GoogleIcon />
                        </div>
                        <div className={styles.googleCardText}>
                            <span className={styles.googleCardTitle}>
                                {t("reviews.google_card_title")}
                            </span>
                            <span className={styles.googleCardDesc}>
                                {t("reviews.google_card_desc")}
                            </span>
                        </div>
                        <a
                            href={googleReviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.googleBtn}
                            onClick={() => {
                                trackEvent(activityId, "review_google_redirect", {
                                    rating: selectedStars
                                });
                            }}
                        >
                            <GoogleIcon size={16} />
                            {t("reviews.google_btn")}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
