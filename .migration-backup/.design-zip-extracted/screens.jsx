// BuildTogether — Student. Six screen components.
// All screens take {t, tone, time, onNav, active} and render fixed-size
// content for a phone (width: 100%, height: fills parent flex column).

const BT_DATA = {
  user: { name: 'Maya', school: 'NYU · Junior', balance: 412.58, school_short: 'NYU' },
  monthBudget: 1280,
  monthSpent: 868.42,
  rentDue: { amount: 740, day: 'Thu', daysLeft: 2 },
  paycheck: { amount: 612, source: 'Library job', day: 'Fri' },
  recent: [
    { id: 1, who: 'Joe Coffee', cat: 'coffee', amt: 5.40, time: '7:18 AM', tag: 'today' },
    { id: 2, who: 'CitiBike monthly', cat: 'transit', amt: 19.95, time: 'yesterday', tag: 'sub' },
    { id: 3, who: "Trader Joe's", cat: 'groceries', amt: 38.12, time: 'yesterday' },
    { id: 4, who: 'DoorDash · Halal Guys', cat: 'eatout', amt: 22.40, time: 'Mon', flag: true },
    { id: 5, who: 'Venmo · Priya (rent)', cat: 'rent', amt: -370.00, time: 'Mon', incoming: true },
    { id: 6, who: 'Pearson eText', cat: 'school', amt: 89.99, time: 'Sun' },
  ],
  dreams: [
    { id: 'abroad', name: 'Barcelona spring', emoji: '✺', target: 2400, saved: 870, due: 'Mar 2027' },
    { id: 'laptop', name: 'New laptop', emoji: '◇', target: 1450, saved: 1180, due: 'Aug 2026' },
    { id: 'safety', name: 'Emergency cushion', emoji: '◉', target: 1000, saved: 412, due: 'ongoing' },
  ],
};

// ─────────────────────────────────────────────────────────────
// 1. HOME — Morning briefing / Night check-in (editorial masthead)
// ─────────────────────────────────────────────────────────────
function BTHome({ t, tone, time, onNav, active = 'home' }) {
  const isMorning = time === 'morning';
  const greeting = BT_TONES[tone].greeting(BT_DATA.user.name);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink, position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── 1. The Sky — Tilly portrait, full bleed ── */}
        <div style={{
          position: 'relative', height: 320, overflow: 'hidden',
          background: `linear-gradient(160deg, ${t.accent} 0%, ${t.accent2 || t.accent} 55%, ${t.surfaceAlt} 100%)`,
        }}>
          {/* sun/moon halo */}
          <div style={{
            position: 'absolute', top: 36, right: 36, width: 80, height: 80, borderRadius: 999,
            background: `radial-gradient(circle, ${t.bg}cc 0%, ${t.bg}33 70%, transparent 100%)`,
            filter: 'blur(2px)',
          }}/>
          {/* drifting clouds */}
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute',
              top: `${18 + i * 28}%`, left: `${-25 + i * 22}%`,
              width: 200, height: 80, borderRadius: 999,
              background: `${t.bg}29`, filter: 'blur(22px)',
              animation: `btDrift ${20 + i * 4}s ease-in-out infinite ${i * -3}s`,
            }}/>
          ))}
          <div style={{ position: 'absolute', top: 56, left: 24, color: t.bg, opacity: 0.75, fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>
            {isMorning ? 'Tue · April 27 · morning' : 'Tue · April 27 · evening'}
          </div>
          <div style={{
            position: 'absolute', top: 52, right: 24,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            background: `${t.ink}40`, backdropFilter: 'blur(10px)', color: t.bg,
            fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600,
          }}>
            <span>✦</span><span>12-day streak</span>
          </div>
          <div style={{
            position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
            animation: 'btBreathe 4.2s ease-in-out infinite', transformOrigin: 'center bottom',
          }}>
            <Tilly size={220} state="idle"/>
          </div>
        </div>

      <div style={{ padding: '24px 22px 28px', position: 'relative', zIndex: 1 }}>
        {/* ── 2. The Story ── */}
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
          Tilly says
        </div>
        <BTSerif size={32} style={{ display: 'block', color: t.ink, lineHeight: 1.18, marginBottom: 12 }}>
          {greeting} {isMorning
            ? <>This week is shaping up <em style={{ color: t.accent, fontStyle: 'italic' }}>gentle</em>.</>
            : <>You're <em style={{ color: t.accent, fontStyle: 'italic' }}>eight over</em> — Friday catches it.</>}
        </BTSerif>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: t.inkSoft, lineHeight: 1.5, marginBottom: 22 }}>
          {isMorning
            ? <>$312 of breathing room. Rent posts <strong style={{ color: t.ink }}>Thursday</strong>, paycheck <strong style={{ color: t.ink }}>Friday</strong>. I'll keep an eye on coffee Wednesdays — that's your soft spot.</>
            : <>Three coffees, one DoorDash. Your CitiBike pass renews tomorrow and you've barely touched it.</>}
        </div>

        {/* ── 3. The Week strip ── */}
        <div style={{ marginLeft: -22, marginRight: -22, marginBottom: 24 }}>
          <div style={{
            display: 'flex', gap: 8, padding: '4px 22px',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none', msOverflowStyle: 'none',
          }}>
            {[
              { d: 'Tue', n: '27', label: 'today', amt: '$13', mood: 'now' },
              { d: 'Wed', n: '28', label: 'CitiBike renews', amt: '$19.95', mood: 'watch' },
              { d: 'Thu', n: '29', label: 'Rent posts', amt: '−$370', mood: 'big' },
              { d: 'Fri', n: '30', label: 'Paycheck', amt: '+$612', mood: 'good' },
              { d: 'Sat', n: '01', label: 'Concert?', amt: '$90', mood: 'maybe' },
            ].map((day, i) => <BTDayCard key={i} {...day} t={t}/>)}
          </div>
        </div>

        {/* ── 4. Tilly Learned ── */}
        <div style={{
          background: t.surface, borderRadius: 18, padding: '16px 18px',
          border: `1px solid ${t.ink}10`, marginBottom: 18,
          boxShadow: `0 8px 24px ${t.ink}08`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.bg, fontSize: 11, fontWeight: 700 }}>✦</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.accent, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>Tilly learned</div>
            <div style={{ flex: 1 }}/>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: t.inkMute }}>this week</div>
          </div>
          <BTSerif size={20} style={{ display: 'block', color: t.ink, lineHeight: 1.32, marginBottom: 10 }}>
            You spend 2× more on Wednesdays. Six weeks running.
          </BTSerif>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.inkSoft, lineHeight: 1.45, marginBottom: 14 }}>
            Always between class — coffee, then DoorDash by 7. Want me to remind you Tuesday night to pack lunch?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              padding: '9px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: t.ink, color: t.bg,
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
            }}>Yes, remind me</button>
            <button style={{
              padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
              background: 'transparent', color: t.ink,
              border: `1px solid ${t.ink}26`,
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
            }}>Don't worry about it</button>
          </div>
        </div>

        {/* Hero balance card */}
        <div style={{
          background: t.ink, color: t.bg,
          borderRadius: 18, padding: '22px 22px 20px',
          marginBottom: 18, position: 'relative', overflow: 'hidden',
          boxShadow: `0 10px 30px ${t.ink}30`,
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.07, pointerEvents: 'none',
            background: `repeating-linear-gradient(135deg, ${t.bg} 0 1px, transparent 1px 14px)`,
          }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: t.bg, opacity: 0.55, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Available now</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
              <BTNum size={64} style={{ color: t.bg, lineHeight: 1 }}>$412</BTNum>
              <BTNum size={26} style={{ color: t.bg, opacity: 0.45 }}>.58</BTNum>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.bg, opacity: 0.7, lineHeight: 1.45 }}>
                After Thursday rent.<br/>Friday paycheck <span style={{ color: t.accent, fontWeight: 600 }}>+$612</span>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: 999, background: t.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Instrument Serif, serif', fontSize: 22, color: t.ink,
              }}>↗</div>
            </div>
          </div>
        </div>

        {/* Two color tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <div style={{
            background: t.accentSoft, padding: '14px 14px 16px', borderRadius: 14,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🚲</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: t.ink, lineHeight: 1.25 }}>CitiBike renews tomorrow</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.ink, opacity: 0.65, marginTop: 4 }}>Used twice in 30 days</div>
            <button style={{
              marginTop: 10, padding: '6px 12px', background: t.ink, color: t.bg,
              border: 'none', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500,
            }}>Pause $19.95</button>
          </div>
          <div style={{
            background: t.surfaceAlt, padding: '14px 14px 16px', borderRadius: 14,
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✺</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: t.ink, lineHeight: 1.25 }}>Barcelona fund</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.ink, opacity: 0.65, marginTop: 4 }}>+$40 moves Friday</div>
            <div style={{ marginTop: 12, height: 4, background: `${t.ink}1a`, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: '36%', height: '100%', background: t.ink }}/>
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: t.ink, opacity: 0.55, marginTop: 5 }}>$870 / $2,400</div>
          </div>
        </div>

        {/* Tilly invite pill */}
        <div onClick={() => onNav?.('guardian')} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: t.surface, borderRadius: 999,
          cursor: 'pointer', boxShadow: `0 2px 10px ${t.ink}10`,
        }}>
          <Tilly size={26} state="idle"/>
          <div style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.inkSoft, fontStyle: 'italic' }}>
            "Anything you want to think through?"
          </div>
          <div style={{ color: t.accent, fontSize: 18, fontWeight: 500 }}>→</div>
        </div>
      </div>
      </div>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

function BTDayCard({ d, n, label, amt, mood, t }) {
  const colors = {
    now:   { bg: t.ink, fg: t.bg, accent: t.accent },
    watch: { bg: t.surface, fg: t.ink, accent: t.warn },
    big:   { bg: t.surfaceAlt, fg: t.ink, accent: t.bad },
    good:  { bg: t.accentSoft, fg: t.ink, accent: t.good },
    maybe: { bg: t.surface, fg: t.ink, accent: t.inkMute },
  }[mood];
  return (
    <div style={{
      flexShrink: 0, width: 112, padding: '12px 12px 14px',
      background: colors.bg, color: colors.fg, borderRadius: 14,
      border: `1px solid ${t.ink}10`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, opacity: 0.6, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>{d}</span>
        <BTNum size={20} style={{ color: colors.fg }}>{n}</BTNum>
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, opacity: 0.78, lineHeight: 1.3, minHeight: 28 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 5, height: 5, borderRadius: 999, background: colors.accent }}/>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>{amt}</span>
      </div>
    </div>
  );
}

function BTBriefRow({ title, body, tone, t }) {
  const dotColor = tone === 'warn' ? t.warn : tone === 'good' ? t.good : t.inkMute;
  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', alignItems: 'flex-start' }}>
      <div style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, marginTop: 9, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: t.ink }}>{title}</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}

function BTPillBtn({ children, t, primary, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
      background: primary ? t.ink : 'transparent',
      color: primary ? t.bg : t.ink,
      border: `1px solid ${primary ? t.ink : t.rule}`,
      fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. GUARDIAN — Tilly chat
// ─────────────────────────────────────────────────────────────
function BTGuardian({ t, tone, time, onNav, active = 'guardian' }) {
  const [draft, setDraft] = React.useState('');
  const [thinking, setThinking] = React.useState(false);
  const [msgs, setMsgs] = React.useState([
    { from: 'tilly', text: BT_TONES[tone].sample, when: '7:42 AM' },
    { from: 'me', text: 'can I afford a $90 concert ticket fri?', when: '7:43 AM' },
    { from: 'tilly', kind: 'analysis' },
  ]);

  const send = () => {
    if (!draft.trim()) return;
    setMsgs(m => [...m, { from: 'me', text: draft, when: 'now' }]);
    setDraft('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMsgs(m => [...m, { from: 'tilly', text: 'Honestly? Yes — but only because you skipped takeout twice this week. Want me to move it from your spending money, not from Barcelona?', when: 'now' }]);
    }, 1100);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink }}>
      {/* header */}
      <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${t.rule}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tilly size={36} state={thinking ? 'think' : 'idle'} />
        <div style={{ flex: 1 }}>
          <BTSerif size={22} style={{ color: t.ink, display: 'block' }}>Tilly</BTSerif>
          <BTLabel style={{ color: t.inkSoft }}>{BT_TONES[tone].voice}</BTLabel>
        </div>
        <button style={{
          background: 'transparent', border: `1px solid ${t.rule}`, borderRadius: 999,
          padding: '6px 10px', cursor: 'pointer', color: t.inkSoft,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>memory</button>
      </div>

      {/* chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 12px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <BTLabel style={{ color: t.inkMute }}>{BT_TIMES[time].stamp}</BTLabel>
        </div>
        {msgs.map((m, i) => <BTMsg key={i} m={m} t={t} />)}
        {thinking && <BTMsg m={{ from: 'tilly', kind: 'typing' }} t={t} />}

        {/* suggested quick prompts */}
        {!thinking && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <BTLabel style={{ color: t.inkMute, marginBottom: 4 }}>Try asking</BTLabel>
            {[
              'split groceries with priya',
              "what's killing my budget?",
              'is this $90 ticket okay?',
              'help me think about my first credit card',
            ].map((s, i) => (
              <button key={i} onClick={() => setDraft(s)} style={{
                textAlign: 'left', background: 'transparent',
                border: `1px solid ${t.rule}`, borderRadius: 12,
                padding: '10px 12px', cursor: 'pointer', color: t.ink,
                fontFamily: 'Inter, sans-serif', fontSize: 13,
              }}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div style={{ borderTop: `1px solid ${t.rule}`, padding: 12, display: 'flex', gap: 8, background: t.surface }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="ask Tilly anything…"
          style={{
            flex: 1, background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 999,
            padding: '10px 14px', fontFamily: 'Inter, sans-serif', fontSize: 13,
            color: t.ink, outline: 'none',
          }}/>
        <button onClick={send} style={{
          width: 38, height: 38, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: t.ink, color: t.bg, fontSize: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>↑</button>
      </div>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

function BTMsg({ m, t }) {
  if (m.from === 'me') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div style={{
          maxWidth: '78%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px',
          background: t.ink, color: t.bg, fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.4,
        }}>{m.text}</div>
      </div>
    );
  }
  if (m.kind === 'typing') {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
        <Tilly size={26} state="think"/>
        <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: t.surface, border: `1px solid ${t.rule}`, display: 'flex', gap: 4 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: 999, background: t.inkSoft, animation: `tilly-dot 1.2s ${i*0.18}s infinite` }}/>)}
        </div>
      </div>
    );
  }
  if (m.kind === 'analysis') {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
        <Tilly size={26} state="idle" style={{ marginTop: 4 }}/>
        <div style={{
          flex: 1, maxWidth: '88%', padding: 14,
          background: t.surface, border: `1px solid ${t.rule}`, borderRadius: '14px 14px 14px 4px',
        }}>
          <BTLabel style={{ color: t.inkSoft }}>Quick math</BTLabel>
          <div style={{ marginTop: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.7, color: t.ink }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Available Fri after rent</span><span>$412.58</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Concert ticket</span><span style={{ color: t.bad }}>−$90.00</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Weekend food (est)</span><span style={{ color: t.bad }}>−$60.00</span></div>
            <div style={{ height: 1, background: t.rule, margin: '6px 0' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>Buffer left</span><span style={{ color: t.good }}>$262.58</span></div>
          </div>
          <div style={{ marginTop: 10, fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.ink, lineHeight: 1.45 }}>
            You can do it. The risk isn’t the ticket — it’s the post-concert dinner. Want me to set a $30 ceiling on Friday night food?
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
      <Tilly size={26} state="idle"/>
      <div style={{
        maxWidth: '78%', padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
        background: t.surface, border: `1px solid ${t.rule}`,
        fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.45, color: t.ink,
      }}>{m.text}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. SPENDING — pattern of the week, soft spots, paycheck shimmer
// ─────────────────────────────────────────────────────────────
function BTSpending({ t, tone, time, onNav, active = 'spend' }) {
  const days = [
    { d: 'M', amt: 24, mood: 'normal' },
    { d: 'T', amt: 8,  mood: 'low' },
    { d: 'W', amt: 41, mood: 'soft' },
    { d: 'T', amt: 6,  mood: 'low' },
    { d: 'F', amt: 38, mood: 'soft' },
    { d: 'S', amt: 18, mood: 'normal' },
    { d: 'S', amt: 13, mood: 'today' },
  ];
  const max = 50;
  const cats = [
    { name: 'Coffee',     amt: 32, soft: true,  c: t.accent,         note: 'Wednesdays especially' },
    { name: 'Late food',  amt: 41, soft: true,  c: t.accent2 || t.bad, note: 'Always after 9pm' },
    { name: 'Groceries',  amt: 28, soft: false, c: t.good,           note: 'Trader Joe haul Sunday' },
    { name: 'Transit',    amt: 24, soft: false, c: t.inkSoft,        note: 'Subway + that one Uber' },
    { name: 'School',     amt: 23, soft: false, c: t.warn,           note: 'Pearson eText' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero — paycheck shimmer banner */}
        <div style={{
          margin: '20px 20px 0', padding: '14px 16px', borderRadius: 14, position: 'relative', overflow: 'hidden',
          background: `linear-gradient(110deg, ${t.accent} 0%, ${t.accent2 || t.accent} 100%)`,
          color: t.bg,
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(110deg, transparent 30%, ${t.bg}66 50%, transparent 70%)`,
            backgroundSize: '200% 100%',
            animation: 'btShimmer 3.2s linear infinite',
            pointerEvents: 'none',
          }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>✦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, opacity: 0.85, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Friday lands</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600 }}>Paycheck +$612 · in 2 days</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 22px 8px' }}>
          {/* Pattern story */}
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>This week's pattern</div>
          <BTSerif size={28} style={{ display: 'block', color: t.ink, lineHeight: 1.22, marginBottom: 14 }}>
            $148 spent. <em style={{ color: t.accent }}>Wednesdays</em> are still your soft spot.
          </BTSerif>
        </div>

        {/* Tactile time horizon */}
        <div style={{ padding: '4px 22px 22px' }}>
          <div style={{ display: 'flex', gap: 6, height: 80, alignItems: 'flex-end' }}>
            {days.map((day, i) => {
              const h = (day.amt / max) * 100;
              const isToday = day.mood === 'today';
              const isSoft = day.mood === 'soft';
              const bar = isToday ? t.accent : isSoft ? t.accent2 || t.accent : `${t.ink}33`;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: t.inkMute, fontWeight: 600 }}>${day.amt}</div>
                  <div style={{
                    width: '100%', height: `${h}%`, minHeight: 4, borderRadius: 4,
                    background: bar,
                    boxShadow: isToday ? `0 0 0 3px ${t.accent}33` : 'none',
                    transition: 'all 0.4s ease',
                  }}/>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: isToday ? t.accent : t.inkMute, fontWeight: isToday ? 700 : 500, letterSpacing: '0.05em' }}>{day.d}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Soft spots — emotional categories */}
        <div style={{ padding: '4px 22px 14px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Where it goes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cats.map((c, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderRadius: 12,
                background: c.soft ? `${c.c}1f` : t.surface,
                border: `1px solid ${c.soft ? `${c.c}40` : t.ink + '10'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 8, height: 36, borderRadius: 999, background: c.c }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: t.ink }}>{c.name}</span>
                    {c.soft && <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: c.c, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>soft spot</span>}
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkSoft, marginTop: 2 }}>{c.note}</div>
                </div>
                <BTNum size={20} style={{ color: t.ink }}>${c.amt}</BTNum>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions — minimal */}
        <div style={{ padding: '8px 22px 100px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Today</div>
          {BT_DATA.recent.filter(r => r.tag === 'today').map(r => <BTLedgerRow key={r.id} r={r} t={t}/>)}
        </div>
      </div>

      <button style={{
        position: 'absolute', right: 20, bottom: 92, zIndex: 5,
        width: 56, height: 56, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: t.accent, color: t.bg,
        fontFamily: 'Instrument Serif, serif', fontSize: 28, lineHeight: 1,
        boxShadow: `0 8px 24px ${t.accent}66`,
      }}>+</button>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

function BTLedgerRow({ r, t }) {
  const negative = r.amt > 0 && !r.incoming;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: `1px solid ${t.rule}22`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 4,
        background: t.chip, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Instrument Serif, serif', fontSize: 16, color: t.ink,
      }}>{r.who.charAt(0)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: t.ink, fontWeight: 500 }}>{r.who}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <BTLabel style={{ color: t.inkMute }}>{r.cat}</BTLabel>
          {r.flag && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: t.warn, textTransform: 'uppercase', letterSpacing: '0.08em' }}>· flagged</span>}
          {r.tag === 'sub' && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: t.inkMute, textTransform: 'uppercase', letterSpacing: '0.08em' }}>· subscription</span>}
        </div>
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
        color: r.incoming ? t.good : t.ink, fontVariantNumeric: 'tabular-nums',
      }}>
        {r.incoming ? '+' : negative ? '−' : ''}${Math.abs(r.amt).toFixed(2)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. CREDIT — the one number, contextual
// ─────────────────────────────────────────────────────────────
function BTCredit({ t, tone, time, onNav, active = 'profile' }) {
  const utilPct = 38;
  const targetPct = 30;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Why this matters today */}
        <div style={{ padding: '20px 22px 0' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.accent, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✦</span><span>Why this matters today</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
            <Tilly size={32} state="idle" style={{ flexShrink: 0, marginTop: 2 }}/>
            <BTSerif size={22} style={{ display: 'block', color: t.ink, lineHeight: 1.28 }}>
              You're at <em style={{ color: t.accent }}>38%</em> of your limit. Lenders want under 30. Pay $50 today and you're there.
            </BTSerif>
          </div>
        </div>

        {/* The one number — utilization gauge */}
        <div style={{
          margin: '0 22px 18px', padding: '24px 22px', borderRadius: 18,
          background: t.surface, border: `1px solid ${t.ink}10`,
          boxShadow: `0 8px 24px ${t.ink}08`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Utilization</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkSoft }}>$190 of $500</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
            <BTNum size={72} style={{ color: t.bad, lineHeight: 1 }}>{utilPct}</BTNum>
            <BTNum size={28} style={{ color: t.bad, opacity: 0.6 }}>%</BTNum>
            <div style={{ flex: 1 }}/>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkSoft, textAlign: 'right' }}>aim for<br/><span style={{ color: t.good, fontWeight: 700 }}>{targetPct}%</span></div>
          </div>
          {/* moving gauge */}
          <div style={{ position: 'relative', height: 10, background: `${t.ink}10`, borderRadius: 999, overflow: 'visible' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${utilPct}%`,
              background: `linear-gradient(90deg, ${t.good} 0%, ${t.warn} ${(targetPct/utilPct)*100}%, ${t.bad} 100%)`,
              borderRadius: 999,
              transition: 'width 0.6s ease',
            }}/>
            {/* target marker */}
            <div style={{
              position: 'absolute', left: `${targetPct}%`, top: -4, bottom: -4, width: 2,
              background: t.ink, borderRadius: 1,
            }}/>
            <div style={{ position: 'absolute', left: `calc(${targetPct}% - 16px)`, top: -22, fontFamily: 'Inter, sans-serif', fontSize: 9, color: t.ink, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>target</div>
          </div>
          <button style={{
            marginTop: 18, padding: '11px 16px', width: '100%',
            background: t.ink, color: t.bg, border: 'none', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
          }}>Pay $50 now → drop to 28%</button>
        </div>

        {/* Score */}
        <div style={{ margin: '0 22px 18px', padding: '20px 22px', borderRadius: 18, background: t.ink, color: t.bg, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg, ${t.bg} 0 1px, transparent 1px 14px)`, opacity: 0.07 }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, opacity: 0.6, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>VantageScore</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <BTNum size={56} style={{ color: t.bg, lineHeight: 1 }}>704</BTNum>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.accent, fontWeight: 700 }}>+12</span>
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, opacity: 0.7, marginTop: 4 }}>since March · good</div>
            </div>
          </div>
        </div>

        {/* Factors */}
        <div style={{ padding: '0 22px 18px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Levers</div>
          {[
            { f: 'Payment history', v: '100%', tone: 'good',    note: 'Never late. Keep autopay on.' },
            { f: 'Account age',     v: '14mo', tone: 'neutral', note: "Don't close your sophomore card." },
            { f: 'Hard inquiries',  v: '1',    tone: 'neutral', note: 'Drops off in 23 months.' },
          ].map((f, i) => (
            <div key={i} style={{
              padding: '12px 14px', marginBottom: 6, borderRadius: 12,
              background: t.surface, border: `1px solid ${t.ink}10`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 6, height: 36, borderRadius: 999, background: f.tone === 'good' ? t.good : t.inkMute }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: t.ink }}>{f.f}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkSoft, marginTop: 2 }}>{f.note}</div>
              </div>
              <BTNum size={18} style={{ color: t.ink }}>{f.v}</BTNum>
            </div>
          ))}
        </div>

        {/* Tilly protected */}
        <div style={{ margin: '0 22px 24px', padding: '14px 16px', borderRadius: 14, background: t.accentSoft, color: t.ink }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Tilly size={22} state="idle"/>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.ink, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>Tilly protected you · 24h</div>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.ink, lineHeight: 1.5 }}>
            Blocked one phishing text pretending to be Chase. Flagged a free trial converting in 4 days.
          </div>
        </div>

      </div>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. DREAMS — goal portraits with depth + milestone shimmer
// ─────────────────────────────────────────────────────────────
function BTDreams({ t, tone, time, onNav, active = 'dreams' }) {
  // Dream visual identity — gradients + emoji per dream
  const visuals = {
    abroad: { grad: ['#E94B3C', '#F59E0B'], glyph: '✺', label: 'Barcelona spring', loc: 'Spain · 14 days' },
    laptop: { grad: ['#6B5BD2', '#3F4DB8'], glyph: '◇', label: 'New laptop',       loc: 'M4 Pro · 14"' },
    safety: { grad: ['#2D7A5F', '#4FB283'], glyph: '◉', label: 'Emergency cushion',loc: '3 months rent' },
  };
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '24px 22px 14px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>What you're building</div>
          <BTSerif size={32} style={{ display: 'block', color: t.ink, lineHeight: 1.18, marginBottom: 10 }}>
            <em style={{ color: t.accent }}>$2,462</em> set aside this year. About $4.20 a day.
          </BTSerif>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.inkSoft, lineHeight: 1.5 }}>
            Tilly auto-moves it after every paycheck — you don't have to remember.
          </div>
        </div>

        {/* Goal portraits */}
        <div style={{ padding: '8px 22px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {BT_DATA.dreams.map((d, i) => {
            const pct = Math.round((d.saved / d.target) * 100);
            const v = visuals[d.id] || visuals.abroad;
            const milestones = [25, 50, 75, 100];
            const justCrossed = milestones.find(m => pct >= m && pct < m + 8);
            return (
              <div key={d.id} style={{
                borderRadius: 18, overflow: 'hidden', position: 'relative',
                boxShadow: `0 8px 28px ${t.ink}1f`,
                border: `1px solid ${t.ink}10`,
                background: t.surface,
              }}>
                {/* Portrait header */}
                <div style={{
                  position: 'relative', height: 132, padding: '18px 18px 0',
                  background: `linear-gradient(135deg, ${v.grad[0]} 0%, ${v.grad[1]} 100%)`,
                  color: '#fff', overflow: 'hidden',
                }}>
                  {/* texture */}
                  <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 12px)`, opacity: 0.08 }}/>
                  {/* shimmer if just crossed */}
                  {justCrossed && (
                    <div style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
                      backgroundSize: '200% 100%',
                      animation: 'btShimmer 2.4s linear infinite',
                    }}/>
                  )}
                  {/* big glyph */}
                  <div style={{
                    position: 'absolute', right: -10, bottom: -20, fontSize: 160, lineHeight: 1,
                    color: '#fff', opacity: 0.18, fontFamily: 'Instrument Serif, serif',
                  }}>{v.glyph}</div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, opacity: 0.8, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>{v.loc}</div>
                    <BTSerif size={32} style={{ display: 'block', color: '#fff', marginTop: 8, lineHeight: 1.05 }}>{v.label}</BTSerif>
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '16px 18px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <BTNum size={28} style={{ color: t.ink, lineHeight: 1 }}>${d.saved.toLocaleString()}</BTNum>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.inkSoft }}>of ${d.target.toLocaleString()}</span>
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: justCrossed ? t.accent : `${t.ink}10`,
                      color: justCrossed ? t.bg : t.ink,
                      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                    }}>{pct}%</div>
                  </div>

                  {/* Milestone track */}
                  <div style={{ position: 'relative', height: 6, marginBottom: 10 }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 2, height: 2, background: `${t.ink}1a`, borderRadius: 999 }}/>
                    <div style={{
                      position: 'absolute', left: 0, top: 2, height: 2, width: `${pct}%`, borderRadius: 999,
                      background: `linear-gradient(90deg, ${v.grad[0]}, ${v.grad[1]})`,
                    }}/>
                    {milestones.map(m => {
                      const reached = pct >= m;
                      const justHit = m === justCrossed;
                      return (
                        <div key={m} style={{
                          position: 'absolute', left: `calc(${m}% - 6px)`, top: -3,
                          width: 12, height: 12, borderRadius: 999,
                          background: reached ? v.grad[1] : t.bg,
                          border: `2px solid ${reached ? v.grad[1] : `${t.ink}33`}`,
                          boxShadow: justHit ? `0 0 0 6px ${v.grad[1]}33` : 'none',
                          animation: justHit ? 'btPulse 1.6s ease-out infinite' : 'none',
                        }}/>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter, sans-serif', fontSize: 10, color: t.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                    <span>+$40 / wk auto</span>
                    <span>→ {d.due}</span>
                  </div>

                  {/* Tilly nudge */}
                  {i === 0 && (
                    <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: t.accentSoft, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Tilly size={22} state="idle"/>
                      <div style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.ink, lineHeight: 1.45 }}>
                        Skip two takeout meals a week and Barcelona arrives <strong>Feb 18</strong> instead of March 5.
                      </div>
                    </div>
                  )}
                  {i === 1 && justCrossed && (
                    <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: `${v.grad[1]}1f`, color: t.ink, fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>✦</span>
                      <span>You just crossed <strong>{justCrossed}%</strong>. Three more paychecks and it's yours.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add */}
          <button style={{
            marginTop: 4, padding: '20px', borderRadius: 18, cursor: 'pointer',
            background: 'transparent', border: `1.5px dashed ${t.ink}33`,
            fontFamily: 'Instrument Serif, serif', fontSize: 18, color: t.inkSoft,
          }}>+ Name a new dream</button>
        </div>
      </div>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. PROFILE — Tilly's relationship surface
// ─────────────────────────────────────────────────────────────
function BTProfile({ t, tone, time, onNav, active = 'profile' }) {
  const [livePreviewTone, setLivePreviewTone] = React.useState(tone);
  const memories = [
    { when: 'Today',    text: 'You skipped DoorDash twice this week. I noticed — that\'s real.' },
    { when: 'Apr 18',   text: 'You were anxious about rent on the 14th. We made it.' },
    { when: 'Mar 02',   text: 'You named "Barcelona" a dream. I started moving $40 every Friday.' },
    { when: 'Feb 11',   text: 'First credit card. We agreed: utilization stays under 30%.' },
    { when: 'Aug 2025', text: 'You said money makes you anxious. I said okay, slow.' },
  ];
  const trusted = [
    { name: 'Mom',    role: 'sees credit + dreams',   color: t.accent },
    { name: 'Priya',  role: 'splits — groceries, rent', color: t.accent2 || t.good },
    { name: 'Jordan', role: 'splits — concerts, gas',   color: t.warn },
  ];
  const previewSamples = {
    sibling:    "Hey. Rent's covered. You've got $312 of breathing room — doable, just tight if takeout twice this week.",
    coach:      "Two no-spend days down. Let's make it three. Coffee at home tomorrow puts you back in the green.",
    protective: "Three subscriptions you haven't touched in 60 days. Nothing urgent. Just want you to know.",
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.bg, color: t.ink }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero — you and Tilly */}
        <div style={{ padding: '32px 22px 24px', textAlign: 'center', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            width: 240, height: 240, borderRadius: 999,
            background: `radial-gradient(circle, ${t.accent}33 0%, ${t.accent}00 70%)`,
            pointerEvents: 'none', zIndex: 0,
          }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 999,
                background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 14px ${t.ink}1f`,
              }}>
                <BTSerif size={32} style={{ color: t.ink }}>{BT_DATA.user.name.charAt(0)}</BTSerif>
              </div>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 26, color: t.inkMute, lineHeight: 1 }}>+</div>
              <div style={{ animation: 'btBreathe 4s ease-in-out infinite' }}>
                <Tilly size={56} state="idle"/>
              </div>
            </div>
            <BTSerif size={24} style={{ display: 'block', color: t.ink, marginBottom: 4 }}>{BT_DATA.user.name} & Tilly</BTSerif>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.inkSoft }}>247 days · NYU Junior</div>
          </div>
        </div>

        {/* Tone tuner with live preview */}
        <div style={{ margin: '0 22px 22px', padding: '18px 18px 16px', borderRadius: 18, background: t.surface, border: `1px solid ${t.ink}10` }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>How Tilly talks to you</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
            {Object.keys(BT_TONES).map(k => {
              const isActive = livePreviewTone === k;
              return (
                <button key={k} onClick={() => setLivePreviewTone(k)} style={{
                  padding: '8px 6px', borderRadius: 10, cursor: 'pointer',
                  background: isActive ? t.ink : 'transparent',
                  color: isActive ? t.bg : t.ink,
                  border: `1px solid ${isActive ? t.ink : t.ink + '22'}`,
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600,
                }}>{BT_TONES[k].name}</button>
              );
            })}
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 12, background: t.bg,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            border: `1px solid ${t.ink}14`,
          }}>
            <Tilly size={22} state="idle" style={{ flexShrink: 0, marginTop: 2 }}/>
            <div style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.ink, lineHeight: 1.5, fontStyle: 'italic' }}>
              "{previewSamples[livePreviewTone]}"
            </div>
          </div>
        </div>

        {/* What I've learned about you */}
        <div style={{ padding: '0 22px 8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>What I've learned about you</div>
          <BTSerif size={22} style={{ display: 'block', color: t.ink, marginBottom: 14, lineHeight: 1.3 }}>
            <em style={{ color: t.accent }}>Tilly's notes</em> — a quiet timeline.
          </BTSerif>
        </div>
        <div style={{ padding: '0 22px 22px', position: 'relative' }}>
          {/* timeline rail */}
          <div style={{ position: 'absolute', left: 32, top: 8, bottom: 8, width: 2, background: `${t.ink}1a` }}/>
          {memories.map((m, i) => (
            <div key={i} style={{ position: 'relative', paddingLeft: 38, paddingBottom: 16 }}>
              <div style={{
                position: 'absolute', left: 26, top: 6, width: 14, height: 14, borderRadius: 999,
                background: i === 0 ? t.accent : t.bg,
                border: `2px solid ${i === 0 ? t.accent : t.ink + '33'}`,
                boxShadow: i === 0 ? `0 0 0 5px ${t.accent}22` : 'none',
              }}/>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: t.inkMute, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{m.when}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.ink, lineHeight: 1.5, fontStyle: 'italic' }}>"{m.text}"</div>
            </div>
          ))}
        </div>

        {/* Trusted people */}
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Trusted people</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trusted.map((p, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderRadius: 14,
                background: t.surface, border: `1px solid ${t.ink}10`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                  background: `linear-gradient(135deg, ${p.color} 0%, ${p.color}88 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Instrument Serif, serif', fontSize: 18, color: '#fff',
                }}>{p.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: t.ink }}>{p.name}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkSoft, marginTop: 2 }}>{p.role}</div>
                </div>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, color: t.inkMute }}>›</span>
              </div>
            ))}
            <button style={{
              padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
              background: 'transparent', border: `1.5px dashed ${t.ink}33`,
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: t.inkSoft,
            }}>+ Invite someone you trust</button>
          </div>
        </div>

        {/* Settings — small */}
        <div style={{ padding: '0 22px 32px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: t.inkMute, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Quiet settings</div>
          {[
            ['Quiet hours', '11pm — 7am'],
            ['Big-purchase alert', '> $25'],
            ['Subscription scan', 'weekly'],
            ['Phishing watch', 'on'],
            ['Memory', 'forever — your choice'],
          ].map((row, i, a) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0', borderBottom: i < a.length - 1 ? `1px solid ${t.ink}14` : 'none',
            }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: t.ink }}>{row[0]}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: t.inkSoft }}>{row[1]} ›</span>
            </div>
          ))}
        </div>
      </div>
      <BTTabBar active={active} t={t} onNav={onNav}/>
    </div>
  );
}

Object.assign(window, { BTHome, BTGuardian, BTSpending, BTCredit, BTDreams, BTProfile, BT_DATA });
