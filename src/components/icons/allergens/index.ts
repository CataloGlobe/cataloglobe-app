import type { FC } from "react";

export interface AllergenSvgProps {
    size?: number;
    className?: string;
}

export { default as GlutenIcon } from "./GlutenIcon";
export { default as CrustaceansIcon } from "./CrustaceansIcon";
export { default as EggsIcon } from "./EggsIcon";
export { default as FishIcon } from "./FishIcon";
export { default as PeanutsIcon } from "./PeanutsIcon";
export { default as SoybeansIcon } from "./SoybeansIcon";
export { default as MilkIcon } from "./MilkIcon";
export { default as NutsIcon } from "./NutsIcon";
export { default as CeleryIcon } from "./CeleryIcon";
export { default as MustardIcon } from "./MustardIcon";
export { default as SesameIcon } from "./SesameIcon";
export { default as SulphitesIcon } from "./SulphitesIcon";
export { default as LupinIcon } from "./LupinIcon";
export { default as MolluscsIcon } from "./MolluscsIcon";

import GlutenIcon from "./GlutenIcon";
import CrustaceansIcon from "./CrustaceansIcon";
import EggsIcon from "./EggsIcon";
import FishIcon from "./FishIcon";
import PeanutsIcon from "./PeanutsIcon";
import SoybeansIcon from "./SoybeansIcon";
import MilkIcon from "./MilkIcon";
import NutsIcon from "./NutsIcon";
import CeleryIcon from "./CeleryIcon";
import MustardIcon from "./MustardIcon";
import SesameIcon from "./SesameIcon";
import SulphitesIcon from "./SulphitesIcon";
import LupinIcon from "./LupinIcon";
import MolluscsIcon from "./MolluscsIcon";

export const ALLERGEN_ICON_MAP: Record<string, FC<AllergenSvgProps>> = {
    gluten: GlutenIcon,
    crustaceans: CrustaceansIcon,
    eggs: EggsIcon,
    fish: FishIcon,
    peanuts: PeanutsIcon,
    soybeans: SoybeansIcon,
    soy: SoybeansIcon,
    milk: MilkIcon,
    nuts: NutsIcon,
    celery: CeleryIcon,
    mustard: MustardIcon,
    sesame: SesameIcon,
    sulphites: SulphitesIcon,
    lupin: LupinIcon,
    lupins: LupinIcon,
    molluscs: MolluscsIcon,
};
