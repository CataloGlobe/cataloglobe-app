// Icona per react-pdf: disegna con <Svg>/<Path> la geometria estratta da
// `pdfIconGeometry.ts` (il componente sta da solo per il fast refresh).
import { Path, Svg } from "@react-pdf/renderer";
import type { PdfIconGeometry } from "./pdfIconGeometry";

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
