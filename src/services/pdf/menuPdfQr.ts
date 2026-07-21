// QR verso il menù pubblico (Stage 3b). PNG data-URL via `qrcode` (MIT),
// funziona sia in browser che in Node (encoder PNG puro JS).
import QRCode from "qrcode";

export async function generateQrDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
        errorCorrectionLevel: "Q",
        margin: 2,
        width: 512,
        color: { dark: "#000000", light: "#ffffff" }
    });
}
