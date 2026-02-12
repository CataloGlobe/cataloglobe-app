import { useState, useId } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { downloadMenuPdf, DownloadMenuPdfError } from "@/services/pdf/downloadMenuPdf";

type DownloadMenuButtonProps = {
    businessId: string;
    className?: string;
};

export function DownloadMenuButton({ businessId, className }: DownloadMenuButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const errorId = useId();

    const handleDownload = async () => {
        setLoading(true);
        setError(null);

        try {
            await downloadMenuPdf(businessId);
        } catch (err) {
            if (err instanceof DownloadMenuPdfError) {
                setError(err.message);
            } else {
                setError("Errore imprevisto.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={className} role="group" aria-label="Download menu PDF">
            <Button
                type="button"
                variant="secondary"
                onClick={handleDownload}
                loading={loading}
                disabled={loading}
                aria-label="Scarica menu in PDF"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={!!error}
            >
                {loading ? "Download in corso..." : "Scarica PDF"}
            </Button>
            {error && (
                <Text
                    id={errorId}
                    as="p"
                    variant="body"
                    colorVariant="warning"
                    role="alert"
                    aria-live="polite"
                    style={{ marginTop: "0.25rem" }}
                >
                    {error}
                </Text>
            )}
        </div>
    );
}
