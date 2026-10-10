import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { signUp } from "@/services/supabase/auth";
import { INVALID_EMAIL_MESSAGE, isDisposableEmail, isValidEmailFormat } from "@utils/validateEmail";
import { isStrongPassword } from "@utils/validatePassword";
import { Button, InlineBanner, PasswordRequirements } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { AuthTabs } from "@/layouts/AuthLayout/AuthTabs";
import { Mail, Phone } from "lucide-react";
import { PasswordField } from "./PasswordField";
import { saveSignupDraft, type SignupDraft } from "@/utils/pendingRedirect";
import styles from "./Auth.module.scss";

function isAlreadyRegisteredError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already registered") || m.includes("already exists");
}

function isEmailFormatError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid email") ||
    m.includes("invalid format") ||
    m.includes("unable to validate email")
  );
}

function getReadableSignUpError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("password")) {
    return "La password deve essere più sicura (almeno 8 caratteri).";
  }
  if (normalized.includes("too many")) {
    return "Hai effettuato troppe richieste. Riprova più tardi.";
  }
  // Il trigger block_disposable_email_signup alza «disposable_email_domain»;
  // GoTrue di solito lo copre con «Database error saving new user».
  if (normalized.includes("disposable") || normalized.includes("database error saving new user")) {
    return "Non possiamo registrare questo indirizzo. Se è un'email temporanea, usane una personale o di lavoro.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Connessione assente o instabile. Controlla la rete e riprova.";
  }
  return "Errore durante la registrazione. Riprova.";
}

export default function SignUp() {
  usePageTitle("Registrati");
  // «Email sbagliata? Correggila» da /check-email: il modulo torna compilato.
  const draft = (useLocation().state as { draft?: SignupDraft } | null)?.draft;
  const [firstName, setFirstName] = useState(draft?.firstName ?? "");
  const [lastName, setLastName] = useState(draft?.lastName ?? "");
  const [email, setEmail] = useState(draft?.email ?? "");
  const [phone, setPhone] = useState(draft?.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // Dispatch unico per gli errori di signUp (usato dal ramo signUpError e dal catch),
  // così le due strade non divergono. Errori di formato email → inline sul campo;
  // email già registrata → ramo dedicato; tutto il resto → banner globale.
  const dispatchSignUpError = (message: string) => {
    if (isAlreadyRegisteredError(message)) {
      setIsEmailTaken(true);
    } else if (isEmailFormatError(message)) {
      setFieldErrors((prev) => ({ ...prev, email: INVALID_EMAIL_MESSAGE }));
    } else {
      setError(getReadableSignUpError(message));
    }
  };

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (trimmed && !isValidEmailFormat(trimmed)) {
      setFieldErrors((prev) => ({ ...prev, email: INVALID_EMAIL_MESSAGE }));
    }
  };

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
    else if (!isValidEmailFormat(email.trim()))
      nextErrors.email = INVALID_EMAIL_MESSAGE;
    else if (isDisposableEmail(email.trim()))
      nextErrors.email =
        "Non è possibile registrarsi con un indirizzo email temporaneo. Utilizza un indirizzo email permanente.";
    if (!isStrongPassword(password))
      nextErrors.password = "La password non soddisfa i requisiti di sicurezza.";
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
        dispatchSignUpError(signUpError.message);
        return;
      }

      // With email confirmation enabled, signUp() always returns { user: null, session: null, error: null }
      // on success — the user is created server-side and the confirmation email is sent.
      // Real failures always surface via signUpError above, so error === null here means success.
      // Supabase returns the same response for new and already-registered (unconfirmed) emails
      // (anti-enumeration by design), so duplicates are not distinguishable client-side.
      // GDPR consent is recorded automatically by the handle_new_user trigger via raw_user_meta_data.
      successEmail = email.trim();
      saveSignupDraft({ firstName: firstName.trim(), lastName: lastName.trim(), email: successEmail, phone: phone.trim() });
    } catch (err) {
      console.error("[SignUp] handleSubmit error:", err);
      if (err instanceof Error) {
        dispatchSignUpError(err.message);
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
    <AuthLayout
      heading="Crea il tuo account"
      lead="Inizia gratis, paga solo quando attivi la prima sede."
    >
      <div className={styles.auth}>
        <AuthTabs active="signup" />

        <form onSubmit={handleSubmit} aria-busy={loading} noValidate>
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
            onBlur={handleEmailBlur}
            required
            autoComplete="email"
            autoFocus={!!draft}
            disabled={loading}
            error={fieldErrors.email}
            startAdornment={<Mail size={18} aria-hidden="true" />}
          />

          <TextInput
            label="Telefono (facoltativo)"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            disabled={loading}
            startAdornment={<Phone size={18} aria-hidden="true" />}
          />

          <PasswordField
            label="Password"
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

          <PasswordRequirements value={password} />

          <PasswordField
            label="Conferma password"
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
            Crea l&apos;account
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
