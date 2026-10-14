import type { CSSProperties } from "react";
import type { VoteLineProps } from "./VoteLine";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { smoothPath } from "./voteTrend";
import styles from "./VoteLineD.module.scss";

/**
 * Il voto nella direzione D (artifact v28, `#vote`): la media grande, la barra
 * divisa per stelle con la legenda, il totale a destra e sotto il voto
 * settimana per settimana. Stessi nomi accessibili di `VoteLine`. Compatta
 * (testata che scorre) diventa una pillola «4,4 ★ ▬ N recensioni»: toccandola
 * si torna in cima.
 */
export interface VoteLineDProps extends VoteLineProps {
  /** La media delle ultime settimane, la più vecchia per prima. */
  trend?: readonly number[];
  compact?: boolean;
  onExpand?: () => void;
}

const ORDER = [5, 4, 3, 2, 1] as const;

const decimal = (n: number) =>
  n.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function VoteTrend({ values }: { values: readonly number[] }) {
  const min = Math.min(...values);
  const span = Math.max(Math.max(...values) - min, 0.4);
  const pts = values.map(
    (v, i) =>
      [
        Math.round((i / (values.length - 1)) * 156) + 2,
        30 - ((v - min) / span) * 26,
      ] as [number, number],
  );
  const last = pts[pts.length - 1];
  return (
    <div className={styles.trend}>
      <svg viewBox="0 0 160 34" aria-hidden>
        <path d={smoothPath(pts)} />
        <circle cx={last[0]} cy={last[1]} r="3.5" />
      </svg>
      <span>
        Il voto, settimana per settimana: da {decimal(values[0])} a{" "}
        {decimal(values[values.length - 1])} nelle ultime sette.
      </span>
    </div>
  );
}

export function VoteLineD({
  name,
  average,
  total,
  invited,
  distribution,
  stars = null,
  onStars,
  trend,
  compact = false,
  onExpand,
}: VoteLineDProps) {
  const toggle = (n: number) => onStars?.(stars === n ? null : n);
  const staying = total - invited;
  const shown = ORDER.filter((n) => distribution[n] > 0);
  const label = name ? `Il voto · ${name}` : "Il voto";

  // Il Tooltip resta sempre attorno (spento finché non è compatta), così la
  // pillola non rinasce quando la testata si stringe.
  return (
    <Tooltip
      content="Torna in cima"
      side="bottom"
      open={compact ? undefined : false}
    >
      <section
        className={styles.vote}
        aria-label={compact ? `${label}, torna in cima` : label}
        data-f={stars ?? undefined}
        data-compact={compact ? "" : undefined}
        onClick={compact ? onExpand : undefined}
        // compatta è un pulsante anche da tastiera: riporta in cima
        role={compact ? "button" : undefined}
        tabIndex={compact ? 0 : undefined}
        onKeyDown={
          compact
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onExpand?.();
              }
            : undefined
        }
      >
        {name && <span className={styles.name}>{name}</span>}
        <p className={styles.avg}>
          <span>{average !== null ? decimal(average) : "—"}</span>
          <span className={styles.star} aria-hidden>
            ★
          </span>
        </p>
        <div className={styles.bars}>
          {total > 0 ? (
            <>
              <div className={styles.stack} aria-hidden>
                {shown.map((n, i) => (
                  <span
                    key={n}
                    data-on={stars === n ? "" : undefined}
                    data-static={onStars ? undefined : ""}
                    style={
                      {
                        "--w": distribution[n],
                        "--c": `var(--d-star-${n})`,
                        "--i": i,
                      } as CSSProperties
                    }
                    onClick={onStars ? () => toggle(n) : undefined}
                  />
                ))}
              </div>
              <div className={styles.legend}>
                {ORDER.map((n) => {
                  const tint = { "--c": `var(--d-star-${n})` } as CSSProperties;
                  return !onStars ? (
                    <span key={n} style={tint}>
                      <i aria-hidden />
                      {n} ★ <b>{distribution[n]}</b>
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      style={tint}
                      data-on={stars === n ? "" : undefined}
                      aria-pressed={stars === n}
                      aria-label={`${n} ${n === 1 ? "stella" : "stelle"}: ${distribution[n]}`}
                      onClick={() => toggle(n)}
                      disabled={distribution[n] === 0 && stars !== n}
                    >
                      <i aria-hidden />
                      {n} ★ <b>{distribution[n]}</b>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className={styles.none}>Nessun voto nel periodo.</p>
          )}
        </div>
        <div className={styles.total}>
          <b>
            {total} {total === 1 ? "recensione" : "recensioni"}
          </b>
          {total > 0 && (
            <span>
              {invited > 0
                ? `${invited} invitat${invited === 1 ? "a" : "e"} su Google · `
                : ""}
              {staying} {staying === 1 ? "resta" : "restano"} a voi
            </span>
          )}
        </div>
        {trend && trend.length >= 2 && <VoteTrend values={trend} />}
      </section>
    </Tooltip>
  );
}
