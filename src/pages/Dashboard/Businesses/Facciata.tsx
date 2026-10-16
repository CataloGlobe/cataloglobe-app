import s from "./SediD.module.scss";

/** La facciata disegnata della copia (`SDCOV`), quando la sede non ha copertina. */
export function Facciata() {
    return (
        <svg viewBox="0 0 120 72" aria-hidden="true">
            <path className={s.w} d="M16 30h88v42H16z" />
            <path className={s.a} d="M10 16h100l-6 14H16z" />
            <path d="M27 16l-5 14M44 16l-3 14M60 16v14M76 16l3 14M93 16l5 14" />
            <path className={s.d} d="M52 44h16v28H52z" />
            <path className={s.g} d="M24 40h20v16H24zM76 40h20v16H76z" />
        </svg>
    );
}
