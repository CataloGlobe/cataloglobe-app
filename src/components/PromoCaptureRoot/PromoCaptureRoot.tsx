import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { capturePromoFromUrl } from "@/utils/promoCode";

export function PromoCaptureRoot() {
    const location = useLocation();

    useEffect(() => {
        capturePromoFromUrl(new URLSearchParams(location.search));
    }, [location.search]);

    return null;
}
