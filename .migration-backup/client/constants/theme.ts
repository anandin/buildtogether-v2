import { Platform } from "react-native";

// WCAG AA Compliant Color Palette
// Trust-focused purple primary with warm accents - signals stability for finance
export const AppColors = {
  // Primary colors - purple for trust and stability (finance-appropriate)
  primary: "#7C3AED",           // Vibrant purple (5:1 on white)
  primaryLight: "#EDE9FE",      // Soft violet (backgrounds only)
  primaryDark: "#5B21B6",       // Deep purple for emphasis
  
  // Accent colors - warm coral for partnership/warmth
  accent: "#F97316",            // Warm orange for secondary actions
  accentLight: "#FFEDD5",       // Soft peach (backgrounds only)
  accentDark: "#C2410C",        // Deep orange for emphasis
  
  // Semantic colors - WCAG compliant
  success: "#059669",           // Emerald green (5:1 on white)
  successLight: "#D1FAE5",      // Soft green (backgrounds only)
  successDark: "#047857",       // Deep green
  
  warning: "#D97706",           // Amber (4.5:1 on white)
  warningLight: "#FEF3C7",      // Soft yellow (backgrounds only)
  warningDark: "#B45309",       // Dark amber
  
  error: "#DC2626",             // Red for destructive actions only
  errorLight: "#FEE2E2",        // Soft red (backgrounds only)
  errorDark: "#B91C1C",         // Dark red
  
  // Neutral colors
  background: "#FAFAF9",        // Warm off-white
  surface: "#FFFFFF",
  textPrimary: "#1C1917",       // Near black (15:1+ on white)
  textSecondary: "#57534E",     // Dark gray (7:1 on white)
  textTertiary: "#78716C",      // Medium gray (4.6:1 on white)
  border: "#E7E5E4",
  
  // AI/Dream Guardian colors - distinct purple tint
  aiPrimary: "#8B5CF6",         // Violet for AI features
  aiLight: "#F5F3FF",           // AI background
  aiDark: "#6D28D9",            // AI emphasis
};

const tintColorLight = AppColors.primary;
const tintColorDark = "#A78BFA";  // Light violet for dark mode

export const Colors = {
  light: {
    text: AppColors.textPrimary,
    textSecondary: AppColors.textSecondary,
    textTertiary: AppColors.textTertiary,
    buttonText: "#FFFFFF",
    tabIconDefault: AppColors.textSecondary,
    tabIconSelected: tintColorLight,
    link: AppColors.primary,
    primary: AppColors.primary,
    primaryLight: AppColors.primaryLight,
    primaryDark: AppColors.primaryDark,
    accent: AppColors.accent,
    accentLight: AppColors.accentLight,
    accentDark: AppColors.accentDark,
    success: AppColors.success,
    successLight: AppColors.successLight,
    warning: AppColors.warning,
    warningLight: AppColors.warningLight,
    error: AppColors.error,
    errorLight: AppColors.errorLight,
    border: AppColors.border,
    backgroundRoot: AppColors.background,
    backgroundDefault: AppColors.surface,
    backgroundSecondary: "#F8F4F0",
    backgroundTertiary: "#F0EBE6",
    // AI colors
    aiPrimary: AppColors.aiPrimary,
    aiLight: AppColors.aiLight,
    aiDark: AppColors.aiDark,
  },
  dark: {
    text: "#FAFAF9",
    textSecondary: "#A8A29E",
    textTertiary: "#78716C",
    buttonText: "#FFFFFF",
    tabIconDefault: "#A8A29E",
    tabIconSelected: tintColorDark,
    link: tintColorDark,
    primary: tintColorDark,
    primaryLight: "#2E1065",
    primaryDark: "#C4B5FD",
    accent: "#FB923C",
    accentLight: "#431407",
    accentDark: "#FDBA74",
    success: "#34D399",
    successLight: "#064E3B",
    warning: "#FBBF24",
    warningLight: "#451A03",
    error: "#F87171",
    errorLight: "#450A0A",
    border: "#44403C",
    backgroundRoot: "#1C1917",
    backgroundDefault: "#292524",
    backgroundSecondary: "#44403C",
    backgroundTertiary: "#57534E",
    // AI colors
    aiPrimary: "#A78BFA",
    aiLight: "#2E1065",
    aiDark: "#C4B5FD",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  hero: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  tiny: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  floatingButton: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 4,
  },
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "Nunito, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
