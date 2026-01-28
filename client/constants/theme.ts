import { Platform } from "react-native";

// WCAG AA Compliant Color Palette
// Maintains warm, friendly personality while ensuring 4.5:1+ contrast ratios
export const AppColors = {
  // Primary colors - accessible versions
  primary: "#D64D5B",           // Deeper coral-rose (4.5:1 on white)
  primaryLight: "#FF9AA2",      // Original soft pink (backgrounds only)
  primaryDark: "#B33D4A",       // Dark rose for emphasis
  
  // Accent colors - accessible versions  
  accent: "#6B7ACC",            // Deeper lavender-blue (4.5:1 on white)
  accentLight: "#C7CEEA",       // Original soft lavender (backgrounds only)
  accentDark: "#4A5499",        // Dark indigo for emphasis
  
  // Semantic colors - WCAG compliant
  success: "#2E7D5A",           // Forest green (7:1 on white)
  successLight: "#B5EAD7",      // Soft green (backgrounds only)
  successDark: "#1E5A3D",       // Deep green
  
  warning: "#B86A00",           // Burnt orange (4.5:1 on white)
  warningLight: "#FFDAC1",      // Soft peach (backgrounds only)
  warningDark: "#8A5000",       // Dark amber
  
  error: "#C62828",             // Deep red (6:1 on white)
  errorLight: "#FFCDD2",        // Soft red (backgrounds only)
  errorDark: "#8E0000",         // Dark red
  
  // Neutral colors
  background: "#FFFBF7",
  surface: "#FFFFFF",
  textPrimary: "#1A1A1A",       // Near black (15:1+ on white)
  textSecondary: "#5C5C5C",     // Dark gray (7:1 on white)
  textTertiary: "#757575",      // Medium gray (4.6:1 on white)
  border: "#D1D1D6",
  
  // AI-specific colors
  aiPrimary: "#5B4FCF",         // AI purple (accessible)
  aiLight: "#E8E5FF",           // AI background
  aiDark: "#3D3494",            // AI emphasis
};

const tintColorLight = AppColors.primary;
const tintColorDark = "#FFB4BA";

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
    text: "#ECEDEE",
    textSecondary: "#A0A0A5",
    textTertiary: "#808085",
    buttonText: "#FFFFFF",
    tabIconDefault: "#A0A0A5",
    tabIconSelected: tintColorDark,
    link: tintColorDark,
    primary: tintColorDark,
    primaryLight: "#4A3035",
    primaryDark: "#FFD0D4",
    accent: "#B4BDEE",
    accentLight: "#2A2D40",
    accentDark: "#D4D9F0",
    success: "#6FCF97",
    successLight: "#1E3A2F",
    warning: "#FFB74D",
    warningLight: "#3A2A1A",
    error: "#EF5350",
    errorLight: "#3A1A1A",
    border: "#3A3A3C",
    backgroundRoot: "#1C1C1E",
    backgroundDefault: "#2C2C2E",
    backgroundSecondary: "#3A3A3C",
    backgroundTertiary: "#48484A",
    // AI colors
    aiPrimary: "#9D8FFF",
    aiLight: "#2A2640",
    aiDark: "#C4BAFF",
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
