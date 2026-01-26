import {
    useState,
    useEffect,
    useRef,
    type FormEvent,
    type KeyboardEvent,
    type ClipboardEvent
} from "react";
import { Button } from "@components/ui";
import { useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Auth.module.scss";

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN = 60; // sec

export default function VerifyOtp() {
    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
    const navigate = useNavigate();

    // Timer per il bottone "Reinvia codice"
    useEffect(() => {
        if (resendSeconds <= 0) return;
        const id = setInterval(() => setResendSeconds(sec => sec - 1), 1000);
        return () => clearInterval(id);
    }, [resendSeconds]);

    // Quando arrivi sulla pagina, parti subito col cooldown del primo invio
    useEffect(() => {
        setResendSeconds(RESEND_COOLDOWN);
        inputsRef.current[0]?.focus();
    }, []);

    const handleChangeDigit = (index: number, value: string) => {
        if (!/^\d?$/.test(value)) return;

        const next = [...digits];
        next[index] = value;
        setDigits(next);

        if (value && index < OTP_LENGTH - 1) {
            inputsRef.current[index + 1]?.focus();
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
            if (index > 0) {
                inputsRef.current[index - 1]?.focus();
            }
        }

        if (e.key === "ArrowLeft" && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }

        if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
            inputsRef.current[index + 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!paste) return;

        const next = [...digits];
        for (let i = 0; i < OTP_LENGTH; i++) {
            next[i] = paste[i] ?? "";
        }
        setDigits(next);

        const firstEmpty = next.findIndex(d => !d);
        const focusIndex = firstEmpty === -1 ? OTP_LENGTH - 1 : firstEmpty;
        inputsRef.current[focusIndex]?.focus();
    };

    async function handleVerify(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const userId = localStorage.getItem("pendingUserId");

        if (!userId) {
            setError("Sessione OTP non valida. Effettua di nuovo il login.");
            setLoading(false);
            return;
        }

        const codePlain = digits.join("");
        if (codePlain.length !== OTP_LENGTH) {
            setError("Inserisci il codice completo.");
            setLoading(false);
            return;
        }

        // 🔐 Verifica OTP via Edge Function
        const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-otp`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    userId,
                    code: codePlain
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            if (result?.error === "expired") {
                setError("Codice scaduto. Effettua di nuovo il login.");
            } else {
                setAttempts(prev => {
                    const next = prev + 1;

                    if (next >= MAX_ATTEMPTS) {
                        localStorage.removeItem("pendingUserId");
                        localStorage.removeItem("pendingUserEmail");
                        localStorage.removeItem("otpValidated");
                        setError(
                            "Hai raggiunto il numero massimo di tentativi. Effettua nuovamente il login."
                        );
                        navigate("/login");
                        return next;
                    }

                    setError(`Codice errato. Tentativi rimasti: ${MAX_ATTEMPTS - next}`);
                    return next;
                });
            }

            setLoading(false);
            return;
        }

        // OTP corretto: segno che è verificato e redirect
        localStorage.setItem("otpValidated", "true");
        localStorage.removeItem("pendingUserId");
        localStorage.removeItem("pendingUserEmail");
        setLoading(false);
        navigate("/dashboard");
    }

    async function handleResend() {
        setError("");

        const userId = localStorage.getItem("pendingUserId");
        const email = localStorage.getItem("pendingUserEmail");

        if (!userId || !email) {
            setError("Sessione scaduta. Effettua di nuovo il login.");
            navigate("/login");
            return;
        }

        if (resendSeconds > 0) return;

        try {
            setLoading(true);

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
                setLoading(false);
                return;
            }

            setDigits(Array(OTP_LENGTH).fill(""));
            setAttempts(0);
            setResendSeconds(RESEND_COOLDOWN);
            inputsRef.current[0]?.focus();
        } catch {
            setError("Impossibile reinviare il codice. Riprova.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.auth}>
            <Text as="h1" variant="title-md">
                Verifica codice OTP
            </Text>

            <form onSubmit={handleVerify}>
                <div className={styles.otpInputs}>
                    {digits.map((digit, index) => (
                        <TextInput
                            key={index}
                            ref={el => {
                                inputsRef.current[index] = el;
                            }}
                            inputMode="numeric"
                            maxLength={1}
                            style={{ textAlign: "center" }}
                            value={digit}
                            onChange={e => handleChangeDigit(index, e.target.value)}
                            onKeyDown={e => handleKeyDown(index, e)}
                            onPaste={index === 0 ? handlePaste : undefined}
                        />
                    ))}
                </div>

                {error && (
                    <Text as="p" colorVariant="error" variant="caption">
                        {error}
                    </Text>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                >
                    {loading ? "Verifica..." : "Verifica"}
                </Button>
            </form>

            <Button
                variant="ghost"
                fullWidth
                disabled={resendSeconds > 0 || loading}
                onClick={handleResend}
            >
                {resendSeconds > 0 ? `Reinvia codice (${resendSeconds}s)` : "Reinvia codice"}
            </Button>
            <Text as="p" variant="caption">
                Hai ancora {MAX_ATTEMPTS - attempts} tentativi disponibili.
            </Text>
        </div>
    );
}
