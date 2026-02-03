import {
    useState,
    useEffect,
    useRef,
    type KeyboardEvent,
    type ClipboardEvent,
    type FormEvent,
    useCallback
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import type { OtpErrorCode, OtpStatus } from "@/types/otp";
import styles from "./Auth.module.scss";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function mapOtpError(error: unknown): OtpErrorCode {
    if (!error || typeof error !== "object") return "unknown";

    const message = "message" in error && typeof error.message === "string" ? error.message : "";

    if (message.includes("invalid")) return "invalid_or_expired";
    if (message.includes("cooldown")) return "cooldown";
    if (message.includes("locked")) return "locked";
    if (message.includes("rate")) return "rate_limited";
    if (message.includes("unauthorized")) return "unauthorized";

    return "unknown";
}

export default function VerifyOtp() {
    const { refreshOtp } = useAuth();
    const navigate = useNavigate();

    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
    const [status, setStatus] = useState<OtpStatus>("idle");

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
    const hasRequestedOtpRef = useRef(false);

    const { showToast } = useToast();

    const sendOtp = useCallback(async () => {
        try {
            setLoading(true);
            setStatus("sending");
            setError(null);
            setInfo(null);

            const { data } = await supabase.auth.getSession();
            const jwt = data.session?.access_token;

            if (!jwt) {
                navigate("/login", { replace: true });
                return;
            }

            const { error } = await supabase.functions.invoke("send-otp", {
                headers: { Authorization: `Bearer ${jwt}` }
            });

            if (error) {
                const code = mapOtpError(error);

                // ❗ NON bloccare il flusso: il codice potrebbe arrivare comunque
                if (code === "cooldown") {
                    showToast({
                        type: "error",
                        message: "Attendi qualche secondo prima di richiedere un nuovo codice.",
                        duration: 2500
                    });
                    setError("Attendi qualche secondo prima di richiedere un nuovo codice.");
                } else if (code === "rate_limited" || code === "locked") {
                    showToast({
                        type: "error",
                        message: "Hai fatto troppe richieste. Riprova più tardi.",
                        duration: 2500
                    });
                    setError("Hai fatto troppe richieste. Riprova più tardi.");
                } else {
                    showToast({
                        type: "info",
                        message: "Se non ricevi il codice entro pochi secondi, riprova.",
                        duration: 2500
                    });
                    setInfo("Se non ricevi il codice entro pochi secondi, riprova.");
                }

                return; // ✅ IMPORTANT: evita toast “Codice inviato”
            }

            // ✅ solo se OK
            showToast({ type: "info", message: "Codice inviato.", duration: 2500 });
            setInfo("Codice inviato.");
            setResendSeconds(RESEND_COOLDOWN);
        } finally {
            setLoading(false);
            setStatus("idle");
        }
    }, [navigate, showToast]);

    /* ------------------------------------------------------------------
     * INVIO OTP AUTOMATICO (UNA SOLA VOLTA)
     * ------------------------------------------------------------------ */
    useEffect(() => {
        if (hasRequestedOtpRef.current) return;
        hasRequestedOtpRef.current = true;

        void sendOtp();
    }, [sendOtp]);

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

        if (next.join("").length === OTP_LENGTH) {
            void handleVerify(next.join(""));
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
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!paste) return;

        const next = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < paste.length; i++) next[i] = paste[i];

        setDigits(next);
        inputsRef.current[Math.min(paste.length, OTP_LENGTH) - 1]?.focus();

        if (paste.length === OTP_LENGTH) {
            void handleVerify(paste);
        }
    };

    /* ------------------------------------------------------------------
     * VERIFICA OTP
     * ------------------------------------------------------------------ */
    async function handleVerify(codeOverride?: string) {
        if (loading) return;

        const code = codeOverride ?? digits.join("");
        if (code.length !== OTP_LENGTH) return;

        try {
            setLoading(true);
            setStatus("verifying");
            setError(null);
            showToast({
                type: "info",
                message: "Verifica in corso...",
                duration: 2500
            });
            setInfo("Verifica in corso...");

            const { data } = await supabase.auth.getSession();
            const jwt = data.session?.access_token;

            if (!jwt) {
                navigate("/login", { replace: true });
                return;
            }

            const { error } = await supabase.functions.invoke("verify-otp", {
                body: { code },
                headers: { Authorization: `Bearer ${jwt}` }
            });

            if (error) {
                const code = mapOtpError(error);

                switch (code) {
                    case "invalid_or_expired":
                        showToast({
                            type: "error",
                            message: "Codice non valido o scaduto.",
                            duration: 2500
                        });
                        setError("Codice non valido o scaduto.");
                        break;
                    case "cooldown":
                        showToast({
                            type: "error",
                            message: "Attendi qualche secondo prima di riprovare.",
                            duration: 2500
                        });
                        setError("Attendi qualche secondo prima di riprovare.");
                        break;
                    case "locked":
                        showToast({
                            type: "error",
                            message: "Troppi tentativi. Riprova più tardi.",
                            duration: 2500
                        });
                        setError("Troppi tentativi. Riprova più tardi.");
                        break;
                    case "rate_limited":
                        showToast({
                            type: "error",
                            message: "Hai fatto troppe richieste. Attendi.",
                            duration: 2500
                        });
                        setError("Hai fatto troppe richieste. Attendi.");
                        break;
                    case "unauthorized":
                        navigate("/login", { replace: true });
                        return;
                    default:
                        showToast({
                            type: "error",
                            message: "Errore durante la verifica del codice.",
                            duration: 2500
                        });
                        setError("Errore durante la verifica del codice.");
                }
                return;
            }

            await refreshOtp();
            navigate("/dashboard", { replace: true });
        } finally {
            setLoading(false);
            setStatus("idle");
        }
    }

    /* ------------------------------------------------------------------
     * REINVIO OTP
     * ------------------------------------------------------------------ */
    async function handleResend() {
        if (loading || resendSeconds > 0) return;

        setDigits(Array(OTP_LENGTH).fill(""));
        setResendSeconds(RESEND_COOLDOWN);
        setInfo(null);
        setError(null);

        inputsRef.current[0]?.focus();

        await sendOtp();
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

            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void handleVerify();
                }}
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
                        />
                    ))}
                </div>

                {error && (
                    <Text variant="caption" colorVariant="error" className={styles.feedback}>
                        {error}
                    </Text>
                )}

                {info && !error && (
                    <Text variant="caption" colorVariant="info" className={styles.feedback}>
                        {info}
                    </Text>
                )}

                <Button
                    type="submit"
                    fullWidth
                    loading={loading}
                    disabled={status === "sending" || status === "verifying"}
                >
                    {status === "sending" ? "Invio in corso…" : "Verifica"}
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
            </div>
        </div>
    );
}
