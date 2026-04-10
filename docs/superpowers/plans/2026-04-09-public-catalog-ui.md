# Public Catalog UI — Header Hero, Footer, Scroll-to-top

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere hero-to-compact-sticky header con search, footer con social/branding, e scroll-to-top alla pagina pubblica del catalogo e alla sua anteprima nell'editor stile.

**Architecture:** Si crea `PublicCollectionHeader` (nuovo componente che sostituisce `PublicBrandHeader` + `CollectionHero` in `CollectionView`) con logica hero/compact + search. Il footer è un nuovo componente separato. Il search filtra le sezioni in `CollectionView`. Il `CollectionSectionNav` riceve un `topOffset` dinamico per coordinate z-index con il compact header. I dati mock in `StylePreview` vengono estesi.

**Tech Stack:** React 19, TypeScript strict, SCSS Modules, CSS custom properties `--pub-*`, Lucide React (già in progetto), posizionamento sticky/fixed.

---

## Chunk 1: Foundation — PublicCollectionHeader

### Task 1: Crea `PublicCollectionHeader` component e SCSS

**Files:**
- Create: `src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.tsx`
- Create: `src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.module.scss`

**Contesto chiave:**
- In `mode="public"`: compact header usa `position: fixed; top: 0` con animazione `translateY(-100%) → translateY(0)`. Questo richiede che la pagina abbia padding-top quando il compact header è visibile (gestito in Task 4).
- In `mode="preview"`: compact header usa `position: sticky; top: 0` ed è sempre visibile (nessuna animazione — il preview non supporta `fixed` relativo al container).
- La visibilità del compact header è rilevata con `IntersectionObserver` sul sentinel element alla fine del hero. Quando non c'è cover image, il compact header è immediatamente visibile.
- `onCompactVisibilityChange` callback permette a `CollectionView` di aggiornare `navTopOffset`.
- Il search bar si espande sotto il compact header con `max-height` transition.
- In `mode="preview"` senza cover image: il compact header è l'unico header e rappresenta già lo stato finale — nessun hero da mostrare.
- Il logo nel compact header: `max-height: 28px`. Il logo nell'info card hero: `max-height: 40px`.
- L'info card è sovrapposta al hero (absolute bottom, con backdrop blur e sfondo scuro semi-trasparente).
- Font: `var(--pub-font-family)` per tutto il body text; il nome attività nell'header usa `font-weight: 600`.

- [ ] **Step 1: Crea il file SCSS**

```scss
/* PublicCollectionHeader.module.scss */

/* ─── ROOT ──────────────────────────────────────────────────── */
.root {
  width: 100%;
}

/* ─── HERO AREA ─────────────────────────────────────────────── */
.heroArea {
  position: relative;
  width: 100%;
  height: 220px;
  overflow: hidden;
  background: var(--pub-header-bg);

  @media (min-width: 640px) {
    height: 280px;
  }

  :global(.preview-mobile) & {
    height: 220px;
  }

  :global(.preview-desktop) & {
    height: 280px;
  }
}

.heroCoverImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.heroImgPlaceholder {
  width: 100%;
  height: 100%;
  background: color-mix(in srgb, var(--pub-text) 8%, var(--pub-header-bg));
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--pub-text) 30%, transparent);
}

/* Sentinel (zero-height) alla fine del hero — osservato da IntersectionObserver */
.heroSentinel {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  pointer-events: none;
}

/* ─── INFO CARD (overlay sul hero) ─────────────────────────── */
.infoCard {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 12px;
  color: #fff;
}

.infoCardLogo {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.infoCardLogoPlaceholder {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.infoCardText {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.infoCardName {
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--pub-font-family, sans-serif);
}

.infoCardAddress {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--pub-font-family, sans-serif);
}

.infoCardSearchBtn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
}

/* ─── COMPACT STICKY BAR ────────────────────────────────────── */

/*
  PUBLIC (position:fixed): inizia fuori schermo, entra con slide
  PREVIEW (position:sticky): sempre visibile, sempre in flow
*/
.compactBar {
  width: 100%;
  background: var(--pub-bg);
  border-bottom: 1px solid var(--pub-border);
  z-index: 20;
  overflow: hidden;

  /* PUBLIC MODE: fixed + slide animation */
  &.compactFixed {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    transform: translateY(-100%);
    opacity: 0;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;

    &.compactVisible {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* PREVIEW MODE: sticky, always shown */
  &.compactSticky {
    position: sticky;
    top: 0;
  }
}

.compactInner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 1rem;
  height: 60px;
  max-width: 820px;
  margin: 0 auto;

  @media (min-width: 1024px) {
    max-width: 1024px;
  }

  :global(.preview-mobile) & {
    max-width: 100%;
  }

  :global(.preview-desktop) & {
    max-width: 1024px;
  }
}

.compactLogo {
  flex-shrink: 0;
  height: 28px;
  max-width: 80px;
  object-fit: contain;
}

.compactLogoPlaceholder {
  flex-shrink: 0;
  width: 60px;
  height: 28px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--pub-text) 10%, transparent);
}

.compactName {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--pub-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--pub-font-family, sans-serif);
}

.compactSearchBtn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--pub-border);
  background: var(--pub-surface);
  color: var(--pub-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--pub-text) 5%, var(--pub-surface));
  }

  &.searchActive {
    color: var(--pub-primary);
    border-color: var(--pub-primary);
    background: var(--pub-primary-soft);
  }
}

/* ─── SEARCH BAR (expandable) ───────────────────────────────── */
.searchBar {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--pub-bg);
  border-bottom: 1px solid transparent;

  &.searchBarOpen {
    max-height: 80px;
    border-bottom-color: var(--pub-border);
  }
}

.searchInner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.6rem 1rem;
  max-width: 820px;
  margin: 0 auto;

  @media (min-width: 1024px) {
    max-width: 1024px;
  }

  :global(.preview-mobile) & {
    max-width: 100%;
  }
}

.searchInput {
  flex: 1;
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid var(--pub-border);
  border-radius: var(--pub-btn-radius, 8px);
  background: var(--pub-surface);
  color: var(--pub-text);
  font-size: 0.875rem;
  font-family: var(--pub-font-family, sans-serif);
  outline: none;
  transition: border-color 0.15s ease;

  &::placeholder {
    color: var(--pub-text-muted);
  }

  &:focus {
    border-color: var(--pub-primary);
  }
}

.searchClearBtn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--pub-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s ease;

  &:hover {
    color: var(--pub-text);
  }
}
```

- [ ] **Step 2: Crea il componente TSX**

```tsx
// PublicCollectionHeader.tsx
import { useEffect, useRef, useState, type RefObject } from "react";
import { ImageIcon, Search, X } from "lucide-react";
import styles from "./PublicCollectionHeader.module.scss";

export type PublicCollectionHeaderProps = {
    logoUrl?: string | null;
    activityName: string;
    activityAddress?: string | null;
    coverImageUrl?: string | null;
    showCoverImage: boolean;
    showLogo: boolean;
    mode: "public" | "preview";
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onCompactVisibilityChange?: (visible: boolean) => void;
    /** Scroll container for IntersectionObserver root (preview only). */
    scrollContainerEl?: HTMLElement | null;
};

export default function PublicCollectionHeader({
    logoUrl,
    activityName,
    activityAddress,
    coverImageUrl,
    showCoverImage,
    showLogo,
    mode,
    searchQuery,
    onSearchChange,
    onCompactVisibilityChange,
    scrollContainerEl
}: PublicCollectionHeaderProps) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [isCompact, setIsCompact] = useState(!showCoverImage || mode === "preview");
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // In preview mode compact is always visible; in public detect via IntersectionObserver
    useEffect(() => {
        if (mode === "preview" || !showCoverImage) {
            setIsCompact(true);
            onCompactVisibilityChange?.(true);
            return;
        }

        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const root = scrollContainerEl ?? null; // null = viewport
        const observer = new IntersectionObserver(
            ([entry]) => {
                const visible = !entry.isIntersecting;
                setIsCompact(visible);
                onCompactVisibilityChange?.(visible);
            },
            { root, threshold: 0, rootMargin: "0px" }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [mode, showCoverImage, scrollContainerEl, onCompactVisibilityChange]);

    const toggleSearch = () => {
        setIsSearchOpen(prev => {
            const next = !prev;
            if (next) {
                // Focus input on next tick after CSS transition starts
                requestAnimationFrame(() => {
                    searchInputRef.current?.focus();
                });
            } else {
                onSearchChange("");
            }
            return next;
        });
    };

    const isPublic = mode === "public";
    const compactBarClass = [
        styles.compactBar,
        isPublic ? styles.compactFixed : styles.compactSticky,
        isCompact && isPublic ? styles.compactVisible : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={styles.root}>
            {/* ── HERO AREA ── */}
            {showCoverImage && (
                <div className={styles.heroArea}>
                    {coverImageUrl ? (
                        <img
                            src={coverImageUrl}
                            alt=""
                            role="presentation"
                            className={styles.heroCoverImg}
                        />
                    ) : mode === "preview" ? (
                        <div className={styles.heroImgPlaceholder}>
                            <ImageIcon size={28} strokeWidth={1.5} />
                        </div>
                    ) : (
                        <div className={styles.heroImgPlaceholder} aria-hidden />
                    )}

                    {/* Info card overlay */}
                    <div className={styles.infoCard}>
                        {showLogo &&
                            (logoUrl ? (
                                <div className={styles.infoCardLogo}>
                                    <img src={logoUrl} alt={`Logo ${activityName}`} />
                                </div>
                            ) : mode === "preview" ? (
                                <div className={styles.infoCardLogoPlaceholder} />
                            ) : null)}

                        <div className={styles.infoCardText}>
                            <span className={styles.infoCardName}>{activityName}</span>
                            {activityAddress && (
                                <span className={styles.infoCardAddress}>{activityAddress}</span>
                            )}
                        </div>

                        <button
                            type="button"
                            className={styles.infoCardSearchBtn}
                            onClick={toggleSearch}
                            aria-label="Cerca nel catalogo"
                        >
                            <Search size={16} strokeWidth={2} />
                        </button>
                    </div>

                    {/* Sentinel at hero bottom for IntersectionObserver */}
                    <div ref={sentinelRef} className={styles.heroSentinel} aria-hidden />
                </div>
            )}

            {/* ── COMPACT STICKY / FIXED BAR ── */}
            <div className={compactBarClass}>
                <div className={styles.compactInner}>
                    {showLogo &&
                        (logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={`Logo ${activityName}`}
                                className={styles.compactLogo}
                            />
                        ) : mode === "preview" ? (
                            <div className={styles.compactLogoPlaceholder} />
                        ) : null)}

                    <span className={styles.compactName}>{activityName}</span>

                    <button
                        type="button"
                        className={`${styles.compactSearchBtn}${isSearchOpen ? ` ${styles.searchActive}` : ""}`}
                        onClick={toggleSearch}
                        aria-label={isSearchOpen ? "Chiudi ricerca" : "Cerca nel catalogo"}
                        aria-expanded={isSearchOpen}
                    >
                        {isSearchOpen ? (
                            <X size={16} strokeWidth={2} />
                        ) : (
                            <Search size={16} strokeWidth={2} />
                        )}
                    </button>
                </div>

                {/* Expandable search bar */}
                <div
                    className={`${styles.searchBar}${isSearchOpen ? ` ${styles.searchBarOpen}` : ""}`}
                    aria-hidden={!isSearchOpen}
                >
                    <div className={styles.searchInner}>
                        <input
                            ref={searchInputRef}
                            type="search"
                            className={styles.searchInput}
                            placeholder="Cerca nel catalogo…"
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            tabIndex={isSearchOpen ? 0 : -1}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.searchClearBtn}
                                onClick={() => onSearchChange("")}
                                aria-label="Cancella ricerca"
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Verifica che TypeScript non abbia errori**

```bash
cd /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe
npx tsc --noEmit 2>&1 | head -40
```

Atteso: 0 errori relativi ai nuovi file (possibili errori altrove già esistenti prima).

- [ ] **Step 4: Commit**

```bash
git add src/components/PublicCollectionView/PublicCollectionHeader/
git commit -m "feat(public): create PublicCollectionHeader with hero-to-compact-sticky and search"
```

---

### Task 2: Crea `PublicFooter` component

**Files:**
- Create: `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`
- Create: `src/components/PublicCollectionView/PublicFooter/PublicFooter.module.scss`

**Note di design:**
- Icone social SVG inline (no dipendenze extra)
- Hover: background scuro, icona bianca (sfondo `var(--pub-text)`, colore icona `var(--pub-bg)`)
- Logo CataloGlobe: SVG semplice inline (cerchio + testo stilizzato) come simbolo
- Link CataloGlobe: href fisso `https://cataloglobe.com` con `target="_blank" rel="noopener noreferrer"`
- Link Privacy e T&C: `href="#"` placeholder
- Testo "POWERED BY": `font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em`
- Il footer usa esclusivamente `var(--pub-*)` CSS vars per adattarsi al tema

- [ ] **Step 5: Crea SCSS**

```scss
/* PublicFooter.module.scss */

.footer {
  width: 100%;
  padding: 2rem 1rem 2.5rem;
  background: var(--pub-bg);
  border-top: 1px solid var(--pub-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

/* ── SOCIAL ROW ─────────────────────────────────────────── */
.socialRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.socialBtn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--pub-border);
  background: var(--pub-surface);
  color: var(--pub-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: var(--pub-text);
    color: var(--pub-bg);
    border-color: var(--pub-text);
  }

  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

/* ── SEPARATOR ──────────────────────────────────────────── */
.separator {
  width: 100%;
  max-width: 320px;
  height: 1px;
  background: var(--pub-border);
}

/* ── POWERED BY ─────────────────────────────────────────── */
.poweredBy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  text-decoration: none;
  color: inherit;

  &:hover .brandName {
    opacity: 0.8;
  }
}

.poweredByLabel {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
}

.brandRow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brandName {
  font-size: 0.95rem;
  font-weight: 700;
  color: #6366f1;
  font-family: var(--pub-font-family, sans-serif);
  transition: opacity 0.15s ease;
}

/* ── LEGAL LINKS ─────────────────────────────────────────── */
.legalRow {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
}

.legalLink {
  color: var(--pub-text-muted);
  text-decoration: none;
  transition: color 0.15s ease;

  &:hover {
    color: var(--pub-text-secondary);
    text-decoration: underline;
  }
}

.legalDot {
  opacity: 0.5;
}
```

- [ ] **Step 6: Crea TSX**

```tsx
// PublicFooter.tsx

import styles from "./PublicFooter.module.scss";

/* ── SVG Icons inline ─────────────────────────────────────── */
function IconGlobe() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );
}

function IconInstagram() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
    );
}

function IconFacebook() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
    );
}

function IconWhatsApp() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
    );
}

/* ── CataloGlobe logo SVG ─────────────────────────────────── */
function CataloGlobeLogo() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
        >
            <circle cx="10" cy="10" r="9" stroke="#6366f1" strokeWidth="1.5" />
            <ellipse cx="10" cy="10" rx="4" ry="9" stroke="#6366f1" strokeWidth="1.5" />
            <line x1="1" y1="10" x2="19" y2="10" stroke="#6366f1" strokeWidth="1.5" />
        </svg>
    );
}

/* ── Component ───────────────────────────────────────────────── */
export default function PublicFooter() {
    return (
        <footer className={styles.footer}>
            {/* Social icons — placeholder, href="#" */}
            <div className={styles.socialRow}>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Sito web"
                    onClick={e => e.preventDefault()}
                >
                    <IconGlobe />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Instagram"
                    onClick={e => e.preventDefault()}
                >
                    <IconInstagram />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="Facebook"
                    onClick={e => e.preventDefault()}
                >
                    <IconFacebook />
                </a>
                <a
                    href="#"
                    className={styles.socialBtn}
                    aria-label="WhatsApp"
                    onClick={e => e.preventDefault()}
                >
                    <IconWhatsApp />
                </a>
            </div>

            <div className={styles.separator} aria-hidden />

            {/* Powered by CataloGlobe */}
            <a
                href="https://cataloglobe.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.poweredBy}
                aria-label="Powered by CataloGlobe"
            >
                <span className={styles.poweredByLabel}>Powered by</span>
                <div className={styles.brandRow}>
                    <CataloGlobeLogo />
                    <span className={styles.brandName}>CataloGlobe</span>
                </div>
            </a>

            <div className={styles.separator} aria-hidden />

            {/* Legal */}
            <div className={styles.legalRow}>
                <a
                    href="#"
                    className={styles.legalLink}
                    onClick={e => e.preventDefault()}
                >
                    Privacy Policy
                </a>
                <span className={styles.legalDot}>·</span>
                <a
                    href="#"
                    className={styles.legalLink}
                    onClick={e => e.preventDefault()}
                >
                    Termini e Condizioni
                </a>
            </div>
        </footer>
    );
}
```

- [ ] **Step 7: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 8: Commit**

```bash
git add src/components/PublicCollectionView/PublicFooter/
git commit -m "feat(public): create PublicFooter with social placeholders, powered-by, and legal links"
```

---

## Chunk 2: Integration — CollectionView, SectionNav, StylePreview

### Task 3: Aggiorna `CollectionSectionNav` per accettare `topOffset`

**Files:**
- Modify: `src/components/PublicCollectionView/CollectionSectionNav/CollectionSectionNav.tsx`

**Nota:** Aggiungere SOLO la prop `topOffset`. Non toccare nient'altro.

- [ ] **Step 9: Aggiungi prop `topOffset` a CollectionSectionNavProps**

In `CollectionSectionNav.tsx`, aggiungi `topOffset?: number` al tipo `CollectionSectionNavProps` e applicalo come inline style sulla nav:

```tsx
// Tipo aggiornato:
export type CollectionSectionNavProps = {
    sections: { id: string; name: string }[];
    activeSectionId?: string | null;
    onSelect?: (sectionId: string) => void;
    variant?: "preview" | "public";
    style?: {
        shape?: "rounded" | "pill" | "square";
        navStyle?: "pill" | "chip" | "outline" | "tabs" | "dot" | "minimal";
    };
    topOffset?: number; // NEW: offset top per accomodare header compatto sopra
};
```

Nel JSX, aggiungere `style={{ top: topOffset ?? 0 }}` all'elemento `<nav>`:

```tsx
<nav
    className={styles.nav}
    data-variant={variant}
    data-nav-style={navStyle}
    aria-label="Navigazione sezioni del catalogo"
    style={{ top: topOffset ?? 0 }}
>
```

**ATTENZIONE:** il CSS esistente ha `top: 0` nel SCSS. L'inline style ha priorità maggiore, quindi funziona correttamente. Il SCSS rimane invariato.

- [ ] **Step 10: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 11: Commit**

```bash
git add src/components/PublicCollectionView/CollectionSectionNav/CollectionSectionNav.tsx
git commit -m "feat(public): add topOffset prop to CollectionSectionNav for compact header coordination"
```

---

### Task 4: Integra tutto in `CollectionView`

**Files:**
- Modify: `src/components/PublicCollectionView/CollectionView/CollectionView.tsx`
- Modify: `src/components/PublicCollectionView/CollectionView/CollectionView.module.scss`

**Cosa cambia in CollectionView.tsx:**
1. Nuove props: `activityAddress?: string | null`
2. Rimozione utilizzo di `PublicBrandHeader` e `CollectionHero` (i componenti rimangono, non vengono più usati qui)
3. Aggiunta import `PublicCollectionHeader`, `PublicFooter`
4. Nuovo state: `searchQuery`, `isCompactHeaderVisible`
5. `filteredSections` (memoized, filtra per nome/descrizione)
6. `navTopOffset` derivato da `isCompactHeaderVisible`
7. Costanti aggiornate: `COMPACT_HEADER_HEIGHT = 60`, `SCROLL_OFFSET` ricalcolato
8. In `mode="public"`: quando compact header visible, aggiungere `paddingTop: COMPACT_HEADER_HEIGHT` al `<main>` (perché fixed è out-of-flow)
9. Scroll-to-top button: state `showScrollToTop`, listener su scroll
10. `PublicFooter` aggiunto sotto il frame (solo fuori dall'emptyState)

**Cosa cambia in CollectionView.module.scss:**
1. `scroll-margin-top` aumentato per le sections
2. Nuovi stili per scroll-to-top button

- [ ] **Step 12: Aggiorna le costanti in CollectionView.tsx**

Trova il blocco:
```ts
const NAV_HEIGHT = 56; // CollectionSectionNav (~3.5rem)
const VISUAL_GAP = 16; // breathing room below sticky bar
const SCROLL_OFFSET = NAV_HEIGHT + VISUAL_GAP; // 72 px — heading fully visible
const STICKY_OFFSET = SCROLL_OFFSET + 4; // 76 px — detection threshold
```

Sostituisci con:
```ts
const COMPACT_HEADER_HEIGHT = 60; // PublicCollectionHeader compact bar
const NAV_HEIGHT = 56;            // CollectionSectionNav (~3.5rem)
const VISUAL_GAP = 16;            // breathing room below sticky bars
const SCROLL_OFFSET = COMPACT_HEADER_HEIGHT + NAV_HEIGHT + VISUAL_GAP; // 132px
const STICKY_OFFSET = SCROLL_OFFSET + 4;                                // 136px
```

- [ ] **Step 13: Aggiorna i Props type e import in CollectionView.tsx**

Sostituisci le import esistenti di `CollectionHero`, `PublicBrandHeader`:
```tsx
// RIMUOVI queste righe:
import CollectionHero from "../CollectionHero/CollectionHero";
import PublicBrandHeader from "../PublicBrandHeader/PublicBrandHeader";

// AGGIUNGI:
import PublicCollectionHeader from "../PublicCollectionHeader/PublicCollectionHeader";
import PublicFooter from "../PublicFooter/PublicFooter";
import { ChevronUp } from "lucide-react";
```

Aggiungi `activityAddress` al tipo Props:
```tsx
type Props = {
    businessName: string;
    businessImage: string | null;
    collectionTitle: string;
    sections: CollectionViewSection[];
    style: Required<CollectionStyle>;
    mode: "public" | "preview";
    contentId?: string;
    emptyState?: {
        title?: string;
        description?: string;
    };
    featuredHeroSlot?: ReactNode;
    featuredBeforeCatalogSlot?: ReactNode;
    tenantLogoUrl?: string | null;
    scrollContainerEl?: HTMLElement | null;
    activityAddress?: string | null; // NEW
};
```

- [ ] **Step 14: Aggiungi stati e logica search/compact/scrollTop nella funzione component**

Dopo gli state esistenti (`activeSectionId`, `selectedItem`), aggiungi:
```tsx
const [searchQuery, setSearchQuery] = useState("");
const [isCompactHeaderVisible, setIsCompactHeaderVisible] = useState(
    mode === "preview"
);
const [showScrollToTop, setShowScrollToTop] = useState(false);
```

Dopo `navItems` (useMemo), aggiungi:
```tsx
// Filtered sections based on search query
const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase().trim();
    return sections
        .map(section => ({
            ...section,
            items: section.items.filter(
                item =>
                    item.name.toLowerCase().includes(q) ||
                    (item.description?.toLowerCase().includes(q) ?? false)
            )
        }))
        .filter(section => section.items.length > 0);
}, [sections, searchQuery]);

const filteredNavItems: SectionNavItem[] = useMemo(
    () => filteredSections.map(s => ({ id: s.id, name: s.name })),
    [filteredSections]
);

const navTopOffset = isCompactHeaderVisible ? COMPACT_HEADER_HEIGHT : 0;
```

Dopo il `useEffect` per la scroll detection, aggiungi un secondo `useEffect` per scroll-to-top:
```tsx
useEffect(() => {
    const container = containerRef.current;
    function handleScroll() {
        const scrollTop =
            container === window
                ? window.scrollY
                : (container as HTMLElement).scrollTop;
        setShowScrollToTop(scrollTop > 300);
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
}, []);
```

- [ ] **Step 15: Aggiorna il JSX render di CollectionView**

Sostituisci il blocco JSX esistente del `<main>` con il seguente. Le differenze principali:
- `PublicBrandHeader` + `CollectionHero` → `PublicCollectionHeader`
- `navItems` → `filteredNavItems`
- `sections` → `filteredSections` nella render
- Aggiunta `style={{ paddingTop: ... }}` al `<main>` per compensare fixed compact header
- Aggiunta `PublicFooter` e scroll-to-top button
- `CollectionSectionNav` riceve `topOffset={navTopOffset}`

```tsx
return (
    <main
        className={styles.page}
        ref={pageRef}
        style={
            mode === "public" && isCompactHeaderVisible
                ? { paddingTop: COMPACT_HEADER_HEIGHT }
                : undefined
        }
    >
        {/* Skip link (solo public) */}
        {mode === "public" && (
            <a className={styles.skipLink} href={`#${contentId}`}>
                <Text variant="caption">Salta al contenuto</Text>
            </a>
        )}

        {/* HEADER — hero + compact sticky/fixed */}
        {(style.showLogo ||
            style.showCoverImage ||
            style.showActivityName ||
            style.showCatalogName) && (
            <PublicCollectionHeader
                logoUrl={tenantLogoUrl}
                activityName={businessName}
                activityAddress={activityAddress}
                coverImageUrl={businessImage}
                showCoverImage={style.showCoverImage}
                showLogo={style.showLogo}
                mode={mode}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onCompactVisibilityChange={setIsCompactHeaderVisible}
                scrollContainerEl={scrollContainerEl}
            />
        )}

        {featuredHeroSlot}

        {/* NAV — sticky, full-bleed */}
        {!emptyState && (
            <CollectionSectionNav
                sections={filteredNavItems}
                activeSectionId={activeSectionId}
                onSelect={scrollToSection}
                variant={mode === "public" ? "public" : "preview"}
                style={{
                    shape: style.sectionNavShape,
                    navStyle: style.sectionNavStyle
                }}
                topOffset={navTopOffset}
            />
        )}

        {/* FRAME — contenuto centrato e max-width responsivo */}
        <div className={styles.frame}>
            {emptyState ? (
                <div className={styles.emptyState}>
                    {emptyState.title && (
                        <Text as="h2" variant="title-sm" weight={700}>
                            {emptyState.title}
                        </Text>
                    )}
                    {emptyState.description && (
                        <Text variant="body" colorVariant="muted">
                            {emptyState.description}
                        </Text>
                    )}
                </div>
            ) : (
                <>
                    <div
                        id={contentId}
                        className={styles.container}
                        data-card-layout={style.cardLayout ?? "list"}
                    >
                        {featuredBeforeCatalogSlot}
                        {filteredSections.map(section => {
                            if (section.items.length === 0) return null;

                            return (
                                <section
                                    key={section.id}
                                    data-section-id={section.id}
                                    ref={el => {
                                        sectionRefs.current[section.id] = el;
                                    }}
                                    className={styles.section}
                                    aria-label={section.name}
                                >
                                    <Text as="h2" variant="title-sm" weight={700}>
                                        {section.name}
                                    </Text>

                                    <div className={styles.grid} role="list">
                                        {section.items.map(item => {
                                            const isDisabled = item.is_disabled === true;
                                            return (
                                                <article
                                                    key={item.id}
                                                    role="listitem"
                                                    className={`${styles.card}${isDisabled ? ` ${styles.disabledCard}` : ""}`}
                                                >
                                                    {isDisabled && (
                                                        <span className={styles.unavailableBadge}>
                                                            Non disponibile
                                                        </span>
                                                    )}
                                                    {item.parentSelected && (
                                                        <ProductRow
                                                            name={item.name}
                                                            fromPrice={item.from_price}
                                                            price={item.price}
                                                            effectivePrice={item.effective_price}
                                                            originalPrice={item.original_price}
                                                            description={item.description}
                                                            image={item.image}
                                                            showImage={
                                                                style.cardTemplate !== "no-image"
                                                            }
                                                            imageRight={style.cardTemplate === "right"}
                                                            mode={mode}
                                                            onClick={() => setSelectedItem(item)}
                                                            optionGroups={item.optionGroups}
                                                            attributes={item.attributes}
                                                            allergens={item.allergens}
                                                        />
                                                    )}
                                                    {(item.variants?.length ?? 0) > 0 && (
                                                        <>
                                                            <div className={styles.variantsDivider}>
                                                                {item.parentSelected && (
                                                                    <span className={styles.variantsLabel}>
                                                                        Varianti
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.variants!.map(v => (
                                                                <ProductRow
                                                                    key={v.id}
                                                                    name={v.name}
                                                                    price={v.price}
                                                                    originalPrice={v.original_price}
                                                                    fromPrice={v.from_price}
                                                                    description={v.description}
                                                                    image={v.image}
                                                                    showImage={
                                                                        style.cardTemplate !== "no-image"
                                                                    }
                                                                    imageRight={style.cardTemplate === "right"}
                                                                    mode={mode}
                                                                    optionGroups={v.optionGroups}
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setSelectedItem({
                                                                            id: v.id,
                                                                            name: v.name,
                                                                            parentSelected: true,
                                                                            price: v.price ?? null,
                                                                            original_price: v.original_price ?? null,
                                                                            from_price: v.from_price ?? null,
                                                                            image: v.image ?? null,
                                                                            description: v.description ?? null,
                                                                            ...(v.optionGroups && v.optionGroups.length > 0
                                                                                ? { optionGroups: v.optionGroups }
                                                                                : {}),
                                                                            ...(item.ingredients && item.ingredients.length > 0
                                                                                ? { ingredients: item.ingredients }
                                                                                : {})
                                                                        });
                                                                    }}
                                                                />
                                                            ))}
                                                        </>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    <ItemDetail
                        item={selectedItem}
                        isOpen={!!selectedItem}
                        onClose={() => setSelectedItem(null)}
                        mode={mode}
                    />
                </>
            )}
        </div>

        {/* FOOTER */}
        {!emptyState && <PublicFooter />}

        {/* SCROLL TO TOP */}
        {showScrollToTop && (
            <button
                type="button"
                className={styles.scrollToTopBtn}
                onClick={() => {
                    const container = containerRef.current;
                    if (container === window) {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                        (container as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
                    }
                }}
                aria-label="Torna in cima"
            >
                <ChevronUp size={20} strokeWidth={2.5} />
            </button>
        )}
    </main>
);
```

- [ ] **Step 16: Aggiorna CollectionView.module.scss**

Aggiungi al file (in fondo o nella sezione appropriata):

```scss
/* scroll-margin-top aggiornato: compact header (60px) + nav (56px) + gap (16px) */
.section {
  scroll-margin-top: 8.5rem; /* ~132px */
}

/* ── SCROLL TO TOP BUTTON ──────────────────────────────────── */
.scrollToTopBtn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 15; /* sotto compact header (20) ma sopra contenuto */
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: none;
  background: color-mix(in srgb, var(--pub-text) 90%, transparent);
  color: var(--pub-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: var(--pub-text);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}
```

**NOTA IMPORTANTE sullo scroll-margin-top:** il selettore `.section` esiste già nel SCSS (riga 85-91 con `scroll-margin-top: 4.5rem`). Aggiorna il valore esistente da `4.5rem` a `8.5rem` invece di aggiungere un secondo selettore.

- [ ] **Step 17: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Atteso: 0 errori nuovi. Eventuali errori preesistenti sono accettabili.

- [ ] **Step 18: Commit**

```bash
git add src/components/PublicCollectionView/CollectionView/CollectionView.tsx
git add src/components/PublicCollectionView/CollectionView/CollectionView.module.scss
git add src/components/PublicCollectionView/CollectionSectionNav/CollectionSectionNav.tsx
git commit -m "feat(public): integrate PublicCollectionHeader, PublicFooter, search, and scroll-to-top in CollectionView"
```

---

### Task 5: Aggiorna `StylePreview` con mock data

**Files:**
- Modify: `src/pages/Dashboard/Styles/Editor/StylePreview.tsx`

**Nota:** aggiungere solo `activityAddress` alla chiamata di `CollectionView`. Il footer e lo scroll-to-top funzionano già senza dati aggiuntivi.

- [ ] **Step 19: Aggiungi `activityAddress` a CollectionView in StylePreview.tsx**

Trova la chiamata a `<CollectionView>` in StylePreview e aggiungi la prop:
```tsx
<CollectionView
    businessName={businessName}
    businessImage={null}
    collectionTitle="Catalogo digitale"
    sections={MOCK_SECTIONS}
    style={collectionStyle}
    mode="preview"
    scrollContainerEl={screenEl}
    activityAddress="Via Roma 1, Milano"  // NEW
    featuredBeforeCatalogSlot={
        <FeaturedBlock blocks={MOCK_FEATURED} />
    }
/>
```

- [ ] **Step 20: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 21: Commit**

```bash
git add src/pages/Dashboard/Styles/Editor/StylePreview.tsx
git commit -m "feat(styles): add activityAddress mock data in StylePreview"
```

---

## Chunk 3: Verifica finale

### Task 6: Smoke test manuale e lint

- [ ] **Step 22: Avvia il dev server**

```bash
npm run dev
```

- [ ] **Step 23: Checklist verifica manuale**

Apri il browser e verifica:

**Pagina pubblica (`/:slug`):**
- [ ] Hero visibile al caricamento con cover image e info card (logo, nome, indirizzo se disponibile, icona search)
- [ ] Scrollando giù: compact header appare con animazione slide-down da top
- [ ] Nav si posiziona sotto il compact header (non sovrapposta)
- [ ] Cliccando l'icona search: search bar si espande sotto il compact header
- [ ] Digitando nel search: i prodotti si filtrano, le sezioni vuote scompaiono dalla nav
- [ ] Cliccando X nel search: query azzzerata, sezioni tornano tutte visibili
- [ ] Scrollando >300px: pulsante scroll-to-top appare in basso a destra
- [ ] Cliccando scroll-to-top: torna in cima con smooth scroll
- [ ] Footer visibile in fondo: 4 icone social, separatore, "POWERED BY CataloGlobe", separatore, Privacy Policy · T&C
- [ ] Link CataloGlobe apre `https://cataloglobe.com` in nuova tab

**Pagina senza cover image:**
- [ ] Compact header visibile da subito (sticky, no animazione)
- [ ] Nav posizionata sotto il compact header

**Editor stile anteprima (`/business/:businessId/styles/:styleId`):**
- [ ] Compact header sempre visibile con mock data ("Nome attività", "Via Roma 1, Milano")
- [ ] Toggle mobile/desktop funziona come prima
- [ ] Footer visibile in fondo al preview
- [ ] Search bar funziona nel preview
- [ ] `StylePropertiesPanel` non ha regressioni

- [ ] **Step 24: Verifica assenza errori TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 25: Commit finale se tutto OK**

```bash
git add -A
git commit -m "feat(public): complete public catalog UI — hero header, compact sticky, search, footer, scroll-to-top"
```

---

## Note critiche per l'esecuzione

### Scrolling con `position: fixed` in preview
Il compact header in `mode="preview"` usa `position: sticky` (non `fixed`) per funzionare correttamente nel container scroll del preview. Questo significa che in preview il compact header è SEMPRE visibile (no animazione). Questo è il comportamento atteso.

### Evitare doppio listener scroll
Il `useEffect` per `showScrollToTop` deve usare `containerRef.current` che è già risolto dall'effetto precedente. Assicurarsi che l'effetto scroll-to-top sia aggiunto DOPO che `containerRef.current` è stato impostato (cioè non parallelizzare con l'effetto sezioni ma metterlo in un secondo `useEffect` separato).

### `scroll-margin-top` aggiornato
L'aggiornamento da `4.5rem` a `8.5rem` nel SCSS è una modifica del selettore ESISTENTE, non un'aggiunta. Verificare che non ci siano due dichiarazioni `.section` con `scroll-margin-top` diversi nello stesso file.

### Componenti non rimossi
`PublicBrandHeader` e `CollectionHero` rimangono nel progetto come file — vengono solo rimossi gli import e l'utilizzo in `CollectionView.tsx`. Non vanno eliminati (potrebbero essere usati altrove o riutilizzati in futuro).

### `filteredSections` e `activeSectionId`
Dopo l'aggiornamento, `navItems` diventa `filteredNavItems` e `sections` nel render diventa `filteredSections`. L'`activeSectionId` continua a funzionare perché le sezioni filtrate mantengono gli stessi `id`. L'unica edge case: se la sezione attiva viene filtrata via dalla search, l'attivo potrebbe non apparire nella nav. Questo è comportamento accettabile per questa fase.
