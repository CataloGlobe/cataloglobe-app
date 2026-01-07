import Color from "color";
import { getReadableTextColor } from "./getReadableTextColor";

export function getPillColors(baseColor: string) {
    const base = Color(baseColor);

    const activeBg = base.hex();
    const activeText = getReadableTextColor(activeBg);

    const normalBg = base.lighten(0.45).hex();
    const normalText = getReadableTextColor(normalBg);

    const hoverBg = base.lighten(0.3).hex();
    const hoverText = getReadableTextColor(hoverBg);

    return {
        activeBg,
        activeText,
        normalBg,
        normalText,
        hoverBg,
        hoverText
    };
}
