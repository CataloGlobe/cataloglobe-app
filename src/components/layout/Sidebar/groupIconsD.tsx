import type { ReactNode } from "react";
import type { NavGroupKey } from "@/utils/navModel";

// D: le icone delle sezioni della copia «Visual Redesign PR 3» (`NAVI`), a
// tratto come le Lucide: il foglio del menù, la campanella, il segnaposto.
function copyIcon(children: ReactNode): ReactNode {
    return (
        <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

export const GROUP_ICONS_D: Record<NavGroupKey, ReactNode> = {
    overview: copyIcon(
        <>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </>
    ),
    crea: copyIcon(
        <>
            <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
            <path d="M9 9h6M9 13h6" />
        </>
    ),
    calendario: copyIcon(
        <>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
        </>
    ),
    servizio: copyIcon(
        <>
            <path d="M12 4a6 6 0 0 0-6 6v4l-1.5 3h15L18 14v-4a6 6 0 0 0-6-6zM10 20h4" />
        </>
    ),
    numeri: copyIcon(
        <>
            <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />
        </>
    ),
    sedi: copyIcon(
        <>
            <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
        </>
    ),
};
