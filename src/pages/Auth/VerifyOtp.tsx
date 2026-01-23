import {
    useState,
    useEffect,
    useRef,
    type FormEvent,
    type KeyboardEvent,
    type ClipboardEvent
} from "react";
import { supabase } from "@services/supabase/client";
import { Button } from "@components/ui";
import { useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Auth.module.scss";

interface OtpRow {
    code: string; // contiene l'hash
    created_at: string;
}

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN = 60; // sec

async function hashOtp(code: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

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

        // 1️⃣ Recupero l'ultimo OTP per l'utente
        const { data, error: fetchErr } = await supabase
            .from("otps")
            .select("code, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single<OtpRow>();

        if (fetchErr || !data) {
            setError("Codice non trovato. Richiedi un nuovo OTP.");
            setLoading(false);
            return;
        }

        // 2️⃣ Scadenza 5 minuti
        const createdAt = new Date(data.created_at);
        const expired = Date.now() - createdAt.getTime() > 5 * 60 * 1000;

        if (expired) {
            setError("Codice scaduto. Effettua di nuovo il login.");
            setLoading(false);
            return;
        }

        // 3️⃣ Confronto hash
        const codeHash = await hashOtp(codePlain);

        if (data.code !== codeHash) {
            setAttempts(prev => {
                const next = prev + 1;

                if (next >= MAX_ATTEMPTS) {
                    // Troppi tentativi → reset totale
                    localStorage.removeItem("pendingUserId");
                    localStorage.removeItem("pendingUserEmail");
                    localStorage.removeItem("otpValidated");
                    setError(
                        "Hai raggiunto il numero massimo di tentativi. Effettua nuovamente il login."
                    );
                    setLoading(false);
                    navigate("/login");
                    return next;
                }

                setError(`Codice errato. Tentativi rimasti: ${MAX_ATTEMPTS - next}`);
                return next;
            });
            setLoading(false);
            return;
        }

        // 4️⃣ OTP corretto: segno che è verificato e redirect
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
