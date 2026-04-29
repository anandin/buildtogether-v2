// Tilly — Guardian AI mascot. Soft owl-blob built from primitive shapes only.
// Sizes: xs (20), sm (32), md (56), lg (96), hero (160)
// States: idle, blink, think, cheer

function Tilly({ size = 56, state = 'idle', mood = 'calm', style = {} }) {
  const [blink, setBlink] = React.useState(false);
  React.useEffect(() => {
    if (state === 'think' || state === 'cheer') return;
    let t1, t2;
    const loop = () => {
      const wait = 2200 + Math.random() * 2400;
      t1 = setTimeout(() => {
        setBlink(true);
        t2 = setTimeout(() => { setBlink(false); loop(); }, 130);
      }, wait);
    };
    loop();
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [state]);

  // mood-based body tint (uses CSS vars defined on artboard)
  const body = `var(--tilly-body, #2A2620)`;
  const belly = `var(--tilly-belly, #F4EFE6)`;
  const beak = `var(--tilly-beak, #E8A04A)`;
  const eyeWhite = '#F4EFE6';

  const eyeY = state === 'think' ? 0.45 : 0.42;
  const eyeR = blink ? 0.5 : 4;

  // 100x100 viewbox
  return (
    <div style={{ width: size, height: size, position: 'relative', ...style }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
        {/* tufts */}
        <ellipse cx="32" cy="22" rx="6" ry="9" fill={body} transform="rotate(-18 32 22)" />
        <ellipse cx="68" cy="22" rx="6" ry="9" fill={body} transform="rotate(18 68 22)" />
        {/* body */}
        <ellipse cx="50" cy="56" rx="34" ry="36" fill={body} />
        {/* belly */}
        <ellipse cx="50" cy="64" rx="22" ry="22" fill={belly} />
        {/* eye discs */}
        <circle cx="38" cy="44" r="11" fill={eyeWhite} />
        <circle cx="62" cy="44" r="11" fill={eyeWhite} />
        {/* pupils */}
        {state === 'cheer' ? (
          <>
            <path d="M32 44 Q38 40 44 44" stroke={body} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
            <path d="M56 44 Q62 40 68 44" stroke={body} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
          </>
        ) : (
          <>
            <ellipse cx="38" cy={44 + (state === 'think' ? 1 : 0)} rx={blink ? 4 : 4} ry={eyeR} fill={body} />
            <ellipse cx="62" cy={44 + (state === 'think' ? 1 : 0)} rx={blink ? 4 : 4} ry={eyeR} fill={body} />
            {!blink && (
              <>
                <circle cx="39.5" cy="42.5" r="1.4" fill={eyeWhite} />
                <circle cx="63.5" cy="42.5" r="1.4" fill={eyeWhite} />
              </>
            )}
          </>
        )}
        {/* beak — tiny diamond */}
        <path d="M50 52 L46 56 L50 60 L54 56 Z" fill={beak} />
        {/* wing tips */}
        <ellipse cx="20" cy="60" rx="5" ry="11" fill={body} />
        <ellipse cx="80" cy="60" rx="5" ry="11" fill={body} />
        {/* feet */}
        <ellipse cx="42" cy="92" rx="4" ry="2" fill={beak} />
        <ellipse cx="58" cy="92" rx="4" ry="2" fill={beak} />
      </svg>
      {state === 'think' && (
        <div style={{
          position: 'absolute', top: -8, right: -10,
          display: 'flex', gap: 2,
        }}>
          {[0,1,2].map(i => (
            <span key={i} style={{
              width: 4, height: 4, borderRadius: 999, background: body,
              animation: `tilly-dot 1.2s ${i * 0.18}s infinite`,
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

// inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('tilly-styles')) {
  const s = document.createElement('style');
  s.id = 'tilly-styles';
  s.textContent = `
    @keyframes tilly-dot { 0%,60%,100%{opacity:.25;transform:translateY(0)} 30%{opacity:1;transform:translateY(-2px)} }
    @keyframes tilly-breath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
    .tilly-breath { animation: tilly-breath 3.6s ease-in-out infinite; transform-origin: 50% 70%; }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { Tilly });
