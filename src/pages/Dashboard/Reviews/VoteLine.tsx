import { Star } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import styles from "./VoteLine.module.scss";

/**
 * Il voto in una riga (D154, Recensioni A): la media, una barra sola divisa
 * per stelle e quante sono andate su Google. Un clic su una stella (barra o
 * legenda) filtra l'elenco; di nuovo, toglie il filtro. Col confronto fra sedi
 * (D159) c'è una riga per sede, col nome; quelle delle altre sedi non filtrano.
 */
export interface VoteLineProps {
  /** La sede, quando le righe sono più d'una (confronto). */
  name?: string;
  average: number | null;
  total: number;
  /** 4-5 stelle in una sede con il link di Google: invitate a recensire lì. */
  invited: number;
  /** Conteggio per stelle, da 1 a 5. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  stars?: number | null;
  /** Senza: la riga si legge e basta (le altre sedi del confronto). */
  onStars?: (stars: number | null) => void;
}

const ORDER = [5, 4, 3, 2, 1] as const;

export function VoteLine({
  name,
  average,
  total,
  invited,
  distribution,
  stars = null,
  onStars,
}: VoteLineProps) {
  const toggle = (n: number) => onStars?.(stars === n ? null : n);
  const staying = total - invited;

  return (
    <section
      className={styles.line}
      aria-label={name ? `Il voto · ${name}` : "Il voto"}
    >
      <div className={styles.head}>
        {name && <span className={styles.name}>{name}</span>}
        <p className={styles.average}>
          <Star className={styles.star} size={22} aria-hidden />
          {average !== null
            ? average.toLocaleString("it-IT", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
            : "—"}
        </p>
      </div>
      <div className={styles.bars}>
        {total > 0 ? (
          <>
            <div className={styles.stack} aria-hidden>
              {ORDER.filter((n) => distribution[n] > 0).map((n) => (
                <span
                  key={n}
                  className={styles.segment}
                  data-stars={n}
                  data-dim={stars !== null && stars !== n ? "" : undefined}
                  style={{ flexGrow: distribution[n] }}
                  data-static={onStars ? undefined : ""}
                  onClick={onStars ? () => toggle(n) : undefined}
                />
              ))}
            </div>
            <div className={styles.legend}>
              {ORDER.map((n) =>
                !onStars ? (
                  <span key={n} className={styles.legendItem} data-static="">
                    {n} ★ {distribution[n]}
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    className={styles.legendItem}
                    aria-pressed={stars === n}
                    aria-label={`${n} ${n === 1 ? "stella" : "stelle"}: ${distribution[n]}`}
                    onClick={() => toggle(n)}
                    disabled={distribution[n] === 0 && stars !== n}
                  >
                    {n} ★ {distribution[n]}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <Text variant="body-sm" colorVariant="muted">
            Nessun voto nel periodo.
          </Text>
        )}
      </div>
      <div className={styles.counts}>
        <Text as="p" variant="body-sm" weight={700}>
          {total} {total === 1 ? "recensione" : "recensioni"}
        </Text>
        {total > 0 && (
          <Text as="p" variant="caption" colorVariant="muted">
            {invited > 0
              ? `${invited} invitat${invited === 1 ? "a" : "e"} su Google · `
              : ""}
            {staying} restat{staying === 1 ? "a" : "e"} a voi
          </Text>
        )}
      </div>
    </section>
  );
}
