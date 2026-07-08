import { describe, it, expect } from "vitest";
import { getVideoEmbedUrl } from "@/utils/videoEmbed";

describe("getVideoEmbedUrl", () => {
    it("estrae l'ID da un URL YouTube watch", () => {
        expect(getVideoEmbedUrl("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
            "https://www.youtube.com/embed/dQw4w9WgXcQ"
        );
    });

    it("estrae l'ID da un URL youtu.be", () => {
        expect(getVideoEmbedUrl("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(
            "https://www.youtube.com/embed/dQw4w9WgXcQ"
        );
    });

    it("estrae l'ID da un URL già in forma embed", () => {
        expect(getVideoEmbedUrl("youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
            "https://www.youtube.com/embed/dQw4w9WgXcQ"
        );
    });

    it("accetta un ID YouTube grezzo", () => {
        expect(getVideoEmbedUrl("youtube", "dQw4w9WgXcQ")).toBe(
            "https://www.youtube.com/embed/dQw4w9WgXcQ"
        );
    });

    it("estrae l'ID da un URL Vimeo", () => {
        expect(getVideoEmbedUrl("vimeo", "https://vimeo.com/76979871")).toBe(
            "https://player.vimeo.com/video/76979871"
        );
    });

    it("estrae l'ID da un URL Vimeo con /video/", () => {
        expect(getVideoEmbedUrl("vimeo", "https://vimeo.com/video/76979871")).toBe(
            "https://player.vimeo.com/video/76979871"
        );
    });

    it("accetta un ID Vimeo grezzo", () => {
        expect(getVideoEmbedUrl("vimeo", "76979871")).toBe(
            "https://player.vimeo.com/video/76979871"
        );
    });

    it("ritorna null per un ref non parsabile", () => {
        expect(getVideoEmbedUrl("youtube", "non un url valido")).toBeNull();
        expect(getVideoEmbedUrl("vimeo", "")).toBeNull();
    });
});
