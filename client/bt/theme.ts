/**
 * BuildTogether (Tilly) — theme tokens.
 *
 * Four switchable themes per BUILDTOGETHER_SPEC.md §3 ("Color themes").
 * Each defines the full token set used by the BT screens, plus a Tilly palette
 * (body / belly / beak) for the mascot.
 *
 * Bloom is the active default — see spec §3.
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

export type BTThemeKey = "paper" | "dusk" | "citrus" | "bloom";

export const BT_THEMES: Record<BTThemeKey, BTTheme> = {
  paper: {
    name: "paper",
    bg: "#F4EFE6",
    surface: "#FBF7EF",
    surfaceAlt: "#EFE7D7",
    ink: "#1C1A17",
    inkSoft: "#4A4640",
    inkMute: "#8A8378",
    rule: "rgba(28,26,23,0.10)",
    accent: "#D8602B",
    accent2: "#7B5A3A",
    accentSoft: "#F0DAC6",
    good: "#1F7A4A",
    warn: "#C68A2A",
    bad: "#B23A2C",
    chip: "rgba(28,26,23,0.06)",
    tilly: { body: "#D8602B", belly: "#F4EFE6", beak: "#1C1A17" },
  },
  dusk: {
    name: "dusk",
    bg: "#181612",
    surface: "#23201A",
    surfaceAlt: "#2C2820",
    ink: "#F2EBDD",
    inkSoft: "#B8AE9A",
    inkMute: "#7C7363",
    rule: "rgba(242,235,221,0.12)",
    accent: "#F0934A",
    accent2: "#E0B380",
    accentSoft: "rgba(240,147,74,0.20)",
    good: "#7DC596",
    warn: "#E8C275",
    bad: "#E68A78",
    chip: "rgba(242,235,221,0.08)",
    tilly: { body: "#F0934A", belly: "#3A332A", beak: "#F2EBDD" },
  },
  citrus: {
    name: "citrus",
    bg: "#F5E9B8",
    surface: "#FBF3CB",
    surfaceAlt: "#F0DE9A",
    ink: "#22180B",
    inkSoft: "#5A4520",
    inkMute: "#8B7440",
    rule: "rgba(34,24,11,0.12)",
    accent: "#D14A2C",
    accent2: "#E07F3A",
    accentSoft: "#F3CFA8",
    good: "#2E7B3F",
    warn: "#C58A1A",
    bad: "#A6321F",
    chip: "rgba(34,24,11,0.08)",
    tilly: { body: "#D14A2C", belly: "#F5E9B8", beak: "#22180B" },
  },
  bloom: {
    name: "bloom",
    bg: "#F6E8E6",
    surface: "#FCF3F1",
    surfaceAlt: "#EFD6D2",
    ink: "#2A1A1C",
    inkSoft: "#6B4A4D",
    inkMute: "#A1838A",
    rule: "rgba(42,26,28,0.10)",
    accent: "#C3416B",
    accent2: "#D89180",
    accentSoft: "#F1CFD4",
    good: "#3F8770",
    warn: "#D08A2A",
    bad: "#B24050",
    chip: "rgba(42,26,28,0.06)",
    tilly: { body: "#C3416B", belly: "#FCF3F1", beak: "#2A1A1C" },
  },
};

export const BT_DEFAULT_THEME: BTThemeKey = "bloom";

/**
 * Type ramp per spec §3 ("Type system").
 * Headlines/key numbers — Instrument Serif.
 * UI body — Inter (mapped to system default; Inter font isn't bundled, so we
 * fall back to the platform sans).
 * Mono labels — JetBrains Mono (mapped to platform mono).
 */
export const BTFonts = {
  serif:
    "Georgia, 'Iowan Old Style', 'Apple Garamond', 'Times New Roman', serif",
  sans:
    "Nunito, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono:
    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
} as const;

/** Gentle 4s breathing curve used for Tilly + mascot halos. */
export const BT_BREATHE_DURATION_MS = 4000;
/** Active milestone pulse + most-recent-memory dot. */
export const BT_PULSE_DURATION_MS = 1600;
/** Paycheck banner + dream milestone shimmer. */
export const BT_SHIMMER_DURATION_MS = 3200;
