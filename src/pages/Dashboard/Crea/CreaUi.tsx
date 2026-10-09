// I pezzi piccoli dei passi del tunnel: titolo del passo, scelte, chip, campi, avvisi.
import { type ReactNode } from "react";
import { Check, TriangleAlert } from "lucide-react";
import s from "./Crea.module.scss";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Sh({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className={s.sh}>
            <h3>{title}</h3>
            {children && <p>{children}</p>}
        </div>
    );
}

export function Opt({ on, icon, title, text, onClick, disabled, later, done }: { on?: boolean; icon: ReactNode; title: string; text: string; onClick?: () => void; disabled?: boolean; later?: string; done?: boolean }) {
    return (
        <button type="button" className={cx(s.opt, done && s.done)} aria-pressed={on === undefined ? undefined : on} disabled={disabled} onClick={onClick}>
            <span className={s.oi}>{icon}</span>
            <b>{title}</b>
            <span>{text}</span>
            {later && <span className={s.later}>{later}</span>}
        </button>
    );
}

export function Chip({ on, onClick, children, style, disabled }: { on: boolean; onClick: () => void; children: ReactNode; style?: React.CSSProperties; disabled?: boolean }) {
    return (
        <button type="button" className={s.chip} aria-pressed={on} onClick={onClick} style={style} disabled={disabled}>
            {children}
        </button>
    );
}

export function Field({ label, children, id }: { label: string; children: ReactNode; id: string }) {
    return (
        <div className={cx(s.f, s.blk)}>
            <label htmlFor={id}>{label}</label>
            {children}
        </div>
    );
}

export function Box({ on }: { on: boolean }) {
    return <span className={s.box}>{on && <Check size={11} aria-hidden />}</span>;
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className={s.toggle} role="switch" aria-checked={on} onClick={onClick}>
            <span className={s.t} />
            {children}
        </button>
    );
}

export function Warnish({ children }: { children: ReactNode }) {
    return (
        <span className={s.warnish}>
            <TriangleAlert size={14} aria-hidden />
            {children}
        </span>
    );
}
