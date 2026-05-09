/**
 * SPEC VISIVA — pagina prodotto refactor (Task 1.5 + Task 2 + Task 3)
 *
 * Questo file NON viene importato da nessuna parte. È documentazione visiva
 * generata in fase di design per definire layout, struttura e pattern UI
 * della pagina prodotti dopo refactor.
 *
 * Quando implementi un task che lo referenzia:
 * - Usa questo file come spec di LAYOUT e PATTERN UI (cards, action bar,
 *   chip groups, empty states, segmented controls).
 * - NON copiare i componenti UI inline qui dentro: usa i componenti
 *   reali di src/components/ui/ (Card, Input, Pill, IngredientCombobox,
 *   ecc.). Se un componente non esiste, segnalalo prima di crearlo.
 * - NON copiare i colori inline (#6366f1 ecc.): usa le CSS variables
 *   del theme (var(--brand-primary), var(--bg), var(--border), ecc.).
 * - NON copiare gli useState locali: usa il service layer e gli state
 *   pattern esistenti del progetto.
 *
 * Riferimenti:
 * - 4 tab: Scheda, Prezzi & Opzioni, Traduzioni, Utilizzo
 * - Layout 2 colonne nella tab Scheda
 * - Cards bianche bordate con CardLabel in caps
 * - Action bar sticky a livello section (una per card editabile)
 * - Chip pattern: brand viola attivo, allergeni rossi attivi
 * - Empty state per Varianti / Opzioni con icona + copy + CTA
 *
 * Generato: maggio 2026
 */

import React, { useState } from 'react';

// ===================== THEME =====================
const T = {
  bg: '#f8fafc',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  cardBg: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  hoverBg: '#f1f5f9',
  brand: '#6366f1',
  brandHover: '#4648c6',
  brandBgLight: '#eef2ff',
  warning: '#f59e0b',
  greenBg: '#ecfdf5',
  greenText: '#065f46',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
  redText: '#991b1b',
};

// ===================== UI PRIMITIVES =====================
const Card = ({ children, style }) => (
  <div style={{
    background: T.cardBg,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    ...style,
  }}>
    {children}
  </div>
);

const CardLabel = ({ children }) => (
  <div style={{
    fontSize: 11,
    fontWeight: 600,
    color: T.textSubtle,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  }}>{children}</div>
);

const CardHelp = ({ children }) => (
  <div style={{ fontSize: 13, color: T.textMuted, marginTop: -8 }}>{children}</div>
);

const Field = ({ label, required, children, helper }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
      {label} {required && <span style={{ color: T.brand }}>*</span>}
    </label>
    {children}
    {helper}
  </div>
);

const Input = ({ value, onChange, placeholder, style }) => (
  <input
    value={value || ''}
    onChange={(e) => onChange?.(e.target.value)}
    placeholder={placeholder}
    style={{
      padding: '10px 12px',
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      fontSize: 14,
      color: T.text,
      background: T.cardBg,
      fontFamily: 'inherit',
      outline: 'none',
      transition: 'all 0.15s',
      ...style,
    }}
    onFocus={(e) => {
      e.target.style.borderColor = T.brand;
      e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.12)`;
    }}
    onBlur={(e) => {
      e.target.style.borderColor = T.border;
      e.target.style.boxShadow = 'none';
    }}
  />
);

const Textarea = ({ value, onChange, placeholder, minHeight = 88 }) => (
  <textarea
    value={value || ''}
    onChange={(e) => onChange?.(e.target.value)}
    placeholder={placeholder}
    style={{
      padding: '10px 12px',
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      fontSize: 14,
      color: T.text,
      background: T.cardBg,
      fontFamily: 'inherit',
      minHeight,
      resize: 'vertical',
      outline: 'none',
      transition: 'all 0.15s',
    }}
    onFocus={(e) => {
      e.target.style.borderColor = T.brand;
      e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.12)`;
    }}
    onBlur={(e) => {
      e.target.style.borderColor = T.border;
      e.target.style.boxShadow = 'none';
    }}
  />
);

const Chip = ({ children, active, variant = 'brand', onClick }) => {
  const styles = {
    brand: active
      ? { background: T.brandBgLight, borderColor: T.brand, color: T.brand, fontWeight: 500 }
      : { background: T.cardBg, borderColor: T.border, color: T.text },
    allergen: active
      ? { background: T.redBg, borderColor: T.redBorder, color: T.redText, fontWeight: 500 }
      : { background: T.cardBg, borderColor: T.border, color: T.text },
  };
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid',
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
};

const Tag = ({ children, onRemove }) => (
  <span style={{
    padding: '5px 6px 5px 12px',
    background: T.brandBgLight,
    border: `1px solid ${T.brandBgLight}`,
    borderRadius: 999,
    fontSize: 13,
    color: T.brand,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }}>
    {children}
    <span
      onClick={onRemove}
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        opacity: 0.7,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.7; e.currentTarget.style.background = 'transparent'; }}
    >×</span>
  </span>
);

const Btn = ({ children, variant = 'primary', size = 'md', onClick, style }) => {
  const variants = {
    primary: { background: T.brand, color: '#fff', borderColor: T.brand },
    secondary: { background: T.hoverBg, color: T.text, borderColor: T.hoverBg },
    ghost: { background: 'transparent', color: T.text, borderColor: T.border },
    link: { background: 'transparent', color: T.brand, borderColor: 'transparent', padding: '4px 0' },
  };
  const sizes = {
    md: { padding: '8px 16px', fontSize: 14 },
    sm: { padding: '6px 12px', fontSize: 13 },
  };
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 8,
        fontWeight: 500,
        cursor: 'pointer',
        border: '1px solid',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        ...variants[variant],
        ...(variant !== 'link' ? sizes[size] : {}),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (variant === 'primary') { e.currentTarget.style.background = T.brandHover; e.currentTarget.style.borderColor = T.brandHover; }
        if (variant === 'secondary') { e.currentTarget.style.background = T.border; e.currentTarget.style.borderColor = T.border; }
        if (variant === 'ghost') { e.currentTarget.style.background = T.hoverBg; }
        if (variant === 'link') { e.currentTarget.style.textDecoration = 'underline'; }
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, { ...variants[variant], textDecoration: 'none' });
      }}
    >
      {children}
    </button>
  );
};

const SegControl = ({ value, onChange, options }) => (
  <div style={{
    display: 'inline-flex',
    padding: 3,
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    gap: 2,
  }}>
    {options.map(opt => {
      const active = value === opt.value;
      return (
        <button
          key={opt.value}
          onClick={() => onChange?.(opt.value)}
          style={{
            padding: '7px 14px',
            background: active ? T.cardBg : 'transparent',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 500,
            color: active ? T.text : T.textMuted,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const ActionBar = ({ section, onCancel, onSave }) => (
  <div style={{
    marginTop: 16,
    padding: '10px 14px',
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    position: 'sticky',
    bottom: 16,
    zIndex: 10,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.textMuted }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.warning, display: 'inline-block' }} />
      Modifiche non salvate {section && <>in <strong style={{ color: T.text, fontWeight: 500 }}>{section}</strong></>}
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn variant="secondary" onClick={onCancel}>Annulla</Btn>
      <Btn variant="primary" onClick={onSave}>Salva</Btn>
    </div>
  </div>
);

const EmptyState = ({ icon, title, desc, actions }) => (
  <div style={{
    padding: '32px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  }}>
    <div style={{
      width: 48, height: 48, background: T.bg, borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.textSubtle,
    }}>{icon}</div>
    <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{title}</div>
    <div style={{ fontSize: 13, color: T.textMuted, maxWidth: 380 }}>{desc}</div>
    {actions && <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>{actions}</div>}
  </div>
);

// ===================== TAB CONTENTS =====================

function SchedaTab() {
  const [name, setName] = useState('Composta di Frutta Fresca');
  const [desc, setDesc] = useState('Una fresca composta di frutta di stagione.');
  const [allergens, setAllergens] = useState(new Set(['frutta-guscio']));
  const [characteristics, setCharacteristics] = useState(new Set(['vegetariano', 'vegano', 'senza-glutine']));
  const [piccantezza, setPiccantezza] = useState(null);
  const [ingredients, setIngredients] = useState(['Fragole', 'Kiwi', 'Mango', 'Menta']);
  const [newIngr, setNewIngr] = useState('');
  const [notes, setNotes] = useState([
    { id: 1, k: 'Provenienza', v: 'Piemonte' },
    { id: 2, k: 'Stagionalità', v: 'Estate' },
  ]);
  const [dirtySection, setDirtySection] = useState(null);

  const toggleSet = (set, val, setter, section) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
    setDirtySection(section);
  };

  const allergenList = [
    ['cereali', 'Cereali con glutine'], ['crostacei', 'Crostacei'], ['uova', 'Uova'],
    ['pesce', 'Pesce'], ['arachidi', 'Arachidi'], ['soia', 'Soia'],
    ['latte', 'Latte'], ['frutta-guscio', 'Frutta a guscio'], ['sedano', 'Sedano'],
    ['senape', 'Senape'], ['sesamo', 'Sesamo'], ['solforosa', 'Anidride solforosa'],
    ['lupini', 'Lupini'], ['molluschi', 'Molluschi'],
  ];

  const charGroups = [
    { label: 'Dieta', items: [['vegetariano', 'Vegetariano'], ['vegano', 'Vegano'], ['senza-glutine', 'Senza glutine'], ['senza-lattosio', 'Senza lattosio'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['biologico', 'Biologico'], ['crudo', 'Crudo']] },
    { label: 'Origine e qualità', items: [['km0', 'Chilometro 0'], ['slow-food', 'Slow Food'], ['fivi', 'Vignaioli FIVI'], ['coravin', 'Vino Coravin'], ['pesca-sost', 'Pesca sostenibile']] },
    { label: 'Preparazione', items: [['surgelati', 'Ingredienti surgelati'], ['abbattuto', 'Prodotto abbattuto'], ['casa', 'Fatto in casa'], ['stagionale', 'Stagionale']] },
    { label: 'Avvertenze', items: [['aglio', 'Contiene aglio'], ['cipolla', 'Contiene cipolla'], ['maiale', 'Contiene maiale'], ['alcol', 'Contiene alcol'], ['adulti', 'Solo adulti (18+)'], ['caffeina', 'Contiene caffeina']] },
    { label: 'Stato', items: [['chef', 'Consigliato dallo chef'], ['nuovo', 'Nuovo'], ['signature', 'Piatto signature'], ['richiesto', 'Più richiesto'], ['riassortimento', 'In riassortimento']] },
  ];

  const piccGroup = [['poco', 'Poco piccante'], ['medio', 'Medio piccante'], ['molto', 'Molto piccante']];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* COL SX */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Card Immagine */}
        <Card>
          <CardLabel>Immagine</CardLabel>
          <div style={{
            background: T.bg, border: `1.5px dashed ${T.borderStrong}`, borderRadius: 10,
            aspectRatio: '16/10', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.textSubtle} strokeWidth="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 13, color: T.textMuted }}>Clicca per caricare</div>
            <div style={{ fontSize: 11, color: T.textSubtle }}>JPG, PNG, WebP — max 5MB</div>
          </div>
        </Card>

        {/* Card Informazioni */}
        <Card>
          <CardLabel>Informazioni</CardLabel>
          <Field label="Nome" required>
            <Input value={name} onChange={(v) => { setName(v); setDirtySection('Informazioni'); }} />
          </Field>
          <Field
            label="Descrizione"
            helper={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                <span style={{ color: T.greenText }}>Tradotto in 4 lingue</span>
                <span style={{ color: T.textSubtle }}>·</span>
                <a style={{ color: T.brand, cursor: 'pointer' }}>Gestisci traduzioni</a>
              </div>
            }
          >
            <Textarea value={desc} onChange={(v) => { setDesc(v); setDirtySection('Informazioni'); }} />
          </Field>
          <Field label="Categoria nei cataloghi">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14,
            }}>
              <span style={{ color: T.textMuted }}>Menu Completo › </span>
              <span style={{ color: T.text }}>Dessert</span>
              <a style={{ marginLeft: 'auto', color: T.brand, fontSize: 13, cursor: 'pointer' }}>Modifica nei cataloghi</a>
            </div>
          </Field>
        </Card>

        {/* Card Allergeni */}
        <Card>
          <div>
            <CardLabel>Allergeni</CardLabel>
            <CardHelp>Clicca per selezionare gli allergeni presenti</CardHelp>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allergenList.map(([id, label]) => (
              <Chip
                key={id}
                variant="allergen"
                active={allergens.has(id)}
                onClick={() => toggleSet(allergens, id, setAllergens, 'Allergeni')}
              >
                {label}
              </Chip>
            ))}
          </div>
        </Card>

        {/* Card Ingredienti */}
        <Card>
          <div>
            <CardLabel>Ingredienti</CardLabel>
            <CardHelp>Vengono mostrati nella scheda pubblica del prodotto</CardHelp>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ingredients.map((ing, i) => (
              <Tag key={i} onRemove={() => { setIngredients(ingredients.filter((_, j) => j !== i)); setDirtySection('Ingredienti'); }}>
                {ing}
              </Tag>
            ))}
          </div>
          <Input
            value={newIngr}
            onChange={setNewIngr}
            placeholder="Cerca o aggiungi ingrediente, premi Invio..."
          />
        </Card>

        {/* Card Note */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <CardLabel>Note prodotto</CardLabel>
              <CardHelp>Coppie chiave-valore visibili nella scheda pubblica</CardHelp>
            </div>
            <span style={{
              padding: '2px 8px', background: T.bg, borderRadius: 999,
              fontSize: 11, fontWeight: 500, color: T.textMuted,
            }}>{notes.length} / 10</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 8, alignItems: 'center' }}>
                <Input
                  value={n.k}
                  onChange={(v) => {
                    setNotes(notes.map((nn) => nn.id === n.id ? { ...nn, k: v } : nn));
                    setDirtySection('Note prodotto');
                  }}
                  style={{ padding: '8px 10px' }}
                />
                <Input
                  value={n.v}
                  onChange={(v) => {
                    setNotes(notes.map((nn) => nn.id === n.id ? { ...nn, v } : nn));
                    setDirtySection('Note prodotto');
                  }}
                  style={{ padding: '8px 10px' }}
                />
                <button
                  onClick={() => { setNotes(notes.filter((nn) => nn.id !== n.id)); setDirtySection('Note prodotto'); }}
                  style={{
                    width: 32, height: 32, background: 'transparent',
                    border: '1px solid transparent', borderRadius: 6,
                    cursor: 'pointer', color: T.textMuted, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.hoverBg; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.border; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => { setNotes([...notes, { id: Date.now(), k: '', v: '' }]); setDirtySection('Note prodotto'); }}
            style={{
              fontSize: 13, color: T.brand, cursor: 'pointer', padding: '8px 0',
              background: 'transparent', border: 'none', textAlign: 'left',
              fontFamily: 'inherit', fontWeight: 500,
            }}
          >+ Aggiungi nota</button>
        </Card>

      </div>

      {/* COL DX */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Card Caratteristiche */}
        <Card>
          <CardLabel>Caratteristiche</CardLabel>
          <CardHelp>Etichette visibili sulla scheda pubblica</CardHelp>

          {charGroups.map(group => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.items.map(([id, label]) => (
                  <Chip
                    key={id}
                    active={characteristics.has(id)}
                    onClick={() => toggleSet(characteristics, id, setCharacteristics, 'Caratteristiche')}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}

          {/* Piccantezza singola */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Piccantezza <span style={{ color: T.textSubtle, textTransform: 'none', fontWeight: 400 }}>— selezione singola</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {piccGroup.map(([id, label]) => (
                <Chip
                  key={id}
                  active={piccantezza === id}
                  onClick={() => { setPiccantezza(piccantezza === id ? null : id); setDirtySection('Caratteristiche'); }}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        </Card>

        {/* Card Gruppi prodotto */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <CardLabel>Gruppi prodotto</CardLabel>
              <CardHelp>Categorie tenant-wide per filtri e ricerca</CardHelp>
            </div>
            <Btn variant="ghost" size="sm">Modifica</Btn>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Chip active>Antipasti</Chip>
            <Chip active>Stagionale</Chip>
          </div>
        </Card>

      </div>

      {dirtySection && (
        <div style={{ gridColumn: '1 / -1' }}>
          <ActionBar
            section={dirtySection}
            onCancel={() => setDirtySection(null)}
            onSave={() => setDirtySection(null)}
          />
        </div>
      )}
    </div>
  );
}

function PrezziTab() {
  const [mode, setMode] = useState('single');
  const [price, setPrice] = useState('10.00');
  const [editingPrice, setEditingPrice] = useState(false);
  const [formats, setFormats] = useState([
    { id: 1, name: 'Piccolo', price: '8.00' },
    { id: 2, name: 'Medio', price: '10.00' },
    { id: 3, name: 'Grande', price: '13.00' },
  ]);
  const [variants, setVariants] = useState([]);
  const [optionGroups, setOptionGroups] = useState([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Modalità prezzo */}
      <Card>
        <CardLabel>Modalità prezzo</CardLabel>
        <CardHelp>Come vuoi indicare il prezzo per questo prodotto</CardHelp>
        <div style={{ alignSelf: 'flex-start' }}>
          <SegControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: 'Prezzo singolo' },
              { value: 'formats', label: 'Prezzi per formato' },
              { value: 'inherit', label: 'Eredita dal padre' },
            ]}
          />
        </div>

        {mode === 'single' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            {editingPrice ? (
              <>
                <Input value={price} onChange={setPrice} style={{ width: 140 }} />
                <Btn variant="primary" size="sm" onClick={() => setEditingPrice(false)}>Salva</Btn>
                <Btn variant="ghost" size="sm" onClick={() => setEditingPrice(false)}>Annulla</Btn>
              </>
            ) : (
              <>
                <span style={{ fontSize: 28, fontWeight: 600 }}>{price}</span>
                <span style={{ fontSize: 18, color: T.textMuted }}>€</span>
                <Btn variant="ghost" size="sm" onClick={() => setEditingPrice(true)} style={{ marginLeft: 8 }}>Modifica</Btn>
              </>
            )}
          </div>
        )}

        {mode === 'formats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {formats.map(f => (
              <div key={f.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8, alignItems: 'center',
                padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
              }}>
                <Input
                  value={f.name}
                  onChange={(v) => setFormats(formats.map(ff => ff.id === f.id ? { ...ff, name: v } : ff))}
                  style={{ padding: '7px 10px' }}
                />
                <Input
                  value={f.price}
                  onChange={(v) => setFormats(formats.map(ff => ff.id === f.id ? { ...ff, price: v } : ff))}
                  style={{ padding: '7px 10px' }}
                />
                <button
                  onClick={() => setFormats(formats.filter(ff => ff.id !== f.id))}
                  style={{
                    width: 32, height: 32, background: 'transparent',
                    border: '1px solid transparent', borderRadius: 6, cursor: 'pointer',
                    color: T.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <Btn variant="ghost" size="sm" onClick={() => setFormats([...formats, { id: Date.now(), name: '', price: '' }])} style={{ alignSelf: 'flex-start' }}>+ Aggiungi formato</Btn>
          </div>
        )}

        {mode === 'inherit' && (
          <div style={{
            paddingTop: 8, fontSize: 14, color: T.textMuted,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
            Il prezzo viene ereditato dal prodotto padre. Modificalo lì.
          </div>
        )}
      </Card>

      {/* Varianti */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <CardLabel>Varianti</CardLabel>
            <CardHelp>Versioni alternative dello stesso prodotto (taglie, gusti, ecc.)</CardHelp>
          </div>
          {variants.length > 0 && <Btn variant="ghost" size="sm">+ Aggiungi</Btn>}
        </div>
        {variants.length === 0 ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
            }
            title="Nessuna variante"
            desc="Le varianti hanno prezzo e descrizione propri. Si vedono come prodotti separati nel menu pubblico."
            actions={<>
              <Btn variant="ghost" onClick={() => setVariants([{ id: 1, name: 'Nuova variante' }])}>Aggiungi manualmente</Btn>
              <Btn variant="ghost">Configura matrice</Btn>
            </>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {variants.map(v => (
              <div key={v.id} style={{
                padding: 12, background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                <Btn variant="link" onClick={() => setVariants(variants.filter(vv => vv.id !== v.id))}>Rimuovi</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Opzioni extra */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <CardLabel>Opzioni extra</CardLabel>
            <CardHelp>Configurazioni selezionabili dal cliente (es. cottura, aggiunte)</CardHelp>
          </div>
          {optionGroups.length > 0 && <Btn variant="ghost" size="sm">+ Crea gruppo</Btn>}
        </div>
        {optionGroups.length === 0 ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="8" cy="6" r="1.5" fill="currentColor" /><circle cx="14" cy="12" r="1.5" fill="currentColor" /><circle cx="10" cy="18" r="1.5" fill="currentColor" />
              </svg>
            }
            title="Nessuna opzione extra"
            desc='Aggiungi gruppi come "Cottura" (al sangue/medio/ben cotta) o "Aggiunte" (mozzarella, prosciutto…).'
            actions={<Btn variant="ghost" onClick={() => setOptionGroups([{ id: 1, name: 'Cottura' }])}>+ Crea primo gruppo</Btn>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {optionGroups.map(g => (
              <div key={g.id} style={{
                padding: 12, background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                <Btn variant="link" onClick={() => setOptionGroups(optionGroups.filter(gg => gg.id !== g.id))}>Rimuovi</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}

function TraduzioniTab() {
  const [enText, setEnText] = useState('A fresh seasonal fruit compote.');
  const [frText, setFrText] = useState('Une compote de fruits frais de saison.');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardLabel>Traduzioni del prodotto</CardLabel>
        <CardHelp>Le modifiche manuali non vengono sovrascritte dalla traduzione automatica.</CardHelp>

        {/* Source IT */}
        <div style={{
          marginTop: 8, padding: 14, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>🇮🇹</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Italiano (sorgente)</span>
          </div>
          <div style={{ fontSize: 13, color: T.text }}>Una fresca composta di frutta di stagione.</div>
        </div>

        {/* English */}
        <div style={{
          marginTop: 12, padding: 14, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🇬🇧</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>English</span>
            <span style={{
              padding: '2px 8px', background: T.greenBg, color: T.greenText,
              borderRadius: 4, fontSize: 11, fontWeight: 500,
            }}>Automatica</span>
          </div>
          <Textarea value={enText} onChange={setEnText} minHeight={60} />
        </div>

        {/* French */}
        <div style={{
          marginTop: 12, padding: 14, background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🇫🇷</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Français</span>
            <span style={{
              padding: '2px 8px', background: T.greenBg, color: T.greenText,
              borderRadius: 4, fontSize: 11, fontWeight: 500,
            }}>Automatica</span>
          </div>
          <Textarea value={frText} onChange={setFrText} minHeight={60} />
        </div>

        <div style={{
          fontSize: 12, color: T.textSubtle, textAlign: 'center', padding: 12,
          background: T.bg, borderRadius: 10, marginTop: 8,
        }}>+ 2 altre lingue (DE, ES)</div>
      </Card>
    </div>
  );
}

function UtilizzoTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardLabel>Riepilogo utilizzo</CardLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: T.greenBg, color: T.greenText }}>1 attività</span>
          <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: T.brandBgLight, color: T.brand }}>1 catalogo</span>
          <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: '#fef3c7', color: '#92400e' }}>1 regola di programmazione</span>
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
          Questa sezione mostra dove il prodotto è utilizzato. Per modificarne l'utilizzo, vai a <a style={{ color: T.brand, cursor: 'pointer' }}>Cataloghi</a> o <a style={{ color: T.brand, cursor: 'pointer' }}>Programmazione</a>.
        </div>
      </Card>

      <Card>
        <CardLabel>Cataloghi</CardLabel>
        <div style={{
          padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
        }}>
          <span style={{ color: T.brand, fontWeight: 500, fontSize: 14 }}>Menu Completo</span>
          <span style={{ color: T.textMuted }}>→</span>
        </div>
      </Card>

      <Card>
        <CardLabel>Programmazione</CardLabel>
        <div style={{
          padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
        }}>
          <span style={{ color: T.brand, fontWeight: 500, fontSize: 14 }}>San Pietro — Menu & Stile base</span>
          <span style={{ color: T.textMuted }}>→</span>
        </div>
      </Card>

      <Card>
        <CardLabel>Attività coinvolte</CardLabel>
        <div style={{
          padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
        }}>
          <span style={{ color: T.brand, fontWeight: 500, fontSize: 14 }}>San Pietro</span>
          <span style={{ color: T.textMuted }}>→</span>
        </div>
      </Card>
    </div>
  );
}

// ===================== MAIN =====================
export default function ProductPageMockup() {
  const [tab, setTab] = useState('scheda');

  const tabs = [
    { id: 'scheda', label: 'Scheda' },
    { id: 'prezzi', label: 'Prezzi & Opzioni' },
    { id: 'traduzioni', label: 'Traduzioni' },
    { id: 'utilizzo', label: 'Utilizzo' },
  ];

  return (
    <div style={{
      background: T.bg,
      padding: 24,
      borderRadius: 12,
      fontFamily: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
      color: T.text,
      fontSize: 14,
      lineHeight: 1.5,
      minHeight: 600,
    }}>
      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 8 }}>
        <a style={{ color: T.brand, cursor: 'pointer' }}>Prodotti</a> › Composta di Frutta Fresca
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 24px 0' }}>
        Composta di Frutta Fresca
      </h1>

      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: `1px solid ${T.border}`,
        marginBottom: 24,
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 500,
                color: active ? T.brand : T.textMuted,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                borderBottom: `2px solid ${active ? T.brand : 'transparent'}`,
                marginBottom: -1,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'scheda' && <SchedaTab />}
      {tab === 'prezzi' && <PrezziTab />}
      {tab === 'traduzioni' && <TraduzioniTab />}
      {tab === 'utilizzo' && <UtilizzoTab />}
    </div>
  );
}
