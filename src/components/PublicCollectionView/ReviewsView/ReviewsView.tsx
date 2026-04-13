import { useState, useEffect } from "react";
import styles from "./ReviewsView.module.scss";

/* ── Props ───────────────────────────────────────────── */

export type ReviewsViewProps = {
    googleReviewUrl: string | null;
    activityId: string;
    sessionId: string;
    supabaseUrl: string;
};

/* ── Rating config ──────────────────────────────────── */

type RatingConfig = {
    emoji: string;
    label: string;
    colorClass: string;
};

const RATING_CONFIG: Record<number, RatingConfig> = {
    1: { emoji: "\u{1F61E}", label: "Pessima", colorClass: "ratingRed" },
    2: { emoji: "\u{1F615}", label: "Scarsa", colorClass: "ratingOrange" },
    3: { emoji: "\u{1F610}", label: "Nella media", colorClass: "ratingYellow" },
    4: { emoji: "\u{1F60A}", label: "Buona", colorClass: "ratingGreen" },
    5: { emoji: "\u{1F929}", label: "Eccellente!", colorClass: "ratingGreenDark" },
};

type Phase = "stars" | "feedback" | "submitting" | "thanks";

/* ── Star SVG ────────────────────────────────────────── */

function StarIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={filled ? styles.starSvgFilled : styles.starSvgEmpty}
        >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}

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
}: ReviewsViewProps) {
    const [phase, setPhase] = useState<Phase>("stars");
    const [selectedStars, setSelectedStars] = useState(0);
    const [hoverStars, setHoverStars] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showGoogleCard, setShowGoogleCard] = useState(false);

    const displayStars = hoverStars || selectedStars;
    const ratingConfig = displayStars > 0 ? RATING_CONFIG[displayStars] : null;

    const isLowRating = selectedStars >= 1 && selectedStars <= 3;
    const isHighRating = selectedStars >= 4;
    const submitDisabled = isLowRating && feedback.trim().length === 0;

    /* ── Handle star click ──────────────────────────── */
    function handleStarClick(n: number) {
        setSelectedStars(n);
        setTimeout(() => setPhase("feedback"), 300);
    }

    /* ── Handle back ────────────────────────────────── */
    function handleBack() {
        setSelectedStars(0);
        setHoverStars(0);
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
                    setPhase("thanks");
                    return;
                }
            }

            if (res.status === 429) {
                setSubmitError("Hai già lasciato una recensione di recente");
            } else {
                setSubmitError("Si è verificato un errore. Riprova più tardi.");
            }
            setPhase("feedback");
        } catch {
            setSubmitError("Si è verificato un errore. Riprova più tardi.");
            setPhase("feedback");
        }
    }

    /* ── Show Google card with delay ────────────────── */
    useEffect(() => {
        if (phase !== "thanks" || !isHighRating || !googleReviewUrl) return;
        const timer = setTimeout(() => setShowGoogleCard(true), 600);
        return () => clearTimeout(timer);
    }, [phase, isHighRating, googleReviewUrl]);

    /* ── PHASE: stars ───────────────────────────────── */
    if (phase === "stars") {
        return (
            <div className={styles.root}>
                <div className={styles.starsPhase}>
                    <h2 className={styles.title}>
                        Come è stata la tua esperienza?
                    </h2>
                    <p className={styles.subtitle}>
                        Il tuo feedback ci aiuta a migliorare
                    </p>

                    <div
                        className={styles.starsRow}
                        role="group"
                        aria-label="Valutazione"
                    >
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={styles.starBtn}
                                onMouseEnter={() => setHoverStars(n)}
                                onMouseLeave={() => setHoverStars(0)}
                                onClick={() => handleStarClick(n)}
                                aria-label={`${n} ${n === 1 ? "stella" : "stelle"}`}
                            >
                                <StarIcon filled={displayStars >= n} />
                            </button>
                        ))}
                    </div>

                    {ratingConfig && (
                        <div
                            className={[
                                styles.ratingBadge,
                                styles[ratingConfig.colorClass],
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <span className={styles.ratingEmoji}>
                                {ratingConfig.emoji}
                            </span>
                            <span className={styles.ratingLabel}>
                                {ratingConfig.label}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /* ── PHASE: feedback ────────────────────────────── */
    if (phase === "feedback") {
        const config = RATING_CONFIG[selectedStars];

        let textareaLabel: string;
        let privacyNote: string;
        let placeholder: string;

        if (selectedStars <= 2) {
            textareaLabel = "Cosa possiamo migliorare?";
            privacyNote =
                "Il tuo feedback resterà privato e ci aiuterà a migliorare.";
            placeholder = "Descrivi cosa non ha funzionato...";
        } else if (selectedStars === 3) {
            textareaLabel = "Raccontaci di più sulla tua esperienza";
            privacyNote =
                "Il tuo feedback resterà privato e ci aiuterà a migliorare.";
            placeholder = "Lascia un commento...";
        } else {
            textareaLabel = "Cosa ti è piaciuto di più?";
            privacyNote =
                "Facoltativo — puoi anche inviare direttamente.";
            placeholder = "Es. Ottimo servizio, piatti deliziosi!";
        }

        const bgClass = `${config.colorClass}Bg` as keyof typeof styles;

        return (
            <div className={styles.root}>
                <div className={styles.feedbackPhase}>
                    <button
                        type="button"
                        className={styles.backLink}
                        onClick={handleBack}
                    >
                        &larr; Cambia voto
                    </button>

                    {/* Rating summary card */}
                    <div
                        className={[
                            styles.ratingSummaryCard,
                            styles[bgClass],
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <span className={styles.ratingSummaryEmoji}>
                            {config.emoji}
                        </span>
                        <div className={styles.ratingSummaryInfo}>
                            <span className={styles.ratingSummaryLabel}>
                                {config.label}
                            </span>
                            <div className={styles.ratingSummaryStars}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <svg
                                        key={n}
                                        viewBox="0 0 24 24"
                                        className={[
                                            styles.miniStar,
                                            n <= selectedStars
                                                ? styles.miniStarFilled
                                                : styles.miniStarEmpty,
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                    >
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                ))}
                            </div>
                        </div>
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
                        <div className={styles.charCount}>
                            {feedback.length} / 2000
                        </div>
                    </div>

                    {submitError && (
                        <p className={styles.errorMsg}>{submitError}</p>
                    )}

                    {submitDisabled && (
                        <p className={styles.requiredNote}>
                            Per i voti bassi, un commento ci aiuta a capire cosa
                            migliorare
                        </p>
                    )}

                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={handleSubmit}
                        disabled={submitDisabled}
                    >
                        Invia feedback
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
                    <p className={styles.submittingText}>Invio in corso...</p>
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
                            stroke="#fff"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                <h2 className={styles.thanksTitle}>
                    Grazie per il tuo feedback!
                </h2>
                <p className={styles.thanksSubtitle}>
                    {isHighRating
                        ? "Siamo felici che la tua esperienza sia stata positiva."
                        : "Il tuo feedback ci aiuterà a migliorare."}
                </p>

                {showGoogleCard && googleReviewUrl && (
                    <div className={styles.googleCard}>
                        <div className={styles.googleIcon}>
                            <GoogleIcon />
                        </div>
                        <div className={styles.googleCardText}>
                            <span className={styles.googleCardTitle}>
                                Ti è piaciuta la tua esperienza?
                            </span>
                            <span className={styles.googleCardDesc}>
                                Lascia una recensione anche su Google per aiutare
                                altre persone a scoprirci!
                            </span>
                        </div>
                        <a
                            href={googleReviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.googleBtn}
                        >
                            <GoogleIcon size={16} />
                            Recensisci su Google
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
