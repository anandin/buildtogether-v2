// Shared design tokens + atomic UI bits for BuildTogether Student.
// Editorial fintech: cream paper, ink, warm amber accent.

const BT_THEMES = {
  dusk: {
    name: 'Dusk',
    bg: '#181612',
    surface: '#221E18',
    surfaceAlt: '#2C271F',
    ink: '#F4EFE6',
    inkSoft: '#B8AE9A',
    inkMute: '#776E5E',
    rule: '#3A332A',
    accent: '#F0934A',
    accentSoft: '#5A3E2A',
    accent2: '#8FB89A',
    good: '#9CBA86',
    warn: '#E5C25E',
    bad: '#E07560',
    chip: '#2C271F',
    tilly: { body: '#F4EFE6', belly: '#2A2620', beak: '#F0934A' },
  },
  citrus: {
    name: 'Citrus',
    bg: '#F5E9B8',
    surface: '#FBF3CC',
    surfaceAlt: '#EFD98C',
    ink: '#1F1A0E',
    inkSoft: '#5C5236',
    inkMute: '#9A8E66',
    rule: '#1F1A0E',
    accent: '#D14A2C',
    accentSoft: '#F4B69E',
    accent2: '#2D5A3D',
    good: '#2D5A3D',
    warn: '#B3811F',
    bad: '#A8392B',
    chip: '#EFD98C',
    tilly: { body: '#1F1A0E', belly: '#F5E9B8', beak: '#D14A2C' },
  },
  bloom: {
    name: 'Bloom',
    bg: '#F6E8E6',
    surface: '#FBF1EE',
    surfaceAlt: '#EBC9C2',
    ink: '#2A1518',
    inkSoft: '#6B4148',
    inkMute: '#A88087',
    rule: '#2A1518',
    accent: '#7A4FE0',
    accentSoft: '#D9C9F5',
    accent2: '#E0664A',
    good: '#3F8A6E',
    warn: '#C97A1F',
    bad: '#B8392E',
    chip: '#EBC9C2',
    tilly: { body: '#2A1518', belly: '#F6E8E6', beak: '#7A4FE0' },
  },
  neon: {
    name: 'Neon',
    bg: '#0A0B14',                  // near-black with blue undertone
    surface: '#15172A',
    surfaceAlt: '#1F2240',
    ink: '#F0F4FF',                  // cool white
    inkSoft: '#A8B0D4',
    inkMute: '#5C6486',
    rule: '#2A2D52',
    accent: '#00FF88',               // electric green pop
    accentSoft: '#00FF8822',
    accent2: '#FF2EC8',               // hot magenta secondary
    good: '#00FF88',
    warn: '#FFD60A',
    bad: '#FF2EC8',
    chip: '#1F2240',
    tilly: { body: '#F0F4FF', belly: '#15172A', beak: '#00FF88' },
  },
};

const BT_TONES = {
  sibling: {
    name: 'Older sibling',
    greeting: (name) => `Hey ${name}.`,
    voice: 'calm, wise, plainspoken',
    sample: "You've got rent due Thursday and $312 of breathing room. Doable, but tight if you order out twice this week.",
  },
  coach: {
    name: 'Coach',
    greeting: (name) => `Morning, ${name}.`,
    voice: 'direct, gently nudgy',
    sample: "Two no-spend days this week — let's make it three. Coffee at home tomorrow puts you back in the green.",
  },
  protective: {
    name: 'Protective',
    greeting: (name) => `${name},`,
    voice: 'quiet, only when needed',
    sample: "I'm watching three subscriptions you haven't used in 60 days. Nothing urgent — just want you to know.",
  },
};

const BT_TIMES = {
  morning: { name: 'Morning', stamp: 'Tue · 7:42 AM', label: 'Morning briefing' },
  evening: { name: 'Evening', stamp: 'Tue · 9:18 PM', label: 'Night check-in' },
};

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────
function BTSerif({ children, size = 28, weight = 400, style = {} }) {
  const Tag = style.display === 'block' ? 'div' : 'span';
  return (
    <Tag style={{
      fontFamily: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
      fontWeight: weight, fontSize: size, lineHeight: 1.14,
      letterSpacing: '-0.01em',
      ...style,
    }}>{children}</Tag>
  );
}

function BTLabel({ children, style = {} }) {
  return (
    <span style={{
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
      ...style,
    }}>{children}</span>
  );
}

function BTNum({ children, size = 36, style = {} }) {
  return (
    <span style={{
      fontFamily: '"Instrument Serif", Georgia, serif',
      fontWeight: 400, fontSize: size, lineHeight: 1,
      letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
      ...style,
    }}>{children}</span>
  );
}

function BTRule({ color, style = {} }) {
  return <div style={{ height: 1, background: color, ...style }} />;
}

// Subtly-striped placeholder image (no SVGs that fake content)
function BTPlaceholder({ ratio = '1 / 1', label = 'image', tint = '#D8602B', style = {} }) {
  const stripe = `repeating-linear-gradient(135deg, ${tint}22, ${tint}22 6px, ${tint}11 6px, ${tint}11 12px)`;
  return (
    <div style={{
      aspectRatio: ratio, background: stripe,
      border: `1px dashed ${tint}66`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
      color: tint, letterSpacing: '0.1em', textTransform: 'uppercase',
      ...style,
    }}>{label}</div>
  );
}

// Tab bar — used at bottom of every screen
function BTTabBar({ active = 'home', t, onNav, dark = false }) {
  const tabs = [
    { id: 'home', label: 'Today' },
    { id: 'spend', label: 'Spend' },
    { id: 'guardian', label: 'Tilly' },
    { id: 'dreams', label: 'Dreams' },
    { id: 'profile', label: 'You' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '10px 8px 22px',
      borderTop: `1px solid ${t.rule}22`,
      background: t.surface,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onNav?.(tab.id)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '4px 8px', minWidth: 52,
          }}>
            {tab.id === 'guardian' ? (
              <Tilly size={22} state="idle" />
            ) : (
              <div style={{
                width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BTTabIcon id={tab.id} color={isActive ? t.ink : t.inkMute} />
              </div>
            )}
            <span style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: isActive ? t.ink : t.inkMute,
            }}>{tab.label}</span>
            {isActive && (
              <div style={{ width: 4, height: 4, borderRadius: 999, background: t.accent, marginTop: -2 }}/>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BTTabIcon({ id, color }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'home': return (
      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" {...s}/><path d="M10 6v4l2.5 1.5" {...s}/></svg>
    );
    case 'spend': return (
      <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 6h14M3 10h14M3 14h9" {...s}/></svg>
    );
    case 'dreams': return (
      <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 3l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" {...s}/></svg>
    );
    case 'profile': return (
      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="7" r="3" {...s}/><path d="M4 17c1-3 4-4.5 6-4.5s5 1.5 6 4.5" {...s}/></svg>
    );
    default: return null;
  }
}

// Status bar for the masthead pages (date + small icons)
function BTMasthead({ t, label = 'Build Together' }) {
  if (!label) return <div style={{ height: 20 }}/>;
  return (
    <div style={{
      padding: '12px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <BTLabel style={{ color: t.ink }}>{label}</BTLabel>
    </div>
  );
}

Object.assign(window, {
  BT_THEMES, BT_TONES, BT_TIMES,
  BTSerif, BTLabel, BTNum, BTRule, BTPlaceholder,
  BTTabBar, BTMasthead,
});
