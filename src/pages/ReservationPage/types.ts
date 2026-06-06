import type { ResolvedStyle } from "@/types/resolvedCollections";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

export type Brand = {
    brandName: string;
    resolvedStyle: ResolvedStyle | null;
    tenantLogoUrl: string | null;
    coverImage: string | null;
    phone: string | null;
    phonePublic: boolean;
    /** Configured weekday opening hours. Empty array = validation disabled. */
    hours: OpeningHoursEntry[];
    /** Upcoming closures (max 10 from resolve-public-catalog). */
    closures: UpcomingClosure[];
};

export type ResolveState =
    | { status: "loading" }
    | { status: "not-found" }
    | { status: "network-error" }
    | { status: "inactive"; brand: Brand | null }
    | { status: "reservations-disabled"; brand: Brand }
    | { status: "ready"; brand: Brand };

export type FormFields = {
    reservation_date: string;
    reservation_time: string;
    party_size: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes: string;
};

export type FieldErrors = Partial<Record<keyof FormFields, string>>;

export type Phase = "form" | "submitting" | "success";

export const EMPTY_FORM: FormFields = {
    reservation_date: "",
    reservation_time: "",
    party_size: "2",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: ""
};
