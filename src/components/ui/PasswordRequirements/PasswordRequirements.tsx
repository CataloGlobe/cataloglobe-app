import { Check, Circle } from "lucide-react";
import Text from "@components/ui/Text/Text";
import { getPasswordChecks } from "@utils/validatePassword";
import styles from "./PasswordRequirements.module.scss";

type Props = {
  /** Password corrente. La checklist si aggiorna live. */
  value: string;
};

const CRITERIA: { key: "minLength" | "lowercase" | "uppercase" | "digit"; label: string }[] = [
  { key: "minLength", label: "Almeno 8 caratteri" },
  { key: "lowercase", label: "Una lettera minuscola" },
  { key: "uppercase", label: "Una lettera maiuscola" },
  { key: "digit", label: "Un numero" },
];

export function PasswordRequirements({ value }: Props) {
  // Evita rumore a campo vuoto: mostra la checklist solo quando l'utente digita.
  if (!value) return null;

  const checks = getPasswordChecks(value);

  return (
    <ul className={styles.list} aria-live="polite">
      {CRITERIA.map(({ key, label }) => {
        const met = checks[key];
        return (
          <li
            key={key}
            className={`${styles.item} ${met ? styles.met : ""}`}
          >
            {met ? (
              <Check size={16} strokeWidth={2.5} aria-hidden="true" className={styles.icon} />
            ) : (
              <Circle size={16} strokeWidth={2} aria-hidden="true" className={styles.icon} />
            )}
            <Text as="span" variant="caption">
              {label}
            </Text>
            <span className={styles.srStatus}>
              {met ? " (soddisfatto)" : " (non soddisfatto)"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default PasswordRequirements;
