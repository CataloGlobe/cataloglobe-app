import { useEffect } from "react";

export default function EmailConfirmed() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const confirmationUrl = params.get("confirmation_url");

        if (confirmationUrl) {
            const decoded = decodeURIComponent(confirmationUrl);
            window.location.href = decoded;
        }
    }, []);

    return (
        <div style={{ padding: 40, textAlign: "center" }}>
            Verifica della tua email in corso...
        </div>
    );
}
