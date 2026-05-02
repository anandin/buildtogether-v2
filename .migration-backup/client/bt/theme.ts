/**
 * BuildTogether (Tilly) — theme tokens.
 *
 * Four switchable themes per the design system (`design/bt-system.jsx`):
 * Dusk, Citrus, Bloom (default), and Neon. Each defines the full token set
 * used by the BT screens, plus a Tilly palette (body / belly / beak) for
 * the mascot.
 */
import type { Platform } from "react-native";

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
  // Bloom — soft pink ground with PURPLE accent and dark-wine bird (not
  // pink-on-pink). The orange accent2 lets the sky-portrait gradient blend
  // pink → orange → peach, the spec's signature warm sunset.
  bloom: {
    name: "bloom",
    bg: "#F6E8E6",
    surface: "#FBF1EE",
    surfaceAlt: "#EBC9C2",
    ink: "#2A1518",
    inkSoft: "#6B4148",
    inkMute: "#A88087",
    rule: "rgba(42,21,24,0.10)",
    accent: "#7A4FE0",
    accent2: "#E0664A",
    accentSoft: "#D9C9F5",
    good: "#3F8A6E",
    warn: "#C97A1F",
    bad: "#B8392E",
    chip: "rgba(42,21,24,0.06)",
    tilly: { body: "#2A1518", belly: "#F6E8E6", beak: "#7A4FE0" },
  },

  // Dusk — warm dark with cream Tilly silhouette (body=cream, belly=dark
  // interior). Orange accent + sage accent2.
  dusk: {
    name: "dusk",
    bg: "#181612",
    surface: "#221E18",
    surfaceAlt: "#2C271F",
    ink: "#F4EFE6",
    inkSoft: "#B8AE9A",
    inkMute: "#776E5E",
    rule: "rgba(244,239,230,0.12)",
    accent: "#F0934A",
    accent2: "#8FB89A",
    accentSoft: "#5A3E2A",
    good: "#9CBA86",
    warn: "#E5C25E",
    bad: "#E07560",
    chip: "rgba(244,239,230,0.06)",
    tilly: { body: "#F4EFE6", belly: "#2A2620", beak: "#F0934A" },
  },

  // Citrus — yellow paper with deep red-orange accent + forest-green
  // accent2. Tilly is dark ink against the cream background.
  citrus: {
    name: "citrus",
    bg: "#F5E9B8",
    surface: "#FBF3CC",
    surfaceAlt: "#EFD98C",
    ink: "#1F1A0E",
    inkSoft: "#5C5236",
    inkMute: "#9A8E66",
    rule: "rgba(31,26,14,0.12)",
    accent: "#D14A2C",
    accent2: "#2D5A3D",
    accentSoft: "#F4B69E",
    good: "#2D5A3D",
    warn: "#B3811F",
    bad: "#A8392B",
    chip: "rgba(31,26,14,0.06)",
    tilly: { body: "#1F1A0E", belly: "#F5E9B8", beak: "#D14A2C" },
  },

  // Neon — cool near-black with electric green accent + hot magenta
  // accent2. The "wired up" theme.
  neon: {
    name: "neon",
    bg: "#0A0B14",
    surface: "#15172A",
    surfaceAlt: "#1F2240",
    ink: "#F0F4FF",
    inkSoft: "#A8B0D4",
    inkMute: "#5C6486",
    rule: "rgba(168,176,212,0.16)",
    accent: "#00FF88",
    accent2: "#FF2EC8",
    accentSoft: "rgba(0,255,136,0.16)",
    good: "#00FF88",
    warn: "#FFD60A",
    bad: "#FF2EC8",
    chip: "rgba(168,176,212,0.10)",
    tilly: { body: "#F0F4FF", belly: "#15172A", beak: "#00FF88" },
  },
};

export const BT_DEFAULT_THEME: BTThemeKey = "bloom";

/**
 * Type ramp per spec §3 ("Type system"):
 *   Headlines & key numbers → Instrument Serif
 *   UI body                 → Inter (400/500/600/700)
 *   Mono labels & ledger    → JetBrains Mono (400/500/700)
 *
 * In React Native, `fontFamily` must reference a single loaded face.
 * `BTFonts` gives the *default* face for each role; for specific weights
 * or styles use `BTFontsByWeight` so each Text picks the correct loaded
 * font (RN does not synthesize bold/italic from a regular face).
 */
export const BTFonts = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  sans: "Inter_500Medium",
  mono: "JetBrainsMono_500Medium",
} as const;

export const BTFontsByWeight = {
  sans400: "Inter_400Regular",
  sans500: "Inter_500Medium",
  sans600: "Inter_600SemiBold",
  sans700: "Inter_700Bold",
  mono400: "JetBrainsMono_400Regular",
  mono500: "JetBrainsMono_500Medium",
  mono700: "JetBrainsMono_700Bold",
} as const;

export const BT_BREATHE_DURATION_MS = 4000;
export const BT_PULSE_DURATION_MS = 1600;
export const BT_SHIMMER_DURATION_MS = 3200;
