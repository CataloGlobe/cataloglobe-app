import type { ReactNode } from "react";
import { FAMILY_ICON, type Family } from "./family";
import s from "./FamilyName.module.scss";

/**
 * Il nome di una cosa dentro una frase (Visual Redesign 2, `b.fk`): fondo e
 * inchiostro della sua famiglia, l'icona davanti, mai spezzato a metà. Solo D:
 * fuori dalla D è un grassetto qualsiasi.
 */
export function FamilyName({ family, children }: { family: Family; children: ReactNode }) {
    const Icon = FAMILY_ICON[family];
    return (
        <b className={s.name} data-family={family}>
            <Icon className={s.icon} aria-hidden />
            {children}
        </b>
    );
}
