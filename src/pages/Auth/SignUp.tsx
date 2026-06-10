import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "@/services/supabase/auth";
import { isDisposableEmail } from "@utils/validateEmail";
import { Button, InlineBanner } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import styles from "./Auth.module.scss";

function isAlreadyRegisteredError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already registered") || m.includes("already exists");
}

function getReadableSignUpError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid email")) {
    return "Inserisci un indirizzo email valido.";
  }
  if (normalized.includes("password")) {
    return "La password deve essere più sicura (almeno 8 caratteri).";
  }
  if (normalized.includes("too many")) {
    return "Hai effettuato troppe richieste. Riprova più tardi.";
  }
  return "Errore durante la registrazione. Riprova.";
}

export default function SignUp() {
  usePageTitle("Registrati");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setIsEmailTaken(false);
    setFieldErrors({});

    const nextErrors: Record<string, string> = {};

    if (!firstName.trim()) nextErrors.firstName = "Il nome è obbligatorio.";
    if (!lastName.trim()) nextErrors.lastName = "Il cognome è obbligatorio.";
    if (!email.trim()) nextErrors.email = "L'email è obbligatoria.";
    else if (isDisposableEmail(email.trim()))
      nextErrors.email =
        "Non è possibile registrarsi con un indirizzo email temporaneo. Utilizza un indirizzo email permanente.";
    if (password.length < 8)
      nextErrors.password = "La password deve contenere almeno 8 caratteri.";
    if (password !== confirmPassword)
      nextErrors.confirmPassword = "Le password non coincidono.";

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setLoading(true);

    let successEmail: string | null = null;

    try {
      const { error: signUpError } = await signUp(
        email.trim(),
        password,
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
        },
      );

      if (signUpError) {
        if (isAlreadyRegisteredError(signUpError.message)) {
          setIsEmailTaken(true);
        } else {
          setError(getReadableSignUpError(signUpError.message));
        }
        return;
      }

      // With email confirmation enabled, signUp() always returns { user: null, session: null, error: null }
      // on success — the user is created server-side and the confirmation email is sent.
      // Real failures always surface via signUpError above, so error === null here means success.
      // Supabase returns the same response for new and already-registered (unconfirmed) emails
      // (anti-enumeration by design), so duplicates are not distinguishable client-side.
      // GDPR consent is recorded automatically by the handle_new_user trigger via raw_user_meta_data.
      successEmail = email.trim();
    } catch (err) {
      console.error("[SignUp] handleSubmit error:", err);
      if (err instanceof Error) {
        if (isAlreadyRegisteredError(err.message)) {
          setIsEmailTaken(true);
        } else {
          setError(getReadableSignUpError(err.message));
        }
      } else {
        setError("Errore durante la registrazione. Riprova.");
      }
    } finally {
      setLoading(false);
    }

    if (successEmail !== null) {
      navigate("/check-email", { state: { email: successEmail } });
    }
  };

  return (
    <AuthLayout>
      <div className={styles.auth}>
        <Text as="h1" variant="title-md">
          Crea il tuo account
        </Text>

        <Text
          as="p"
          variant="body-sm"
          colorVariant="muted"
          className={styles.subtitle}
        >
          Inizia gratis, paga solo quando attivi la prima sede.
        </Text>

        <form onSubmit={handleSubmit} aria-busy={loading}>
          <div className={styles.formRow}>
            <TextInput
              label="Nome"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (fieldErrors.firstName) {
                  setFieldErrors((prev) => ({ ...prev, firstName: "" }));
                }
              }}
              required
              autoComplete="given-name"
              disabled={loading}
              error={fieldErrors.firstName}
            />

            <TextInput
              label="Cognome"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                if (fieldErrors.lastName) {
                  setFieldErrors((prev) => ({ ...prev, lastName: "" }));
                }
              }}
              required
              autoComplete="family-name"
              disabled={loading}
              error={fieldErrors.lastName}
            />
          </div>

          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setIsEmailTaken(false);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: "" }));
              }
            }}
            required
            autoComplete="email"
            disabled={loading}
            error={fieldErrors.email}
          />

          <TextInput
            label="Telefono"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            disabled={loading}
          />

          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: "" }));
              }
            }}
            required
            autoComplete="new-password"
            disabled={loading}
            error={fieldErrors.password}
          />

          <TextInput
            label="Conferma password"
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }
            }}
            required
            autoComplete="new-password"
            disabled={loading}
            error={fieldErrors.confirmPassword}
          />

          <label className={styles.consentLabel}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className={styles.consentCheckbox}
            />
            <span className={styles.consentText}>
              Ho letto e accetto la{" "}
              <a
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>{" "}
              e i{" "}
              <a
                href="/legal/termini"
                target="_blank"
                rel="noopener noreferrer"
              >
                Termini di Servizio
              </a>
            </span>
          </label>

          {isEmailTaken && (
            <Text
              as="p"
              colorVariant="error"
              variant="caption"
              className={styles.feedback}
            >
              Questa email è già registrata. <Link to="/login">Accedi</Link>
            </Text>
          )}

          {error && <InlineBanner variant="error">{error}</InlineBanner>}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            disabled={loading || !termsAccepted}
          >
            Registrati
          </Button>
        </form>

        <Text as="p" variant="body-sm" className={styles.hint}>
          Hai già un account? <Link to="/login">Accedi</Link>
        </Text>
      </div>
    </AuthLayout>
  );
}
