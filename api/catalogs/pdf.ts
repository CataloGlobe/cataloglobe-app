import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { getSupabaseAdminClient } from "../_lib/supabaseAdmin.js";
import { fetchCatalogPdfData } from "../_lib/catalogPdfData.js";
import { renderCatalogPdfHtml } from "../_lib/catalogPdfTemplate.js";

type VercelRequest = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
    status: (code: number) => VercelResponse;
    json: (body: unknown) => void;
    send: (body: unknown) => void;
    setHeader: (name: string, value: string) => void;
};

function getHeader(req: VercelRequest, name: string) {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

function toSafeSlug(input: string) {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function buildFileName(businessSlug: string, catalogName: string) {
    const safeBusiness = toSafeSlug(businessSlug) || "business";
    const safeCatalog = toSafeSlug(catalogName) || "catalogo";
    return `${safeBusiness}-${safeCatalog}.pdf`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        if (req.method !== "GET") {
            res.status(405).json({ error: "Metodo non consentito." });
            return;
        }

        const catalogIdParam = req.query.catalogId;
        const catalogId = Array.isArray(catalogIdParam) ? catalogIdParam[0] : catalogIdParam;

        const businessIdParam = req.query.businessId;
        const businessId = Array.isArray(businessIdParam) ? businessIdParam[0] : businessIdParam;

        if (!catalogId || !businessId) {
            res.status(400).json({ error: "catalogId o businessId mancante." });
            return;
        }

        const authHeader = getHeader(req, "authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ error: "Token mancante." });
            return;
        }

        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) {
            res.status(401).json({ error: "Token non valido." });
            return;
        }

        const supabase = getSupabaseAdminClient();

        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData.user) {
            res.status(401).json({ error: "Sessione non valida." });
            return;
        }

        const data = await fetchCatalogPdfData({
            supabase,
            userId: userData.user.id,
            businessId,
            catalogId
        });

        const html = renderCatalogPdfHtml(data);

        const executablePath = process.env.CHROMIUM_PATH ?? (await chromium.executablePath());
        const browser = await playwrightChromium.launch(
            executablePath
                ? {
                      args: chromium.args,
                      executablePath,
                      headless: true
                  }
                : {
                      channel: "chrome",
                      headless: true,
                      args: ["--no-sandbox", "--disable-setuid-sandbox"]
                  }
        );

        try {
            const context = await browser.newContext({
                viewport: {
                    width: 1280,
                    height: 720,
                    deviceScaleFactor: 1
                }
            });
            const page = await context.newPage();
            await page.setContent(html, { waitUntil: "networkidle" });

            const pdf = await page.pdf({
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true,
                margin: {
                    top: "16mm",
                    right: "14mm",
                    bottom: "16mm",
                    left: "14mm"
                }
            });

            const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
            const fileName = buildFileName(data.business.slug, data.collection.name);

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
                    fileName
                )}`
            );
            res.setHeader("Content-Length", String(pdfBuffer.length));
            res.setHeader("Cache-Control", "private, no-store, max-age=0");
            res.status(200).send(pdfBuffer);
        } finally {
            await browser.close();
        }
    } catch (error) {
        console.error("[catalog-pdf] error:", error);
        const message = error instanceof Error ? error.message : "Errore interno.";
        res.status(500).json({ error: message });
    }
}
