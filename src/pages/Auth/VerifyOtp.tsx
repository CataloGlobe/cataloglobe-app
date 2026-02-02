import {
    useState,
    useEffect,
    useRef,
    type FormEvent,
    type KeyboardEvent,
    type ClipboardEvent
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { supabase } from "@/services/supabase/client";
import styles from "./Auth.module.scss";
import { setOtpValidatedForUser } from "@/services/supabase/auth";

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN = 60;

export default function VerifyOtp() {
    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
    const hasRequestedOtpRef = useRef(false);

    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || "/dashboard";
    const reason = location.state?.reason;

    /* ------------------------------------------------------------------
     * INVIO OTP (una sola volta per sessione, safe per StrictMode)
     * ------------------------------------------------------------------ */
    useEffect(() => {
        const userId = localStorage.getItem("pendingUserId");
        const email = localStorage.getItem("pendingUserEmail");
        const otpSent = localStorage.getItem("otpSent");

        if (!userId || !email) {
            navigate("/login", { replace: true, state: { reason: "session-expired" } });
            return;
        }

        if (otpSent === "true") return;
        if (hasRequestedOtpRef.current) return;

        hasRequestedOtpRef.current = true;

        async function sendOtp() {
            try {
                setLoading(true);
                setError(null);
                setInfoMessage(null);

                const response = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                        },
                        body: JSON.stringify({ userId, email })
                    }
                );

                if (!response.ok) {
                    setError("Errore durante l'invio del codice di verifica.");
                    return;
                }

                localStorage.setItem("otpSent", "true");
                setResendSeconds(RESEND_COOLDOWN);
                setInfoMessage("Codice di verifica inviato.");
            } catch {
                setError("Impossibile inviare il codice. Riprova.");
            } finally {
                setLoading(false);
            }
        }

        sendOtp();
    }, [navigate]);

    /* ------------------------------------------------------------------
     * COUNTDOWN REINVIO
     * ------------------------------------------------------------------ */
    useEffect(() => {
        if (resendSeconds <= 0) return;
        const id = setInterval(() => {
            setResendSeconds(sec => sec - 1);
        }, 1000);
        return () => clearInterval(id);
    }, [resendSeconds]);

    /* ------------------------------------------------------------------
     * AUTOFOCUS
     * ------------------------------------------------------------------ */
    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    /* ------------------------------------------------------------------
     * INPUT HANDLING
     * ------------------------------------------------------------------ */
    const handleChangeDigit = (index: number, value: string) => {
        if (!/^\d?$/.test(value)) return;

        const next = [...digits];
        next[index] = value;
        setDigits(next);

        if (value && index < OTP_LENGTH - 1) {
            inputsRef.current[index + 1]?.focus();
        }

        // Auto-submit quando completo
        if (next.join("").length === OTP_LENGTH) {
            void handleVerify();
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            if (digits[index]) {
                const next = [...digits];
                next[index] = "";
                setDigits(next);
                return;
            }
            if (index > 0) inputsRef.current[index - 1]?.focus();
        }

        if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
        if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!paste) return;

        const next = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < paste.length; i++) {
            next[i] = paste[i];
        }

        setDigits(next);
        inputsRef.current[Math.min(paste.length, OTP_LENGTH) - 1]?.focus();

        if (paste.length === OTP_LENGTH) {
            void handleVerify(next.join(""));
        }
    };

    /* ------------------------------------------------------------------
     * VERIFICA OTP
     * ------------------------------------------------------------------ */
    async function handleVerify(codeOverride?: string) {
        if (loading) return;

        const userId = localStorage.getItem("pendingUserId");
        if (!userId) {
            navigate("/login", { replace: true, state: { reason: "session-expired" } });
            return;
        }

        const code = codeOverride ?? digits.join("");
        if (code.length !== OTP_LENGTH) return;

        try {
            setLoading(true);
            setError(null);
            setInfoMessage("Verifica del codice in corso…");

            const { data } = await supabase.auth.getSession();
            const session = data.session;

            if (!session?.access_token) {
                navigate("/login", { replace: true, state: { reason: "session-expired" } });
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-otp`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ userId, code })
                }
            );

            if (!response.ok) {
                setAttempts(prev => {
                    const next = prev + 1;

                    if (next >= MAX_ATTEMPTS) {
                        localStorage.removeItem("pendingUserId");
                        localStorage.removeItem("pendingUserEmail");
                        localStorage.removeItem("otpValidatedUserId");
                        localStorage.removeItem("otpSent");
                        navigate("/login", { replace: true, state: { reason: "session-expired" } });
                        return next;
                    }

                    setError(
                        next === MAX_ATTEMPTS - 1
                            ? "Ultimo tentativo disponibile."
                            : "Codice non valido. Riprova."
                    );

                    return next;
                });
                return;
            }

            const userIdFromSession = session.user.id;

            setOtpValidatedForUser(userIdFromSession);
            localStorage.removeItem("pendingUserId");
            localStorage.removeItem("pendingUserEmail");
            localStorage.removeItem("otpSent");

            navigate(from, { replace: true });
        } catch {
            setError("Errore durante la verifica del codice.");
        } finally {
            setLoading(false);
        }
    }

    /* ------------------------------------------------------------------
     * REINVIO OTP
     * ------------------------------------------------------------------ */
    async function handleResend() {
        if (loading || resendSeconds > 0) return;

        const userId = localStorage.getItem("pendingUserId");
        const email = localStorage.getItem("pendingUserEmail");

        if (!userId || !email) {
            navigate("/login", { replace: true, state: { reason: "session-expired" } });
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setInfoMessage(null);

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({ userId, email })
                }
            );

            if (!response.ok) {
                setError("Errore durante il reinvio del codice.");
                return;
            }

            setDigits(Array(OTP_LENGTH).fill(""));
            setAttempts(0);
            setResendSeconds(RESEND_COOLDOWN);
            setInfoMessage("Nuovo codice inviato.");
            inputsRef.current[0]?.focus();
        } catch {
            setError("Impossibile reinviare il codice.");
        } finally {
            setLoading(false);
        }
    }

    /* ------------------------------------------------------------------ */

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Verifica il codice
            </Text>

            <Text as="p" variant="body-sm" className={styles.subtitle}>
                Inserisci il codice a 6 cifre che ti abbiamo inviato via email.
            </Text>

            {reason === "otp-required" && (
                <Text variant="caption" colorVariant="info">
                    Completa la verifica per accedere al tuo account.
                </Text>
            )}

            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void handleVerify();
                }}
                aria-busy={loading}
            >
                <div className={styles.otpInputs}>
                    {digits.map((digit, index) => (
                        <TextInput
                            key={index}
                            ref={el => {
                                inputsRef.current[index] = el;
                            }}
                            className={styles.otpInput}
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            disabled={loading}
                            onChange={e => handleChangeDigit(index, e.target.value)}
                            onKeyDown={e => handleKeyDown(index, e)}
                            onPaste={index === 0 ? handlePaste : undefined}
                            aria-label={`Cifra ${index + 1} del codice di verifica`}
                        />
                    ))}
                </div>

                {error && (
                    <Text as="p" colorVariant="error" variant="caption" className={styles.feedback}>
                        {error}
                    </Text>
                )}

                {infoMessage && !error && (
                    <Text as="p" colorVariant="info" variant="caption" className={styles.feedback}>
                        {infoMessage}
                    </Text>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                >
                    Verifica
                </Button>
            </form>

            <div className={styles.otpFooter}>
                <Button
                    variant="ghost"
                    fullWidth
                    onClick={handleResend}
                    disabled={loading || resendSeconds > 0}
                >
                    {resendSeconds > 0 ? `Reinvia codice (${resendSeconds}s)` : "Reinvia codice"}
                </Button>

                <Text as="p" variant="caption">
                    Tentativi rimasti: {Math.max(0, MAX_ATTEMPTS - attempts)}
                </Text>
            </div>
        </div>
    );
}
