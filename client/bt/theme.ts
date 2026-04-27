/**
 * BuildTogether (Tilly) — theme tokens. Translated 1:1 from `bt-system.jsx`.
 *
 * Four switchable themes — **dusk · citrus · bloom · neon** — each with the
 * full token set + a Tilly palette (body / belly / beak). Bloom is the
 * default (per the source `TWEAK_DEFAULTS`).
 *
 * NOTE: the "paper" theme from earlier drafts is intentionally removed —
 * the source ships dusk/citrus/bloom/neon.
 */
export type BTTheme = {
  name: BTThemeKey;
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  inkMute: string;
  rule: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  good: string;
  warn: string;
  bad: string;
  chip: string;
  tilly: { body: string; belly: string; beak: string };
};

export type BTThemeKey = "dusk" | "citrus" | "bloom" | "neon";

export const BT_THEMES: Record<BTThemeKey, BTTheme> = {
  dusk: {
    name: "dusk",
    bg: "#181612",
    surface: "#221E18",
    surfaceAlt: "#2C271F",
    ink: "#F4EFE6",
    inkSoft: "#B8AE9A",
    inkMute: "#776E5E",
    rule: "#3A332A",
    accent: "#F0934A",
    accentSoft: "#5A3E2A",
    accent2: "#8FB89A",
    good: "#9CBA86",
    warn: "#E5C25E",
    bad: "#E07560",
    chip: "#2C271F",
    tilly: { body: "#F4EFE6", belly: "#2A2620", beak: "#F0934A" },
  },
  citrus: {
    name: "citrus",
    bg: "#F5E9B8",
    surface: "#FBF3CC",
    surfaceAlt: "#EFD98C",
    ink: "#1F1A0E",
    inkSoft: "#5C5236",
    inkMute: "#9A8E66",
    rule: "#1F1A0E",
    accent: "#D14A2C",
    accentSoft: "#F4B69E",
    accent2: "#2D5A3D",
    good: "#2D5A3D",
    warn: "#B3811F",
    bad: "#A8392B",
    chip: "#EFD98C",
    tilly: { body: "#1F1A0E", belly: "#F5E9B8", beak: "#D14A2C" },
  },
  bloom: {
    name: "bloom",
    bg: "#F6E8E6",
    surface: "#FBF1EE",
    surfaceAlt: "#EBC9C2",
    ink: "#2A1518",
    inkSoft: "#6B4148",
    inkMute: "#A88087",
    rule: "#2A1518",
    accent: "#7A4FE0", // ← purple (was wrong in earlier draft as pink)
    accentSoft: "#D9C9F5",
    accent2: "#E0664A",
    good: "#3F8A6E",
    warn: "#C97A1F",
    bad: "#B8392E",
    chip: "#EBC9C2",
    tilly: { body: "#2A1518", belly: "#F6E8E6", beak: "#7A4FE0" },
  },
  neon: {
    name: "neon",
    bg: "#0A0B14",
    surface: "#15172A",
    surfaceAlt: "#1F2240",
    ink: "#F0F4FF",
    inkSoft: "#A8B0D4",
    inkMute: "#5C6486",
    rule: "#2A2D52",
    accent: "#00FF88",
    accentSoft: "#00FF8822",
    accent2: "#FF2EC8",
    good: "#00FF88",
    warn: "#FFD60A",
    bad: "#FF2EC8",
    chip: "#1F2240",
    tilly: { body: "#F0F4FF", belly: "#15172A", beak: "#00FF88" },
  },
};

export const BT_DEFAULT_THEME: BTThemeKey = "bloom";

/**
 * Type ramp per spec §3 ("Type system"). Instrument Serif / Inter / JetBrains
 * Mono. We fall back to the platform serif/sans/mono since the fonts aren't
 * bundled — the editorial feel is best when the real fonts are loaded via
 * expo-font, but the type *ramp* still holds with fallbacks.
 */
export const BTFonts = {
  serif:
    "'Instrument Serif', 'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans:
    "Inter, Nunito, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono:
    "'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
} as const;

/** Animation durations from the source `@keyframes` block in BuildTogether.html. */
export const BT_BREATHE_DURATION_MS = 4000; // btBreathe: scale 1→1.04, ty 0→-2
export const BT_FLOAT_DURATION_MS = 4000; // btFloat: ty 0→-4
export const BT_DRIFT_DURATION_MS = 20000; // btDrift: tx 0→40
export const BT_SHIMMER_DURATION_MS = 3200; // btShimmer: bg-pos -200% → 200%
export const BT_PULSE_DURATION_MS = 1600; // btPulse: shadow + opacity
