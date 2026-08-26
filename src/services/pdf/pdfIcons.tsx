// Adapter icone → react-pdf (Stage 4b). Estrazione VETTORIALE via
// introspezione degli elementi React: i componenti icona del sito (fill-only
// `<path>` + viewBox, audit 4a) vengono chiamati come funzioni e i loro path
// rimappati sui primitivi <Svg>/<Path> di react-pdf. Nessuna duplicazione di
// path-data: riuso read-only di ALLERGEN_ICON_MAP. Niente react-dom/server né
// DOMParser: deve girare anche nel control render Node.
//
// Solo allergeni: le caratteristiche non compaiono nel PDF (le loro icone
// restano al sito, via CharacteristicIcon).
import { isValidElement, type FC, type ReactNode } from "react";
import { Path, Svg } from "@react-pdf/renderer";
import { ALLERGEN_ICON_MAP } from "@/components/icons/allergens";

export type PdfIconGeometry = {
    viewBox: string;
    paths: Array<{ d: string; fillRule?: "nonzero" | "evenodd" }>;
};

type IconComponent = FC<{ size?: number; className?: string }>;

// Cache per componente: le icone sono statiche, l'estrazione avviene una volta.
const geometryCache = new Map<IconComponent, PdfIconGeometry | null>();

function normalizeFillRule(value: unknown): "nonzero" | "evenodd" | undefined {
    return value === "nonzero" || value === "evenodd" ? value : undefined;
}

/**
 * Chiama il componente icona e cammina l'albero: root `<svg viewBox>` con soli
 * figli `<path d>`. Qualsiasi struttura diversa → null + warn (guardia: icona
 * skippata, mai crash).
 */
export function extractIconGeometry(Icon: IconComponent): PdfIconGeometry | null {
    const cached = geometryCache.get(Icon);
    if (cached !== undefined) return cached;

    const geometry = ((): PdfIconGeometry | null => {
        const element = Icon({});
        if (!isValidElement(element) || element.type !== "svg") {
            console.warn("[pdfIcons] icona senza root <svg>, skip");
            return null;
        }
        const svgProps = element.props as { viewBox?: string; children?: ReactNode };
        if (!svgProps.viewBox) {
            console.warn("[pdfIcons] icona senza viewBox, skip");
            return null;
        }

        const children = (Array.isArray(svgProps.children)
            ? svgProps.children
            : [svgProps.children]
        ).flat();

        const paths: PdfIconGeometry["paths"] = [];
        for (const child of children) {
            if (child === null || child === undefined || child === false) continue;
            if (!isValidElement(child) || child.type !== "path") {
                console.warn("[pdfIcons] elemento non-<path> nell'icona, skip icona");
                return null;
            }
            const pathProps = child.props as { d?: string; fillRule?: string };
            if (!pathProps.d) {
                console.warn("[pdfIcons] <path> senza attributo d, skip icona");
                return null;
            }
            const fillRule = normalizeFillRule(pathProps.fillRule);
            paths.push({ d: pathProps.d, ...(fillRule ? { fillRule } : {}) });
        }

        return paths.length > 0 ? { viewBox: svgProps.viewBox, paths } : null;
    })();

    geometryCache.set(Icon, geometry);
    return geometry;
}

export function allergenIconGeometry(code: string): PdfIconGeometry | null {
    const Icon = ALLERGEN_ICON_MAP[code];
    return Icon ? extractIconGeometry(Icon) : null;
}

export function PdfIcon({
    geometry,
    size,
    color
}: {
    geometry: PdfIconGeometry;
    size: number;
    color: string;
}) {
    return (
        <Svg width={size} height={size} viewBox={geometry.viewBox}>
            {geometry.paths.map((path, index) => (
                <Path
                    key={index}
                    d={path.d}
                    fill={color}
                    {...(path.fillRule ? { fillRule: path.fillRule } : {})}
                />
            ))}
        </Svg>
    );
}
