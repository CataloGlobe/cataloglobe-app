import type { CatalogPdfData, PdfSection } from "./catalogPdfData";

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(input: string): string {
    return escapeHtml(input);
}

function resolveFontFamily(value: string) {
    switch (value) {
        case "outfit":
            return "\"Outfit\", \"Segoe UI\", Arial, sans-serif";
        case "poppins":
            return "\"Poppins\", \"Segoe UI\", Arial, sans-serif";
        case "inter":
        default:
            return "\"Inter\", \"Segoe UI\", Arial, sans-serif";
    }
}

function formatPrice(price: number | null): string | null {
    if (price === null) return null;
    return `€ ${price.toFixed(2)}`;
}

function buildAddress(address: string | null, city: string | null): string | null {
    const parts = [address, city].filter(Boolean) as string[];
    if (parts.length === 0) return null;
    return parts.join(", ");
}

function renderSection(section: PdfSection, template: string, showImages: boolean) {
    const itemsHtml = section.items
        .map(item => {
            const price = formatPrice(item.price);
            const imageHtml = showImages
                ? item.image
                    ? `<img class="item__image" src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" />`
                    : `<div class="item__image placeholder" aria-hidden="true"></div>`
                : "";

            const descriptionHtml = item.description
                ? `<div class="item__description">${escapeHtml(item.description)}</div>`
                : "";

            return `
                <article class="item" data-template="${template}">
                    ${imageHtml}
                    <div class="item__body">
                        <div class="item__header">
                            <div class="item__name">${escapeHtml(item.name)}</div>
                            ${price ? `<div class="item__price">${price}</div>` : ""}
                        </div>
                        ${descriptionHtml}
                    </div>
                </article>
            `;
        })
        .join("");

    return `
        <section class="section">
            <h2 class="section__title">${escapeHtml(section.name)}</h2>
            <div class="items">${itemsHtml}</div>
        </section>
    `;
}

export function renderCatalogPdfHtml(data: CatalogPdfData): string {
    const { business, collection, sections, style } = data;
    const fontFamily = resolveFontFamily(style.fontFamily);
    const address = buildAddress(business.address, business.city);
    const showImages = style.cardTemplate !== "no-image";
    const coverHtml = business.coverImage
        ? `<img class="cover" src="${escapeAttr(business.coverImage)}" alt="${escapeAttr(business.name)}" />`
        : `<div class="cover placeholder" aria-hidden="true"></div>`;

    const sectionsHtml = sections.map(section =>
        renderSection(section, style.cardTemplate, showImages)
    ).join("");

    const now = new Date();
    const generatedAt = `${now.toISOString().slice(0, 10)} ${now
        .toTimeString()
        .slice(0, 5)}`;

    return `
        <!doctype html>
        <html lang="it">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>${escapeHtml(collection.name)} - PDF</title>
                <style>
                    @page {
                        size: A4;
                        margin: 16mm 14mm;
                    }
                    :root {
                        --page-bg: ${style.backgroundColor};
                        --header-bg: ${style.headerBackgroundColor};
                        --accent: ${style.sectionNavColor};
                        --card-bg: ${style.cardBackgroundColor};
                        --card-radius: ${style.cardRadius}px;
                        --hero-radius: ${style.heroImageRadius}px;
                        --font-body: ${fontFamily};
                    }
                    * {
                        box-sizing: border-box;
                    }
                    html,
                    body {
                        padding: 0;
                        margin: 0;
                        background: var(--page-bg);
                        color: #111827;
                        font-family: var(--font-body);
                        font-size: 12px;
                        line-height: 1.45;
                    }
                    .page {
                        width: 100%;
                    }
                    .header {
                        display: flex;
                        gap: 16px;
                        align-items: center;
                        padding: 14px 16px;
                        background: var(--header-bg);
                        border-radius: var(--hero-radius);
                        border: 1px solid #e5e7eb;
                        margin-bottom: 16px;
                    }
                    .header__meta {
                        flex: 1;
                        min-width: 0;
                    }
                    .title {
                        font-size: 20px;
                        font-weight: 700;
                        margin: 0;
                    }
                    .subtitle {
                        margin-top: 4px;
                        font-size: 14px;
                        font-weight: 600;
                        color: #374151;
                    }
                    .address {
                        margin-top: 6px;
                        font-size: 12px;
                        color: #6b7280;
                    }
                    .cover {
                        width: 72px;
                        height: 72px;
                        border-radius: 10px;
                        object-fit: cover;
                        background: #f3f4f6;
                        flex-shrink: 0;
                    }
                    .section {
                        margin-top: 16px;
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                    .section__title {
                        font-size: 15px;
                        font-weight: 700;
                        margin: 0 0 8px;
                        color: var(--accent);
                    }
                    .items {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }
                    .item {
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        padding: 10px 12px;
                        border: 1px solid #e5e7eb;
                        border-radius: var(--card-radius);
                        background: var(--card-bg);
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                    .item[data-template="right"] {
                        flex-direction: row-reverse;
                    }
                    .item[data-template="no-image"] .item__image {
                        display: none;
                    }
                    .item__image {
                        width: 60px;
                        height: 60px;
                        border-radius: 8px;
                        object-fit: cover;
                        background: #f3f4f6;
                        flex-shrink: 0;
                    }
                    .item__body {
                        flex: 1;
                        min-width: 0;
                    }
                    .item__header {
                        display: flex;
                        align-items: baseline;
                        justify-content: space-between;
                        gap: 12px;
                    }
                    .item__name {
                        font-size: 13px;
                        font-weight: 700;
                        color: #111827;
                    }
                    .item__price {
                        font-size: 12px;
                        font-weight: 700;
                        color: #111827;
                        white-space: nowrap;
                    }
                    .item__description {
                        margin-top: 4px;
                        color: #6b7280;
                        font-size: 11px;
                    }
                    .footer {
                        margin-top: 20px;
                        color: #9ca3af;
                        font-size: 10px;
                    }
                    @media print {
                        .item,
                        .section {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="page">
                    <header class="header">
                        <div class="header__meta">
                            <h1 class="title">${escapeHtml(business.name)}</h1>
                            <div class="subtitle">${escapeHtml(collection.name)}</div>
                            ${address ? `<div class="address">${escapeHtml(address)}</div>` : ""}
                        </div>
                        ${coverHtml}
                    </header>

                    ${sectionsHtml}

                    <div class="footer">Generato il ${generatedAt}</div>
                </div>
            </body>
        </html>
    `;
}
