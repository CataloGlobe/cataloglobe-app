import type { FC } from "react";

export { default as OrganicLeafIcon } from "./OrganicLeafIcon";
export { default as RawFishIcon } from "./RawFishIcon";
export { default as CoravinDropIcon } from "./CoravinDropIcon";
export { default as FishLeafIcon } from "./FishLeafIcon";
export { default as ThermometerSnowIcon } from "./ThermometerSnowIcon";
export { default as RollingPinIcon } from "./RollingPinIcon";
export { default as Pepper1Icon } from "./Pepper1Icon";
export { default as Pepper2Icon } from "./Pepper2Icon";
export { default as Pepper3Icon } from "./Pepper3Icon";
export { default as SignatureIcon } from "./SignatureIcon";
export { default as GarlicIcon } from "./GarlicIcon";
export { default as OnionIcon } from "./OnionIcon";
export { default as PigIcon } from "./PigIcon";
export { default as MapPinIcon } from "./MapPinIcon";
export { default as AwardIcon } from "./AwardIcon";
export { default as WineIcon } from "./WineIcon";
export { default as CoffeeIcon } from "./CoffeeIcon";
export { default as ClockIcon } from "./ClockIcon";
export { default as SparklesIcon } from "./SparklesIcon";
export { default as TrendingUpIcon } from "./TrendingUpIcon";
export { default as WheatOffIcon } from "./WheatOffIcon";
export { default as MilkOffIcon } from "./MilkOffIcon";
export { default as CalendarIcon } from "./CalendarIcon";
export { default as SproutIcon } from "./SproutIcon";
export { default as LeafIcon } from "./LeafIcon";
export { default as SnowflakeIcon } from "./SnowflakeIcon";
export { default as HalalIcon } from "./HalalIcon";
export { default as KosherIcon } from "./KosherIcon";
export { default as SlowFoodIcon } from "./SlowFoodIcon";
export { default as FiviIcon } from "./FiviIcon";
export { default as AdultsOnlyIcon } from "./AdultsOnlyIcon";

import OrganicLeafIcon from "./OrganicLeafIcon";
import RawFishIcon from "./RawFishIcon";
import CoravinDropIcon from "./CoravinDropIcon";
import FishLeafIcon from "./FishLeafIcon";
import ThermometerSnowIcon from "./ThermometerSnowIcon";
import RollingPinIcon from "./RollingPinIcon";
import Pepper1Icon from "./Pepper1Icon";
import Pepper2Icon from "./Pepper2Icon";
import Pepper3Icon from "./Pepper3Icon";
import SignatureIcon from "./SignatureIcon";
import GarlicIcon from "./GarlicIcon";
import OnionIcon from "./OnionIcon";
import PigIcon from "./PigIcon";
import MapPinIcon from "./MapPinIcon";
import AwardIcon from "./AwardIcon";
import WineIcon from "./WineIcon";
import CoffeeIcon from "./CoffeeIcon";
import ClockIcon from "./ClockIcon";
import SparklesIcon from "./SparklesIcon";
import TrendingUpIcon from "./TrendingUpIcon";
import WheatOffIcon from "./WheatOffIcon";
import MilkOffIcon from "./MilkOffIcon";
import CalendarIcon from "./CalendarIcon";
import SproutIcon from "./SproutIcon";
import LeafIcon from "./LeafIcon";
import SnowflakeIcon from "./SnowflakeIcon";
import HalalIcon from "./HalalIcon";
import KosherIcon from "./KosherIcon";
import SlowFoodIcon from "./SlowFoodIcon";
import FiviIcon from "./FiviIcon";
import AdultsOnlyIcon from "./AdultsOnlyIcon";

export interface CharacteristicSvgProps {
    size?: number;
    className?: string;
}

export const CUSTOM_CHARACTERISTIC_ICON_MAP: Record<string, FC<CharacteristicSvgProps>> = {
    "organic-leaf": OrganicLeafIcon,
    "raw-fish": RawFishIcon,
    "coravin-drop": CoravinDropIcon,
    "fish-leaf": FishLeafIcon,
    "thermometer-snow": ThermometerSnowIcon,
    "rolling-pin": RollingPinIcon,
    "pepper-1": Pepper1Icon,
    "pepper-2": Pepper2Icon,
    "pepper-3": Pepper3Icon,
    "signature": SignatureIcon,
    "garlic": GarlicIcon,
    "onion": OnionIcon,
    "pig": PigIcon,
    "map-pin": MapPinIcon,
    "award": AwardIcon,
    "wine": WineIcon,
    "coffee": CoffeeIcon,
    "clock": ClockIcon,
    "sparkles": SparklesIcon,
    "trending-up": TrendingUpIcon,
    "wheat-off": WheatOffIcon,
    "milk-off": MilkOffIcon,
    "calendar": CalendarIcon,
    "sprout": SproutIcon,
    "leaf": LeafIcon,
    "snowflake": SnowflakeIcon,
    "halal": HalalIcon,
    "kosher": KosherIcon,
    "slow-food": SlowFoodIcon,
    "fivi": FiviIcon,
    "18plus": AdultsOnlyIcon,
};
