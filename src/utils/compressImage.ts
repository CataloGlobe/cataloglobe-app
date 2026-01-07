export async function compressImage(file: File, maxWidth = 900, quality = 0.8): Promise<File> {
    return new Promise(resolve => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement("canvas");

            const scale = img.width > maxWidth ? maxWidth / img.width : 1;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 🔥 Mantieni il formato originale
            const originalType = file.type; // "image/png", "image/jpeg", "image/webp"

            // PNG → mantieni PNG (per la trasparenza)
            // WEBP → mantieni WEBP
            // JPEG → comprimi JPEG
            const outputType =
                originalType === "image/png"
                    ? "image/png"
                    : originalType === "image/webp"
                    ? "image/webp"
                    : "image/jpeg";

            canvas.toBlob(
                blob => {
                    resolve(
                        new File([blob!], file.name, {
                            type: outputType
                        })
                    );
                },
                outputType,
                quality
            );
        };
    });
}
