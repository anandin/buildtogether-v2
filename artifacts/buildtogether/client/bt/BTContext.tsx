/**
 * BTContext — holds the three Tweaks values from spec §6:
 *   - visual theme (bloom / dusk / citrus / neon)
 *   - Tilly's tone (sibling / coach / quiet)
 *   - time of day (morning / evening)
 *
 * Persisted to AsyncStorage so a chosen theme survives reloads.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  BT_DEFAULT_THEME,
  BT_THEMES,
  type BTTheme,
  type BTThemeKey,
} from "./theme";
import {
  BT_DEFAULT_TIME,
  BT_DEFAULT_TONE,
  BT_TONES,
  type BTTimeOfDay,
  type BTTone,
  type BTToneKey,
} from "./tones";

export type BTTextScale = "sm" | "md" | "lg";

/** Body-font multipliers per user-selected text size. Headlines also
 * scale a touch (~half magnitude) so the Spend $$ number doesn't blow
 * out of its card. Apply via `useBT().scale` or `useBT().s(n)`. */
export const TEXT_SCALE_MULTIPLIER: Record<BTTextScale, number> = {
  sm: 0.92,
  md: 1.0,
  lg: 1.18,
};

type BTState = {
  themeKey: BTThemeKey;
  toneKey: BTToneKey;
  time: BTTimeOfDay;
  textScale: BTTextScale;
  scale: number;
  t: BTTheme;
  tone: BTTone;
  setTheme: (k: BTThemeKey) => void;
  setTone: (k: BTToneKey) => void;
  setTime: (k: BTTimeOfDay) => void;
  setTextScale: (k: BTTextScale) => void;
  /** Multiply a base font size by the user's chosen scale. Round so
   * RN doesn't sub-pixel render. */
  s: (size: number) => number;
};

const KEY = "bt.tweaks.v1";

const BTContext = createContext<BTState | null>(null);

export function BTProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<BTThemeKey>(BT_DEFAULT_THEME);
  const [toneKey, setToneKey] = useState<BTToneKey>(BT_DEFAULT_TONE);
  const [time, setTimeState] = useState<BTTimeOfDay>(BT_DEFAULT_TIME);
  const [textScale, setTextScaleState] = useState<BTTextScale>("md");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) return;
      try {
        const v = JSON.parse(raw) as Partial<BTState>;
        if (v.themeKey && v.themeKey in BT_THEMES) setThemeKey(v.themeKey);
        if (v.toneKey && v.toneKey in BT_TONES) setToneKey(v.toneKey);
        if (v.time === "morning" || v.time === "evening") setTimeState(v.time);
        if (v.textScale === "sm" || v.textScale === "md" || v.textScale === "lg") {
          setTextScaleState(v.textScale);
        }
      } catch {}
    });
  }, []);

  const persist = (next: Partial<BTState>) => {
    const merged = {
      themeKey: next.themeKey ?? themeKey,
      toneKey: next.toneKey ?? toneKey,
      time: next.time ?? time,
      textScale: next.textScale ?? textScale,
    };
    AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
  };

  const scale = TEXT_SCALE_MULTIPLIER[textScale];

  const value = useMemo<BTState>(
    () => ({
      themeKey,
      toneKey,
      time,
      textScale,
      scale,
      t: BT_THEMES[themeKey],
      tone: BT_TONES[toneKey],
      setTheme: (k) => {
        setThemeKey(k);
        persist({ themeKey: k });
      },
      setTone: (k) => {
        setToneKey(k);
        persist({ toneKey: k });
      },
      setTime: (k) => {
        setTimeState(k);
        persist({ time: k });
      },
      setTextScale: (k) => {
        setTextScaleState(k);
        persist({ textScale: k });
      },
      s: (size: number) => Math.round(size * scale),
    }),
    // persist captures themeKey/toneKey/time/textScale via closure each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeKey, toneKey, time, textScale],
  );

  return <BTContext.Provider value={value}>{children}</BTContext.Provider>;
}

export function useBT(): BTState {
  const v = useContext(BTContext);
  if (!v) throw new Error("useBT must be used within <BTProvider>");
  return v;
}
